import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DeepPartial } from "typeorm";
import { CartItem } from "./cart-item.entity";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class CartSyncService {
  private readonly logger = new Logger(CartSyncService.name);

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>
  ) {}

  @Cron("*/10 * * * * *") // Runs every 10 seconds
  async syncCartToPostgres() {
    this.logger.log("🔄 Syncing cart data from Redis to PostgreSQL...");

    try {
      const redisClient = this.redisService.getClient();
      const keys = await redisClient.keys("cart:*");

      for (const key of keys) {
        const userId = key.split(":")[1];
        
        // Check if this user has recently completed payment (cart should not be synced)
        const paymentCompletedKey = `payment_completed:${userId}`;
        const paymentCompleted = await redisClient.get(paymentCompletedKey);
        
        if (paymentCompleted) {
          this.logger.log(`💳 Skipping sync for user ${userId} - payment recently completed`);
          
          // Clean up the payment completed flag and clear Redis cart
          await redisClient.del(paymentCompletedKey);
          await redisClient.del(key);
          
          // Ensure PostgreSQL is also cleared
          await this.cartItemRepo.delete({ userId });
          
          this.logger.log(`🧹 Cart cleared for user ${userId} after payment completion`);
          continue;
        }

        // ✅ Check if cart is being cleared
        const clearFlagKey = `cart_clear_in_progress:${userId}`;
        const isBeingCleared = await redisClient.get(clearFlagKey);
        
        if (isBeingCleared) {
          this.logger.log(`🚫 Skipping sync for user ${userId} - cart clear in progress`);
          continue;
        }

        const cart = await redisClient.hGetAll(key);

        const entries = Object.entries(cart);
        this.logger.log(
          `🔍 Found ${entries.length} items in Redis for user ${userId}`
        );

        const items: DeepPartial<CartItem>[] = [];
        
        for (const [productIdStr, jsonData] of entries) {
          try {
            if (!jsonData) {
              this.logger.warn(
                `⚠️ Empty value for product key ${productIdStr}`
              );
              continue;
            }

            const parsed = JSON.parse(jsonData as string);
            
            const productId = parsed.productId || parsed.semicon_part_number || parsed.id;
            const quantity = parseInt(parsed.quantity, 10);

            if (!productId || isNaN(quantity) || quantity <= 0) {
              this.logger.warn(
                `⚠️ Skipping item: Invalid productId (${productId}) or quantity (${quantity})`
              );
              continue;
            }

            // ✅ Check if this item is currently being removed
            const removalFlagKey = `cart_removal_in_progress:${userId}:${productId}`;
            const isBeingRemoved = await redisClient.get(removalFlagKey);
            
            if (isBeingRemoved) {
              this.logger.log(`🚫 Skipping sync for ${productId} - removal in progress`);
              continue;
            }

            // ✅ Additional safety: Check if this Redis entry is stale
            // If the item has a very old modifiedDate compared to now, it might be stale
            const itemModifiedDate = parsed.modifiedDate ? new Date(parsed.modifiedDate) : null;
            const now = new Date();
            const hoursSinceModified = itemModifiedDate ? 
              (now.getTime() - itemModifiedDate.getTime()) / (1000 * 60 * 60) : 0;
            
            if (itemModifiedDate && hoursSinceModified > 24) {
              this.logger.warn(`⚠️ Skipping potentially stale Redis entry for ${productId} (${hoursSinceModified.toFixed(1)} hours old)`);
              // Optionally remove stale entries from Redis
              await redisClient.hDel(key, productIdStr);
              continue;
            }

            const item: DeepPartial<CartItem> = {
              userId,
              productId,
              quantity,
              name: parsed.name || '',
              price: parsed.price || 0,
              description: parsed.description || '',
              manufacturerName: parsed.manufacturerName || '',
              manufacturerPartNumber: parsed.manufacturerPartNumber || '',
              datasheetUrl: parsed.datasheetUrl || '',
              imageUrl: parsed.imageUrl || '',
              createdBy: userId,
              modifiedBy: userId,
              packageType: parsed.packageType || '',
              createdDate: parsed.createdDate ? new Date(parsed.createdDate) : new Date(),
              modifiedDate: new Date(),
              status: parsed.status ?? true,
            };

            items.push(item);
          } catch (err) {
            this.logger.warn(
              `⚠️ Skipping invalid cart item: ${err.message}`
            );
          }
        }

        // ✅ Instead of deleting all and re-saving, let's do a smarter sync
        const existingItems = await this.cartItemRepo.find({ where: { userId } });
        const existingProductIds = new Set(existingItems.map(item => item.productId));
        const redisProductIds = new Set(items.map(item => item.productId));

        // ✅ Remove items that are in DB but not in Redis (they were removed)
        const itemsToRemove = existingItems.filter(item => !redisProductIds.has(item.productId));
        if (itemsToRemove.length > 0) {
          await this.cartItemRepo.remove(itemsToRemove);
          this.logger.log(`🗑️ Removed ${itemsToRemove.length} items no longer in Redis for user ${userId}`);
        }

        // ✅ Update or insert items from Redis
        for (const item of items) {
          const existing = existingItems.find(e => e.productId === item.productId);
          
          if (existing) {
            // Update existing item if Redis data is newer or different
            const needsUpdate = 
              existing.quantity !== item.quantity ||
              existing.price !== item.price ||
              existing.name !== item.name;
              
            if (needsUpdate) {
              await this.cartItemRepo.update(
                { id: existing.id },
                {
                  ...item,
                  modifiedDate: new Date(),
                  createdDate: existing.createdDate, // Preserve original creation date
                }
              );
              this.logger.log(`🔄 Updated item ${item.productId} for user ${userId}`);
            }
          } else {
            // Insert new item
            await this.cartItemRepo.save(item);
            this.logger.log(`➕ Added new item ${item.productId} for user ${userId}`);
          }
        }

        this.logger.log(`✅ Sync completed for user ${userId}: ${items.length} items in Redis, ${existingItems.length} items were in DB`);
      }
    } catch (error) {
      this.logger.error("❌ Failed to sync cart:", error.message);
    }
  }
}
