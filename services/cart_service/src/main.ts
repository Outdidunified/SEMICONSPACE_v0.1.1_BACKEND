import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Import these after installing the packages
// import helmet from 'helmet';
// import * as compression from 'compression';
// import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as os from 'os';

// For Node.js cluster support
let cluster: any;
try {
  // Dynamic import for cluster
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
    const port = configService.get<number>('PORT', 8005); // make sure this matches Dockerfile
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

    await app.startAllMicroservices();
    logger.log('🚀 Microservices started');

    await app.listen(port);
    logger.log(`🎉 HTTP server listening on port ${port} in ${environment} mode`);
  } catch (error) {
    logger.error(`❌ Error in bootstrap: ${error.message}`, error.stack);
    process.exit(1);
  }
}


// Use Node.js cluster module to utilize all CPU cores in production
if (cluster && process.env.NODE_ENV === 'production' && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  logger.log(`🧠 Primary process running. Starting ${numCPUs} workers...`);

  // Fork workers for each CPU
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Handle worker crashes
  cluster.on('exit', (worker: any, code: number, signal: string) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    logger.log('Starting a new worker...');
    cluster.fork();
  });
} else {
  // Worker processes or development mode
  bootstrap().catch((err: Error) => {
    logger.error(`Failed to bootstrap application: ${err.message}`, err.stack);
    process.exit(1);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // Give the process time to log the error before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Give the process time to log the error before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});
