
// services/payment_service/app.module.ts
import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { SequelizeModule, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript'
import { PaymentModule } from './modules/payment/payment.module';
import { KafkaConsumerService } from './kafka/consumer.service';
import { sequelizeConfig } from './config/db';
@Module({
  imports: [SequelizeModule.forRoot(sequelizeConfig), PaymentModule],
  providers: [KafkaConsumerService],
})
export class AppModule implements OnModuleInit {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async onModuleInit() {
    // Attempt to authenticate with the database
    try {
      await this.sequelize.authenticate();
      console.log('PostgreSQL connected');
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error.message);
    }

    // Handle global database errors and disconnections
    this.handleSequelizeErrors();
  }

  private handleSequelizeErrors() {
    this.sequelize.addHook('beforeConnect', () => {
      console.log('Before connecting to PostgreSQL...');
    });

    this.sequelize.addHook('afterConnect', () => {
      console.log('Successfully connected to PostgreSQL.');
    });

    // Catch unhandled promise rejections globally
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled promise rejection at:', promise, 'reason:', reason);
    });

    // Catch uncaught exceptions globally
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
    });
  }
}
