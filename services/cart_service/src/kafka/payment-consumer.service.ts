import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CartService } from '../cart/cart.service';

@Injectable()
export class PaymentConsumerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentConsumerService.name);

  constructor(
    @Inject('KAFKA_SERVICE')
    private readonly kafkaClient: ClientKafka,
    private readonly redisService: RedisService,
    private readonly cartService: CartService,
  ) {}

  async onModuleInit() {
    // Subscribe to the payment success topic
    await this.kafkaClient.subscribeToResponseOf('payment.success');
    
    // Start consuming messages
    this.kafkaClient.connect().then(() => {
      console.log('🚀 Payment Consumer Service connected to Kafka');
      console.log('📡 Listening for payment success messages...');
    });
  }

  // This method will be called when a message is received
  async handlePaymentSuccess(message: any) {
    console.log('💰 Payment Success Message Received:');
    console.log('=====================================');
    console.log(JSON.stringify(message, null, 2));
    console.log('=====================================');
    
    try {
      // Handle both direct message and nested data structures
      const paymentData = message.data || message;
      
      if (paymentData.userId && paymentData.orderId) {
        const { userId, orderId, total, items } = paymentData;
        
        console.log(`✅ Order ID: ${orderId}`);
        console.log(`👤 User ID: ${userId}`);
        console.log(`💵 Total Amount: ₹${total}`);
        console.log(`📦 Items Count: ${items.length}`);
        
        // Clear the cart for this specific user
        await this.clearUserCart(userId);
        
        console.log(`🧹 Cart cleared successfully for user ${userId}`);
      } else {
        this.logger.warn('⚠️ Invalid message structure - missing required fields (userId, orderId)');
        console.log('Message structure:', JSON.stringify(message, null, 2));
      }
    } catch (error) {
      this.logger.error(`❌ Error processing payment success message: ${error.message}`, error.stack);
    }
  }

  private async clearUserCart(userId: string): Promise<void> {
    try {
      // Set payment completion flag to prevent sync service from re-syncing
      const redis = this.redisService.getClient();
      await redis.set(`payment_completed:${userId}`, 'true', { EX: 300 }); // 5 minutes TTL
      
      // Use CartService to clear cart from both Redis and PostgreSQL
      const result = await this.cartService.clearCart(userId);
      
      if (result.error) {
        this.logger.error(`❌ Failed to clear cart for user ${userId}: ${result.message}`);
        throw new Error(result.message);
      } else {
        this.logger.log(`🧹 ${result.message}`);
        this.logger.log(`📊 Items cleared: ${result.data?.itemsCleared || 0}`);
      }
      
    } catch (error) {
      this.logger.error(`❌ Error clearing cart for user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
