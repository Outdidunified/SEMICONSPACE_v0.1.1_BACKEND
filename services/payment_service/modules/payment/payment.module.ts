
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { KafkaProducerService } from '../../kafka/producer.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Payment } from './payment.model';

@Module({
  imports: [SequelizeModule.forFeature([Payment])],
  controllers: [PaymentController],
  providers: [PaymentService, KafkaProducerService],
  exports: [PaymentService], // ✅ This makes PaymentService accessible to other modules
})
export class PaymentModule {}
