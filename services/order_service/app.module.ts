import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { SequelizeModule, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { OrderModule } from './src/modules/order/order.module';
import { ManagerOrderModule } from './src/modules/Manageorder/managerorder.module';
import { sequelizeConfig } from './src/config/db';

@Module({
  imports: [
    SequelizeModule.forRoot(sequelizeConfig),
    OrderModule,
    ManagerOrderModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async onModuleInit() {
    // Try to connect to DB but do not crash app if fails
    try {
      await this.sequelize.authenticate();
      console.log(' PostgreSQL connected');
    } catch (err) {
      console.error(' Failed to connect to PostgreSQL:', err.message);
    }

    this.sequelize.addHook('afterConnect', () => {
      console.log('Successfully connected to PostgreSQL');
    });

    // Global error handling for unhandled rejections and exceptions
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled promise rejection:', reason);
    });
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
    });
  }
}
