import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CartModule } from './cart/cart.module';
import { RedisModule } from './redis/redis.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KafkaModule } from './kafka/kafka.module';
// Uncomment after installing the package
// import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // Rate limiting to protect against DoS attacks - uncomment after installing throttler
    /*
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([
        {
          ttl: config.get<number>('THROTTLE_TTL', 60), // 1 minute
          limit: config.get<number>('THROTTLE_LIMIT', 100), // 100 requests per minute
        },
      ]),
    }),
    */

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
        // Performance optimizations for high load
        extra: {
          // Statement timeout to prevent long-running queries
          statement_timeout: 10000, // 10 seconds
          // Connection pool configuration
          max: config.get<number>('DB_POOL_MAX', 20),
          idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
        },
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Kafka Client Setup with improved configuration
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'cart-service-server',
            brokers: ['172.235.17.60:9092'],
            // Retry settings for producer
            retry: {
              initialRetryTime: 100,
              retries: 5,
            },
          },
          consumer: {
            groupId: 'cart_service_group',
            // Allow parallel message processing
            allowAutoTopicCreation: true,
            maxWaitTimeInMs: 5000,
            // Retry failed messages
            retry: {
              retries: 3,
            },
          },
        },
      },
    ]),

    CartModule,
    RedisModule,
    // Import Kafka module for payment consumer
   KafkaModule
  
  ],
})
export class AppModule {}
