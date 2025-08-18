import { Controller, OnModuleInit } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PaymentConsumerService } from './payment-consumer.service';

@Controller()
export class PaymentConsumerController implements OnModuleInit {
  constructor(private readonly paymentConsumerService: PaymentConsumerService) {}

  onModuleInit() {
    console.log('🔔 Payment Consumer Controller initialized');
  }

  @EventPattern('payment.success')
  async handlePaymentSuccess(@Payload() message: any) {
    console.log('💰 Payment Success Message Received:');
    console.log('=====================================');
    console.log(JSON.stringify(message, null, 2));
    console.log('=====================================');
    
    // Print formatted data
    if (message && message.data) {
      const data = message.data;
      console.log('\n📋 Payment Details:');
      console.log(`✅ Order ID: ${data.orderId}`);
      console.log(`👤 User ID: ${data.userId}`);
      console.log(`💳 Payment ID: ${data.razorpayPaymentId}`);
      console.log(`💵 Total Amount: ₹${data.total}`);
      console.log(`🎯 Status: ${data.status}`);
      console.log(`📅 Created At: ${data.createdAt}`);
      
      console.log('\n📦 Items:');
      data.items.forEach((item: any, index: number) => {
        console.log(`  ${index + 1}. Product ID: ${item.productId}`);
        console.log(`     Quantity: ${item.qty}`);
        console.log(`     Total Price: ₹${item.totalprice}`);
      });
    }
    
    // Delegate to service for cart clearing
    await this.paymentConsumerService.handlePaymentSuccess(message);
  }
}
