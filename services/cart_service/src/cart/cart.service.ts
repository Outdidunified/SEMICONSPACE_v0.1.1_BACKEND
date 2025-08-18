// cart.service.ts
import { Injectable, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DeepPartial } from "typeorm";
import { CartItem } from "./cart-item.entity";
import { RedisService } from "../redis/redis.service";
import { ClientKafka } from "@nestjs/microservices";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

@Injectable()
export class CartService {
  logger: any;
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,
    private readonly redisService: RedisService,
    private readonly httpService: HttpService,
    @Inject("KAFKA_SERVICE")
    private readonly kafkaClient: ClientKafka,
  ) {}
  async handleAddToCart(body: {
    userId: string;
    productId: string;
    quantity: number;
    price: number; // from user request
    packageType?: string; // optional from user request
  }): Promise<any> {
    const { userId, productId, quantity, price: userPrice, packageType } = body;
    const redis = this.redisService.getClient();
    const redisKey = `cart:${userId}`;
    const productIdKey = productId;

    if (quantity <= 0) {
      return this.handleRemoveFromCart(userId, productIdKey);
    }

    try {
      console.log("🧾 Product ID:", productId);
      console.log("📦 Quantity:", quantity);
      console.log("💲 Price from user request:", userPrice);
      console.log("📦 Package Type from user request:", packageType);

      const externalUrl = `http://172.232.110.10:8003/product/quantity-price/check/${productId}/${quantity}`;
      console.log("➡️ Fetching product from:", externalUrl);

      const response = await firstValueFrom(this.httpService.get(externalUrl));
      const responseData = response.data;

      console.log(
        "📦 Full external API response:",
        JSON.stringify(responseData, null, 2),
      );

      const product = responseData?.data?.product;

      if (!product || product?.detail) {
        const message =
          product?.detail?.message ||
          responseData?.message ||
          "Product not found";
        console.log("❌ Product fetch failed:", message);

        return {
          statusCode: 404,
          error: true,
          message,
        };
      }

      const now = new Date();
      const cartItemData: DeepPartial<CartItem> = {
        userId,
        productId: product.semicon_part_number || productId,
        quantity,
        name: product.name || "",
        price: userPrice, // use price from user request only
        packageType: packageType, // use packageType from user request
        description: product.description || "",
        manufacturerName: product.manufacturer_name || "",
        manufacturerPartNumber: product.manufacturer_part_number || "",
        datasheetUrl: product.datasheet_url || "",
        imageUrl: product.image_url || "",
        createdBy: userId,
        modifiedBy: userId,
        createdDate: now,
        modifiedDate: now,
        status: product.status ?? true,
      };

      await redis.hSet(redisKey, productIdKey, JSON.stringify(cartItemData));
      await redis.expire(redisKey, 86400);

      const existing = await this.cartRepository.findOne({
        where: { userId, productId },
      });
      if (existing) {
        await this.cartRepository.update(
          { id: existing.id },
          {
            ...cartItemData,
            quantity,
            modifiedDate: now,
          },
        );
      } else {
        await this.cartRepository.save(cartItemData);
      }

      this.kafkaClient.emit("cart.item.added", {
        userId,
        productId,
        quantity,
        packageType,
        price: userPrice,
        status: "success",
        message: "Cart item added or updated",
        timestamp: now.toISOString(),
      });

      return {
        statusCode: 200,
        error: false,
        message: "Item successfully added in cart",
        data: { userId, productId, quantity, packageType, price: userPrice },
      };
    } catch (error) {
      console.error("❌ Error fetching product:", error?.message);
      console.error(
        "❌ Full error response:",
        JSON.stringify(error?.response?.data, null, 2),
      );

      const errMsg =
        error?.response?.data?.message ||
        error?.response?.data?.detail?.message ||
        error.message ||
        "Unknown error";

      return {
        statusCode: 500,
        error: true,
        message: errMsg,
      };
    }
  }

  async handleGetCartItems(userId: string): Promise<any> {
    const redis = this.redisService.getClient();
    const redisKey = `cart:${userId}`;

    try {
      let cart = await redis.hGetAll(redisKey);
      let entries = Object.entries(cart);

      console.log(entries);

      // If Redis is empty, fetch from DB and rehydrate
      if (entries.length === 0) {
        const dbItems = await this.cartRepository.find({ where: { userId } });

        if (dbItems.length === 0) {
          return {
            statusCode: 404,
            error: true,
            message: `No items in cart for user ${userId}`,
          };
        }

        // Rehydrate Redis from DB
        const pipeline = redis.multi();
        for (const item of dbItems) {
          const itemProductId = item.productId?.toString?.() ?? "";
          pipeline.hSet(redisKey, itemProductId, JSON.stringify(item));
        }
        pipeline.expire(redisKey, 86400); // Set 24h TTL
        await pipeline.exec();

        cart = await redis.hGetAll(redisKey);
        entries = Object.entries(cart);
      }

      // Parse items from Redis
      const items = entries.map(([productIdKey, itemJson]) => {
        const item = JSON.parse(itemJson);
        const totalPrice = (item.price ?? 0) * (item.quantity ?? 0);
        return {
          ...item,
          productId: item.productId ?? productIdKey, // fallback to Redis key if missing
          totalPrice,
        };
      });

      const cartTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

      return {
        statusCode: 200,
        error: false,
        message: "Cart items fetched successfully",
        data: {
          items,
          cartTotal,
        },
      };
    } catch (error) {
      console.error("❌ Error fetching cart items:", error);
      return {
        statusCode: 500,
        error: true,
        message: error.message || "Failed to fetch cart items",
      };
    }
  }

  async handleRemoveFromCart(userId: string, productId: string): Promise<any> {
    const redis = this.redisService.getClient();
    const redisKey = `cart:${userId}`;

    if (!userId || !productId) {
      return {
        statusCode: 400,
        error: true,
        message: "Invalid userId or productId",
      };
    }

    try {
      // ✅ Step 1: Set a temporary flag to prevent sync service from overriding our removal
      const removalFlagKey = `cart_removal_in_progress:${userId}:${productId}`;
      await redis.setEx(removalFlagKey, 15, "true"); // 15 seconds TTL

      // ✅ Step 2: Find the actual hash field that matches the productId
      const cartItems = await redis.hGetAll(redisKey);
      let fieldToDelete: string | null = null;

      for (const [field, value] of Object.entries(cartItems)) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.productId === productId) {
            fieldToDelete = field;
            break;
          }
        } catch (e) {
          // Ignore parse errors for corrupted data
        }
      }

      if (fieldToDelete) {
        const removedCount = await redis.hDel(redisKey, fieldToDelete);

        if (removedCount > 0) {
          const remainingItems = await redis.hLen(redisKey);
          if (remainingItems === 0) {
            await redis.del(redisKey);
          }
        }
      }

      // ✅ Step 3: Remove from DB
      await this.cartRepository.delete({ userId, productId });

      // ✅ Step 4: Clean up the removal flag
      await redis.del(removalFlagKey);

      const cart = await redis.hGetAll(redisKey);
      const entries = Object.entries(cart);

      console.log(entries);

      // ✅ Step 5: Emit Kafka
      this.kafkaClient.emit("cart.item.removed", {
        userId,
        productId,
        status: "success",
        timestamp: new Date().toISOString(),
      });

      return {
        statusCode: 200,
        error: false,
        message: "Item removed from cart",
        data: { userId, productId },
      };
    } catch (error) {
      // Clean up the removal flag in case of error
      const removalFlagKey = `cart_removal_in_progress:${userId}:${productId}`;
      await redis.del(removalFlagKey).catch(() => {});

      this.kafkaClient.emit("cart.item.removed.error", {
        userId,
        productId,
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return {
        statusCode: 500,
        error: true,
        message: error.message || "Failed to remove item from cart",
      };
    }
  }

  async clearCart(userId: string): Promise<any> {
    const redis = this.redisService.getClient();
    const redisKey = `cart:${userId}`;

    if (!userId) {
      return {
        statusCode: 400,
        error: true,
        message: "Invalid userId",
      };
    }

    try {
      // ✅ Step 1: Set a flag to prevent sync service from interfering
      const clearFlagKey = `cart_clear_in_progress:${userId}`;
      await redis.setEx(clearFlagKey, 15, "true"); // 15 seconds TTL

      // ✅ Step 2: Remove from Redis
      await redis.del(redisKey);

      // ✅ Step 3: Remove all items from DB for this user
      const existingItems = await this.cartRepository.find({
        where: { userId },
      });

      if (existingItems.length > 0) {
        await this.cartRepository.remove(existingItems);
      }

      // ✅ Step 4: Clean up the clear flag
      await redis.del(clearFlagKey);

      // ✅ Step 5: Emit Kafka
      this.kafkaClient.emit("cart.cleared", {
        userId,
        itemsCleared: existingItems.length,
        status: "success",
        timestamp: new Date().toISOString(),
      });

      return {
        statusCode: 200,
        error: false,
        message: `Cart cleared successfully. ${existingItems.length} items removed.`,
        data: { userId, itemsCleared: existingItems.length },
      };
    } catch (error) {
      // Clean up the clear flag in case of error
      const clearFlagKey = `cart_clear_in_progress:${userId}`;
      await redis.del(clearFlagKey).catch(() => {}); // Ignore errors in cleanup

      this.kafkaClient.emit("cart.cleared.error", {
        userId,
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return {
        statusCode: 500,
        error: true,
        message: error.message || "Failed to clear cart",
      };
    }
  }
}
