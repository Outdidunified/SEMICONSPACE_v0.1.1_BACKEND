import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { SequelizeModule, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PaymentModule } from './src/modules/payment/payment.module';
import { KafkaConsumerService } from './src/kafka/consumer.service';
import { sequelizeConfig } from './src/config/db';

@Module({
  imports: [SequelizeModule.forRoot(sequelizeConfig), PaymentModule],
  providers: [KafkaConsumerService],
})
export class AppModule implements OnModuleInit {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async onModuleInit() {
    try {
      await this.sequelize.authenticate();
      console.log('PostgreSQL connected');
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error?.message);
    }

    // Global error handlers
    this.handleGlobalErrors();
  }

  private handleGlobalErrors() {
    this.sequelize.addHook('beforeConnect', () => console.log('Before connecting to PostgreSQL...'));
    this.sequelize.addHook('afterConnect', () => console.log('Connected to PostgreSQL successfully.'));

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Promise Rejection:', reason, promise);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received: Closing database and Kafka connections...');
      try {
        await this.sequelize.close();
        console.log('Database connection closed');
      } catch (err) {
        console.error('Error closing database connection:', err);
      }
      process.exit(0);
    });
  }
}
