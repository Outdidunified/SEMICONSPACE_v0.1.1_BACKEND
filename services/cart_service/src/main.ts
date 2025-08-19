// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { GlobalErrorFilter } from './middlewares/errorHandler';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';

// For Node.js cluster support
let cluster: any;
try {
  cluster = require('cluster');
} catch (e) {
  console.error('Cluster module not available');
}

const logger = new Logger('Bootstrap');

async function bootstrap() {
  try {
    logger.log('🔧 Creating Nest app...');
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
      bufferLogs: true,
      cors: true,
      abortOnError: false,
    });

    logger.log('✅ Nest app created');

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 8005);
    const environment = configService.get<string>('NODE_ENV', 'development');
    const kafkaBrokers = configService.get<string>('KAFKA_BROKERS', '172.235.17.60:9092').split(',');

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
        disableErrorMessages: environment === 'production',
      }),
    );

    logger.log('📦 ValidationPipe applied');

    // Global error handler
    app.useGlobalFilters(new GlobalErrorFilter());
    logger.log('🛡️ GlobalErrorFilter applied');

    // Kafka microservice setup
    logger.log('🔌 Connecting to Kafka...');
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'cart-service',
          brokers: kafkaBrokers,
          retry: { initialRetryTime: 100, retries: 5 },
        },
        consumer: {
          groupId: 'payment-consumer-group',
          allowAutoTopicCreation: true,
          maxWaitTimeInMs: 5000,
          retry: { retries: 3 },
        },
      },
    });

    logger.log('✅ Kafka microservice configured');

    // Enable shutdown hooks for graceful termination
    app.enableShutdownHooks();
    logger.log('🛑 Shutdown hooks enabled');

    await app.startAllMicroservices();
    logger.log('🚀 Microservices started');

    await app.listen(port);
    logger.log(`🎉 HTTP server listening on port ${port} in ${environment} mode`);
  } catch (error) {
    logger.error(`❌ Error in bootstrap: ${error.message}`, error.stack);
    process.exit(1);
  }
}

// Use Node.js cluster module in production
if (cluster && process.env.NODE_ENV === 'production' && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  logger.log(`🧠 Primary process running. Starting ${numCPUs} workers...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker: any, code: number, signal: string) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    logger.log('Starting a new worker...');
    cluster.fork();
  });
} else {
  bootstrap().catch((err: Error) => {
    logger.error(`Failed to bootstrap application: ${err.message}`, err.stack);
    process.exit(1);
  });
}

// Handle unhandled promise rejections (single listener)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions (single listener)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});