import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConsumerService } from './src/kafka/consumer.service';
import { GlobalErrorFilter } from './src/middlewares/errorHandler';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Global error filter
  app.useGlobalFilters(new GlobalErrorFilter());

  // Enable CORS
  app.enableCors();

  // Start Kafka consumer safely
  try {
    const consumer = app.get(ConsumerService);
    await consumer.startConsumer();
    console.log(' Kafka Consumer started');
  } catch (error) {
    console.error(' Kafka Consumer failed to start:', error.message);
    // Important: Server keeps running
  }

  // Catch any uncaught exceptions/rejections globally
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });

  const PORT = process.env.PORT || 8002;
  await app.listen(PORT);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
}

bootstrap();
