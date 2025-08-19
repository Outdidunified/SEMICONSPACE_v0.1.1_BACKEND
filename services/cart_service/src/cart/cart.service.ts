// cart.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { CartItem } from './cart-item.entity';
import { RedisService } from '../redis/redis.service';
import { ClientKafka } from '@nestjs/microservices';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,
    private readonly redisService: RedisService,
    private readonly httpService: HttpService,
    @Inject('KAFKA_SERVICE')
    private readonly kafkaClient: ClientKafka,
  ) {}

  // Centralized response helpers aligned with GlobalErrorFilter shape
  private respond(
    statusCode: 200 | 402 | 404 | 500,
    message: any,
    data?: Record<string, any>,
  ) {
    if (statusCode === 200) {
      // Success: always HTTP 200 at controller, and DO NOT include statusCode in body
      return { success: true, message, data: data ?? undefined };
    }
    // Error: controller will throw with this statusCode; body should not include data/statusCode
    return { success: false, message, statusCode } as any;
  }

  private handleCatch(error: any, fallbackMessage = 'Internal server error') {
    console.error(`❌ ${fallbackMessage}:`, error?.message || error);
    return this.respond(500, fallbackMessage);
  }

  async handleAddToCart(body: {
    userId: string;
    productId: string;
    quantity: number;
    price: number;
    packageType?: string;
  }): Promise<{ error: boolean; message: any; data: Record<string, any>; statusCode?: number }> {
    try {
      const { userId, productId, quantity, price: userPrice, packageType } = body;
      const redis = this.redisService.getClient();
      const redisKey = `cart:${userId}`;
      const productIdKey = productId;

      if (!userId || !productId || typeof quantity !== 'number' || quantity < 0) {
        return this.respond(402, 'Invalid input. userId, productId and non-negative quantity are required');
      }

      if (quantity === 0) {
        return await this.handleRemoveFromCart(userId, productIdKey);
      }

      const externalUrl = `http://172.232.110.10:8003/product/quantity-price/check/${productId}/${quantity}`;
      
      let response;
      try {
        response = await firstValueFrom(
          this.httpService.get(externalUrl).pipe(
            catchError((error) => {
              console.error('❌ Product service error:', error.message);
              if (error.response?.status === 404) {
                return of({ data: { product: null, error: true, message: 'Product not found' } });
              }
              return of({ data: { product: null, error: true, message: 'Product service unavailable' } });
            }),
          ),
        );
      } catch (error: any) {
        return this.respond(500, 'Failed to fetch product details');
      }

      const responseData = response.data;
      const product = responseData?.product || responseData?.data?.product;

      if (!product || responseData?.error) {
        const message = responseData?.message || 'Product not found';
        return this.respond(404, message);
      }

      const now = new Date();
      const cartItemData: DeepPartial<CartItem> = {
        userId,
        productId: product.semicon_part_number || productId,
        quantity,
        name: product.name || '',
        price: userPrice,
        packageType: packageType,
        description: product.description || '',
        manufacturerName: product.manufacturer_name || '',
        manufacturerPartNumber: product.manufacturer_part_number || '',
        datasheetUrl: product.datasheet_url || '',
        imageUrl: product.image_url || '',
        createdBy: userId,
        modifiedBy: userId,
        createdDate: now,
        modifiedDate: now,
        status: product.status ?? true,
      };

      await redis.hSet(redisKey, productIdKey, JSON.stringify(cartItemData));
      await redis.expire(redisKey, 86400);

      // Do NOT write to Postgres here. Redis is the source of truth; CartSyncService will sync to Postgres.

      this.kafkaClient.emit('cart.item.added', {
        userId,
        productId,
        quantity,
        packageType,
        price: userPrice,
        status: 'success',
        message: 'Cart item added or updated',
        timestamp: now.toISOString(),
      });

      return this.respond(200, 'Item successfully added in cart', {
        userId,
        productId,
        quantity,
        packageType,
        price: userPrice,
      });
    } catch (error: any) {
      console.error('❌ Error fetching/adding product:', error?.message);
      return this.handleCatch(error, 'Internal server error');
    }
  }

  async handleGetCartItems(userId: string): Promise<{ error: boolean; message: any; data: Record<string, any>; statusCode?: number }> {
    try {
      const redis = this.redisService.getClient();
      const redisKey = `cart:${userId}`;

      if (!userId) {
        return this.respond(402, 'Invalid input. userId is required');
      }

      let cart = await redis.hGetAll(redisKey);
      let entries = Object.entries(cart);

      if (entries.length === 0) {
        // Log DB state for diagnostics if Redis is empty
        try {
          const dbCount = await this.cartRepository.count({ where: { userId } });
          console.log(`ℹ️ Redis empty for user ${userId}, DB count = ${dbCount}`);
        } catch (e) {
          console.warn(`⚠️ Failed counting DB items for user ${userId}:`, (e as any)?.message);
        }
        // Redis is the source of truth; if empty, return not found
        return this.respond(404, `No items in cart for user ${userId}`);
      }

      const items = entries.map(([productIdKey, itemJson]) => {
        const item = JSON.parse(itemJson);
        const totalPrice = (item.price ?? 0) * (item.quantity ?? 0);
        return {
          ...item,
          productId: item.productId ?? productIdKey,
          totalPrice,
        };
      });

      const cartTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

      return this.respond(200, 'Cart items fetched successfully', { items, cartTotal });
    } catch (error: any) {
      console.error('❌ Error fetching cart items:', error);
      return this.handleCatch(error, 'Failed to fetch cart items');
    }
  }

  async handleRemoveFromCart(
    userId: string,
    productId: string,
  ): Promise<{ error: boolean; message: any; data: Record<string, any>; statusCode?: number }> {
    try {
      const redis = this.redisService.getClient();
      const redisKey = `cart:${userId}`;

      if (!userId || !productId) {
        return this.respond(402, 'Invalid userId or productId');
      }

      const removalFlagKey = `cart_removal_in_progress:${userId}:${productId}`;
      await redis.setEx(removalFlagKey, 15, 'true');

      const cartItems = await redis.hGetAll(redisKey);
      let fieldToDelete: string | null = null;

      for (const [field, value] of Object.entries(cartItems)) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.productId === productId) {
            fieldToDelete = field;
            break;
          }
        } catch {}
      }

      if (!fieldToDelete) {
        // Check in Redis only; if not present, it's not in cart
        await redis.del(removalFlagKey);
        return this.respond(404, 'Product not found in cart');
      }

      const removedCount = await redis.hDel(redisKey, fieldToDelete);
      if (removedCount > 0) {
        const remainingItems = await redis.hLen(redisKey);
        if (remainingItems === 0) {
          // No more items: delete Redis key and mark DB clear needed for sync service
          await redis.del(redisKey);
          const clearSyncKey = `cart_clear_sync_needed:${userId}`;
          await redis.setEx(clearSyncKey, 60, 'true');
          console.log(`🧹 Marked DB clear needed for user ${userId} after last item removal`);
        }
      }

      // Do NOT write to Postgres here. CartSyncService will propagate Redis changes.
      await redis.del(removalFlagKey);

      this.kafkaClient.emit('cart.item.removed', {
        userId,
        productId,
        status: 'success',
        timestamp: new Date().toISOString(),
      });

      return this.respond(200, 'Item removed from cart');
    } catch (error: any) {
      const redis = this.redisService.getClient();
      const removalFlagKey = `cart_removal_in_progress:${userId}:${productId}`;
      await redis.del(removalFlagKey).catch(() => {});

      this.kafkaClient.emit('cart.item.removed.error', {
        userId,
        productId,
        status: 'error',
        error: error?.message,
        timestamp: new Date().toISOString(),
      });

      return this.handleCatch(error, 'Internal server error');
    }
  }


  async clearCart(userId: string): Promise<{ error: boolean; message: any; data: Record<string, any> }> {
    // Existing implementation remains unchanged
    const redis = this.redisService.getClient();
    const redisKey = `cart:${userId}`;

    if (!userId) {
      return this.respond(402, 'Invalid userId');
    }

    try {
      const clearFlagKey = `cart_clear_in_progress:${userId}`;
      await redis.setEx(clearFlagKey, 15, 'true');

      // Mark for DB clear on next sync
      const clearSyncKey = `cart_clear_sync_needed:${userId}`;
      await redis.setEx(clearSyncKey, 60, 'true');

      // Clear Redis cart
      await redis.del(redisKey);

      await redis.del(clearFlagKey);

      this.kafkaClient.emit('cart.cleared', {
        userId,
        status: 'success',
        timestamp: new Date().toISOString(),
      });

      return this.respond(200, 'Cart cleared successfully.');
    } catch (error: any) {
      const clearFlagKey = `cart_clear_in_progress:${userId}`;
      await redis.del(clearFlagKey).catch(() => {});

      this.kafkaClient.emit('cart.cleared.error', {
        userId,
        status: 'error',
        error: error?.message,
        timestamp: new Date().toISOString(),
      });

      return this.handleCatch(error, 'Failed to clear cart');
    }
  }

  // Sample Kafka message handler
  async handleKafkaCartEvent(message: {
    userId: string;
    action: string;
    productId?: string;
    quantity?: number;
    price?: number;
    packageType?: string;
  }) {
    try {
      const { userId, action, productId, quantity, price, packageType } = message;

      if (!userId || !action) {
        throw new RpcException({
          error: true,
          message: 'Invalid message: userId and action are required',
          data: {},
        });
      }

      switch (action) {
        case 'add_to_cart':
          if (!productId || !quantity || !price) {
            throw new RpcException({
              error: true,
              message: 'Invalid message: productId, quantity, and price are required for add_to_cart',
              data: {},
            });
          }
          return await this.handleAddToCart({ userId, productId, quantity, price, packageType });

        case 'remove_from_cart':
          if (!productId) {
            throw new RpcException({
              error: true,
              message: 'Invalid message: productId is required for remove_from_cart',
              data: {},
            });
          }
          return await this.handleRemoveFromCart(userId, productId);

        case 'clear_cart':
          return await this.clearCart(userId);

        default:
          throw new RpcException({
            error: true,
            message: `Unknown action: ${action}`,
            data: {},
          });
      }
    } catch (error: any) {
      if (error instanceof RpcException) {
        throw error; // Let GlobalErrorFilter handle it
      }
      throw new RpcException({
        error: true,
        message: error?.message || 'Failed to process Kafka message',
        data: {},
      });
    }
  }
}