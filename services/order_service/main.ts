// services/order_service/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { KafkaConsumerService } from './kafka/consumer.service';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();


  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  const consumer = app.get(KafkaConsumerService);
  // await consumer.startConsumer();
    app.enableCors();  // Enable CORS


  const PORT = process.env.PORT || 8006;
  await app.listen(PORT);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
}

bootstrap();
