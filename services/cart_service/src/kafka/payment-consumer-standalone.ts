import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PaymentConsumerService } from './payment-consumer.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get the payment consumer service
  const paymentConsumer = app.get(PaymentConsumerService);
  
  console.log('🚀 Starting Payment Consumer Service...');
  console.log('📡 Listening for payment success messages from Kafka...');
  
  // Keep the application running
  await app.listen(3001);
}

bootstrap().catch((error) => {
  console.error('❌ Error starting payment consumer:', error);
  process.exit(1);
});
