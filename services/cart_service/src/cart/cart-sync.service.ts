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

      // First process explicit clear-sync flags set by HTTP clearCart
      const clearSyncKeys = await redisClient.keys("cart_clear_sync_needed:*");
      for (const flagKey of clearSyncKeys) {
        const userId = flagKey.split(":")[1];
        const existingItems = await this.cartItemRepo.find({ where: { userId } });
        if (existingItems.length > 0) {
          await this.cartItemRepo.remove(existingItems);
          this.logger.log(`🗑️ Cleared ${existingItems.length} DB items for user ${userId} (clear sync)`);
        }
        await redisClient.del(flagKey);
      }

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

        // If Redis cart exists but is empty, ensure DB is cleared for this user
        if (entries.length === 0) {
          const existingItems = await this.cartItemRepo.find({ where: { userId } });
          if (existingItems.length > 0) {
            await this.cartItemRepo.remove(existingItems);
            this.logger.log(`🗑️ Removed ${existingItems.length} DB items for user ${userId} (empty Redis cart)`);
          }
          continue;
        }

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
            const baseQuantity = parseInt(parsed.quantity, 10);

            if (!productId || isNaN(baseQuantity) || baseQuantity <= 0) {
              this.logger.warn(
                `⚠️ Skipping item: Invalid productId (${productId}) or quantity (${baseQuantity})`
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
            const itemModifiedDate = parsed.modifiedDate ? new Date(parsed.modifiedDate) : null;
            const now = new Date();
            const hoursSinceModified = itemModifiedDate ? 
              (now.getTime() - itemModifiedDate.getTime()) / (1000 * 60 * 60) : 0;
            
            if (itemModifiedDate && hoursSinceModified > 24) {
              this.logger.warn(`⚠️ Skipping potentially stale Redis entry for ${productId} (${hoursSinceModified.toFixed(1)} hours old)`);
              await redisClient.hDel(key, productIdStr);
              continue;
            }

            // Detect if this Redis entry is already split by package (field key like productId::packageType)
            const [pidFromKey, pkgFromKeyRaw] = String(productIdStr).split('::');
            const pkgFromKey = pkgFromKeyRaw ? pkgFromKeyRaw.trim() : undefined;
            const productIdFinal = productId || pidFromKey;
            const breakdown = Array.isArray(parsed.packagingBreakdown) ? parsed.packagingBreakdown : null;

            if (pkgFromKey) {
              // Already split: push single row without re-expanding
              const item: DeepPartial<CartItem> = {
                userId,
                productId: productIdFinal,
                quantity: baseQuantity,
                name: parsed.name || '',
                price: parsed.price || 0, // extended total already stored per split
                description: parsed.description || '',
                manufacturerName: parsed.manufacturerName || '',
                manufacturerPartNumber: parsed.manufacturerPartNumber || '',
                datasheetUrl: parsed.datasheetUrl || '',
                imageUrl: parsed.imageUrl || '',
                createdBy: userId,
                modifiedBy: userId,
                packageType: (parsed.packageType || pkgFromKey || '').trim(),
                createdDate: parsed.createdDate ? new Date(parsed.createdDate) : new Date(),
                modifiedDate: new Date(),
                status: parsed.status ?? true,
              };
              items.push(item);
            } else if (breakdown && breakdown.length > 0) {
              // Not split in key: expand into multiple rows, one per package split
              for (const b of breakdown) {
                const pkgType = (b?.package_type || parsed.packageType || '').trim();
                const qty = typeof b?.quantity === 'number' ? b.quantity : baseQuantity;
                const extended = typeof b?.extended_price === 'number' ? b.extended_price : (parsed.price || 0);

                const item: DeepPartial<CartItem> = {
                  userId,
                  productId: productIdFinal,
                  quantity: qty,
                  name: parsed.name || '',
                  price: extended, // store extended total for this split
                  description: parsed.description || '',
                  manufacturerName: parsed.manufacturerName || '',
                  manufacturerPartNumber: parsed.manufacturerPartNumber || '',
                  datasheetUrl: parsed.datasheetUrl || '',
                  imageUrl: parsed.imageUrl || '',
                  createdBy: userId,
                  modifiedBy: userId,
                  packageType: pkgType,
                  createdDate: parsed.createdDate ? new Date(parsed.createdDate) : new Date(),
                  modifiedDate: new Date(),
                  status: parsed.status ?? true,
                };
                items.push(item);
              }
            } else {
              // No breakdown: single row
              const item: DeepPartial<CartItem> = {
                userId,
                productId: productIdFinal,
                quantity: baseQuantity,
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
            }
          } catch (err) {
            this.logger.warn(
              `⚠️ Skipping invalid cart item: ${err.message}`
            );
          }
        }

        // ✅ Instead of deleting all and re-saving, do a conflict-safe sync
        const existingItems = await this.cartItemRepo.find({ where: { userId } });
        const redisKeys = new Set(items.map(item => `${item.productId}::${item.packageType || ''}`));

        // 1) Remove items that are in DB but not in Redis (by composite key)
        const itemsToRemove = existingItems.filter(item => !redisKeys.has(`${item.productId}::${item.packageType || ''}`));
        if (itemsToRemove.length > 0) {
          await this.cartItemRepo.remove(itemsToRemove);
          this.logger.log(`🗑️ Removed ${itemsToRemove.length} items no longer in Redis for user ${userId}`);
        }

        // 2) Clean up any DB duplicates by (userId, productId, packageType)
        const byComposite: Record<string, CartItem[]> = {} as any;
        for (const it of existingItems) {
          const key = `${it.productId}::${it.packageType || ''}`;
          if (!byComposite[key]) byComposite[key] = [];
          byComposite[key].push(it);
        }
        let cleaned = 0;
        for (const [key, arr] of Object.entries(byComposite)) {
          if (arr.length > 1) {
            arr.sort((a, b) => new Date(b.modifiedDate || b.createdDate || 0).getTime() - new Date(a.modifiedDate || a.createdDate || 0).getTime());
            const keep = arr[0];
            const remove = arr.slice(1);
            if (remove.length) {
              await this.cartItemRepo.remove(remove);
              cleaned += remove.length;
            }
          }
        }
        if (cleaned > 0) {
          this.logger.log(`🧹 Cleaned ${cleaned} duplicate DB rows for user ${userId}`);
        }

        // 3) De-duplicate incoming items by composite key before upsert
        const dedupMap = new Map<string, DeepPartial<CartItem>>();
        for (const it of items) {
          const key = `${it.productId}::${it.packageType || ''}`;
          dedupMap.set(key, { ...it }); // last-write-wins
        }
        const toUpsert = Array.from(dedupMap.values()).map(it => ({ ...it, modifiedDate: new Date() }));

        await this.cartItemRepo.upsert(
          toUpsert,
          ['userId', 'productId', 'packageType']
        );

        this.logger.log(`✅ Sync completed for user ${userId}: upserted ${toUpsert.length} (split) items from Redis`);
      }
    } catch (error) {
      this.logger.error("❌ Failed to sync cart:", error.message);
    }
  }
}
