// services/order_service/modules/order/order.module.ts

import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Order } from './order.model';
import { KafkaProducerService } from '../../kafka/producer.service';
import { KafkaConsumerService } from '../../kafka/consumer.service'; // ✅ Add this import

@Module({
  imports: [SequelizeModule.forFeature([Order])],
  controllers: [OrderController],
  providers: [OrderService, KafkaProducerService, KafkaConsumerService], // ✅ Add KafkaConsumerService
  exports: [OrderService],
})
export class OrderModule {}
