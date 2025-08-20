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
    price?: number; // optional; derived from product service if not provided
    packageType?: string; // optional; derived from product service if not provided
  }): Promise<{ error: boolean; message: any; data: Record<string, any>; statusCode?: number }> {
    try {
      const { userId, productId, quantity, price: userPrice, packageType } = body;
      const redis = this.redisService.getClient();
      const redisKey = `cart:${userId}`;
      // Use composite field key to support multiple package splits per product
      const normalizePkg = (s?: string) => (typeof s === 'string' ? s.trim() : s);
      const makeFieldKey = (pid: string, pkg?: string) => (pkg ? `${pid}::${normalizePkg(pkg)}` : pid);
      const compositeFieldKey = makeFieldKey(productId, normalizePkg(packageType));

      if (!userId || !productId || typeof quantity !== 'number' || quantity < 0) {
        return this.respond(402, 'Invalid input. userId, productId and non-negative quantity are required');
      }

      if (quantity === 0) {
        return await this.handleRemoveFromCart(userId, productId, packageType);
      }

      const externalUrl = `http://192.168.1.14:8001/product/quantity-price/check/${productId}/${quantity}`; // expects packaging_breakdown and total_price
    
      
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
          console.log('🌍 External API Response:', JSON.stringify(response.data, null, 2));

      } catch (error: any) {
        return this.respond(500, 'Failed to fetch product details');
      }

      const responseData = response.data;
      const payload = responseData?.data || responseData; // normalize
      const product = payload?.product;

      if (!product || responseData?.error) {
        const message = responseData?.message || 'Product not found';
        return this.respond(404, message);
      }

      // Derive price and packageType from packaging_breakdown/total_price
      const breakdown = Array.isArray(payload?.packaging_breakdown) ? payload.packaging_breakdown : [];
      const derivedPackageType = packageType || (breakdown.length > 0 ? breakdown[0].package_type : undefined);
      const unitPriceFromBreakdown = breakdown.length > 0 ? breakdown[0].unit_price : undefined;
      const computedTotalPrice =
        typeof payload?.total_price === 'number'
          ? payload.total_price
          : (Array.isArray(breakdown)
              ? breakdown.reduce((sum: number, b: any) => sum + (typeof b?.extended_price === 'number' ? b.extended_price : 0), 0)
              : 0) || (typeof userPrice === 'number' ? userPrice : 0);

      const now = new Date();

      // Merge with existing Redis item to avoid overwriting other fields and support quantity change semantics
      const existingJson = await redis.hGet(redisKey, compositeFieldKey);
      let existing: any = existingJson ? JSON.parse(existingJson) : null;

      // Decide quantity behavior: override to requested_quantity from payload, else use provided quantity
      const normalizedQuantity = typeof payload?.requested_quantity === 'number' ? payload.requested_quantity : quantity;

      // If breakdown exists, split and store each package as its own Redis field (pid::packageType)
      let storedPackageType = derivedPackageType;
      let storedQuantity = normalizedQuantity;
      let storedPrice = computedTotalPrice;

      if (Array.isArray(breakdown) && breakdown.length > 0) {
        for (const b of breakdown) {
          const pkgType = normalizePkg(b?.package_type || derivedPackageType);
          const qty = typeof b?.quantity === 'number' ? b.quantity : normalizedQuantity;
          const extended = typeof b?.extended_price === 'number' ? b.extended_price : computedTotalPrice;
          const fieldKey = makeFieldKey(product.semicon_part_number || productId, pkgType);

          // Set exact quantities and totals from current breakdown (no accumulation)
          const existingSplitJson = await redis.hGet(redisKey, fieldKey);
          const existingSplit: any = existingSplitJson ? JSON.parse(existingSplitJson) : null;

          const itemData = {
            ...(existingSplit || {}),
            userId,
            productId: product.semicon_part_number || productId,
            quantity: qty, // exact quantity from current breakdown
            name: product.name || existingSplit?.name || existing?.name || '',
            price: extended, // exact extended total for this split
            packageType: pkgType,
            description: product.description || existingSplit?.description || existing?.description || '',
            manufacturerName: product.manufacturer_name || existingSplit?.manufacturerName || existing?.manufacturerName || '',
            manufacturerPartNumber: product.manufacturer_part_number || existingSplit?.manufacturerPartNumber || existing?.manufacturerPartNumber || '',
            datasheetUrl: product.datasheet_url || existingSplit?.datasheetUrl || existing?.datasheetUrl || '',
            imageUrl: product.image_url || existingSplit?.imageUrl || existing?.imageUrl || '',
            createdBy: existingSplit?.createdBy || existing?.createdBy || userId,
            modifiedBy: userId,
            createdDate: existingSplit?.createdDate ? new Date(existingSplit.createdDate) : (existing?.createdDate ? new Date(existing.createdDate) : now),
            modifiedDate: now,
            status: product.status ?? (existingSplit?.status ?? existing?.status ?? true),
            // Keep full breakdown for transparency, even though row is split
            packagingBreakdown: breakdown,
          };

          await redis.hSet(redisKey, fieldKey, JSON.stringify(itemData));
        }

        // Remove any legacy/base entry without packageType to avoid duplicates
        const basePid = product.semicon_part_number || productId;
        await redis.hDel(redisKey, basePid);

        // Remove any split entries for this product that are NOT in the current breakdown
        const validPkgSet = new Set(
          breakdown
            .map((b: any) => normalizePkg(b?.package_type || derivedPackageType))
            .filter((x: any) => !!x)
        );
        const allFields = await redis.hGetAll(redisKey);
        for (const fieldKey of Object.keys(allFields)) {
          if (fieldKey.startsWith(`${basePid}::`)) {
            const pkg = fieldKey.split('::')[1];
            if (!validPkgSet.has(pkg)) {
              await redis.hDel(redisKey, fieldKey);
            }
          }
        }

        // For response, reflect the first package split
        storedPackageType = normalizePkg(breakdown[0]?.package_type || derivedPackageType);
        storedQuantity = breakdown[0]?.quantity || normalizedQuantity;
        storedPrice = breakdown[0]?.extended_price || computedTotalPrice;
      } else {
        const itemData = {
          ...(existing || {}),
          userId,
          productId: product.semicon_part_number || productId,
          quantity: normalizedQuantity,
          name: product.name || existing?.name || '',
          price: computedTotalPrice,
          packageType: derivedPackageType,
          description: product.description || existing?.description || '',
          manufacturerName: product.manufacturer_name || existing?.manufacturerName || '',
          manufacturerPartNumber: product.manufacturer_part_number || existing?.manufacturerPartNumber || '',
          datasheetUrl: product.datasheet_url || existing?.datasheetUrl || '',
          imageUrl: product.image_url || existing?.imageUrl || '',
          createdBy: existing?.createdBy || userId,
          modifiedBy: userId,
          createdDate: existing?.createdDate ? new Date(existing.createdDate) : now,
          modifiedDate: now,
          status: product.status ?? (existing?.status ?? true),
          packagingBreakdown: breakdown,
        };
        await redis.hSet(redisKey, compositeFieldKey, JSON.stringify(itemData));
      }

      await redis.expire(redisKey, 86400);

      // Do NOT write to Postgres here. Redis is the source of truth; CartSyncService will sync to Postgres.

      this.kafkaClient.emit('cart.item.added', {
        userId,
        productId: product.semicon_part_number || productId,
        quantity: storedQuantity,
        packageType: storedPackageType,
        price: storedPrice, // extended total stored as price
        status: 'success',
        message: 'Cart item added or updated',
        timestamp: now.toISOString(),
      });

      // Build response reflecting actual stored items
      const responseItems = Array.isArray(breakdown) && breakdown.length > 0
        ? breakdown.map((b: any) => ({
            userId,
            productId: product.semicon_part_number || productId,
            quantity: typeof b?.quantity === 'number' ? b.quantity : normalizedQuantity,
            packageType: normalizePkg(b?.package_type || storedPackageType),
            price: typeof b?.extended_price === 'number' ? b.extended_price : storedPrice,
          }))
        : [{
            userId,
            productId: product.semicon_part_number || productId,
            quantity: storedQuantity,
            packageType: storedPackageType,
            price: storedPrice,
          }];

      return this.respond(200, 'Item successfully added in cart', { items: responseItems });
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

      const parsed = entries.map(([fieldKey, itemJson]) => {
        const item = JSON.parse(itemJson);
        const [pid, pkgType] = String(fieldKey).split('::');
        const price = typeof item.price === 'number' ? item.price : ((item.unitPrice ?? 0) * (item.quantity ?? 0));
        return {
          ...item,
          __fieldKey: fieldKey,
          productId: item.productId ?? pid,
          packageType: item.packageType ?? pkgType,
          price,
        };
      });

      // If any split entries exist for a product, drop the base entry without packageType
      const hasSplitByPid = new Set(
        parsed
          .filter(x => x.__fieldKey.includes('::'))
          .map(x => x.productId)
      );
      const items = parsed.filter(x => !(hasSplitByPid.has(x.productId) && !x.packageType));

      const cartTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);

      // Strip internal and bulky fields for response (no packagingBreakdown, no __fieldKey)
      const sanitized = items.map(({ packagingBreakdown, __fieldKey, ...rest }) => rest);

      return this.respond(200, 'Cart items fetched successfully', { items: sanitized, cartTotal });
    } catch (error: any) {
      console.error('❌ Error fetching cart items:', error);
      return this.handleCatch(error, 'Failed to fetch cart items');
    }
  }

  async handleRemoveFromCart(
    userId: string,
    productId: string,
    packageType?: string,
  ): Promise<{ error: boolean; message: any; data: Record<string, any>; statusCode?: number }> {
    try {
      const redis = this.redisService.getClient();
      const redisKey = `cart:${userId}`;

      if (!userId || !productId) {
        return this.respond(402, 'Invalid userId or productId');
      }

      const makeFieldKey = (pid: string, pkg?: string) => (pkg ? `${pid}::${pkg}` : pid);
      const removalFlagKey = `cart_removal_in_progress:${userId}:${productId}`;
      await redis.setEx(removalFlagKey, 15, 'true');

      const cartItems = await redis.hGetAll(redisKey);
      let fieldToDelete: string | null = null;

      if (packageType) {
        // Direct match by composite key
        const composite = makeFieldKey(productId, packageType);
        if (cartItems[composite]) {
          fieldToDelete = composite;
        }
      }

      if (!fieldToDelete) {
        for (const [field, value] of Object.entries(cartItems)) {
          try {
            const parsed = JSON.parse(value);
            if (parsed.productId === productId && (!packageType || parsed.packageType === packageType)) {
              fieldToDelete = field;
              break;
            }
          } catch {}
        }
      }

      if (!fieldToDelete) {
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