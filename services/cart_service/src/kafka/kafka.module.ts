import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentConsumerService } from './payment-consumer.service';
import { PaymentConsumerController } from './payment-consumer.controller';
import { RedisModule } from '../redis/redis.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        useFactory: async (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'cart-service',
              brokers: ['172.235.17.60:9092'],
            },
            consumer: {
              groupId: 'payment-consumer-group',
              allowAutoTopicCreation: true,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
    RedisModule,
    CartModule, // ✅ Import CartModule to access CartService
  ],
  providers: [PaymentConsumerService],
  controllers: [PaymentConsumerController],
})
export class KafkaModule {}
