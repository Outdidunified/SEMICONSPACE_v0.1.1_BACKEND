// src/cart/cart.module.ts
import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from './cart-item.entity';
import { RedisModule } from '../redis/redis.module'; // ✅ Redis module import
import { CartSyncService } from './cart-sync.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HttpModule } from '@nestjs/axios'; // ✅ Add this




@Module({
  imports: [
    TypeOrmModule.forFeature([CartItem]),
    RedisModule,
    HttpModule,
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'cart-service',
        brokers: ['172.235.17.60:9092'], // ✅ CORRECT
          },
          consumer: {
            groupId: 'cart-consumer',
          },
        },
      },
    ]), // ✅ ADD RedisModule here
  ],
  controllers: [CartController],
  providers: [CartService,CartSyncService],
  exports: [CartService], // ✅ Export CartService so other modules can use it
})
export class CartModule {}
