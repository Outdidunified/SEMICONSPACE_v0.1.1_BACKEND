import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CartModule } from './cart/cart.module';
import { RedisModule } from './redis/redis.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CartKafkaController } from './cart/cart.kafka.controller';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: parseInt(config.get<string>('DB_PORT') || '5432', 10),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        ssl: config.get<string>('DB_SSL') === 'true',
        autoLoadEntities: true,
        synchronize: true,
        extra: {
          statement_timeout: 10000,
          max: config.get<number>('DB_POOL_MAX', 20),
          idleTimeoutMillis: 30000,
        },
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'cart-service-server',
            brokers: ['172.235.17.60:9092'],
            retry: {
              initialRetryTime: 100,
              retries: 5,
            },
          },
          consumer: {
            groupId: 'cart_service_group',
            allowAutoTopicCreation: true,
            maxWaitTimeInMs: 5000,
            retry: {
              retries: 3,
            },
          },
        },
      },
    ]),

    CartModule,
    RedisModule,
    KafkaModule,
  ],
  controllers: [CartKafkaController],
})
export class AppModule {}
