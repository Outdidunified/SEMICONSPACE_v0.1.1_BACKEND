import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { GlobalErrorFilter } from './src/middlewares/errorHandler';
import { KafkaConsumerService } from './src/kafka/consumer.service';

dotenv.config();

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new GlobalErrorFilter());

  // Start Kafka safely
  try {
    const consumer = app.get(KafkaConsumerService);
    await consumer.startConsumer();
    logger.log('Kafka consumer started successfully');
  } catch (err) {
    logger.error('Kafka consumer failed to start, continuing without it', err?.stack);
  }

  const PORT = process.env.PORT || 8007;
  await app.listen(PORT);
  logger.log(`🚀 Server running on http://localhost:${PORT}`);
}

bootstrap().catch((err) => console.error('Fatal bootstrap error:', err));
