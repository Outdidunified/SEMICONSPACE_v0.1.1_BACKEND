import * as dotenv from 'dotenv';
dotenv.config(); // <-- Load env before SequelizeModule

import { Module, OnModuleInit, NestModule, MiddlewareConsumer, Inject } from '@nestjs/common';
import { SequelizeModule, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';

import { ProfileModule } from './src/modules/profile/profile.module';
import { AddressModule } from './src/modules/address/address.module';
import { RoleModule } from './src/modules/role/role.module';
import { ManageUserModule } from './src/modules/manage_users/manage-user.module';
import { ConsumerService } from './src/kafka/consumer.service';
// import { RateLimiterMiddleware } from './src/middlewares/rateLimiter';
import { sequelizeConfig } from './src/config/db';

@Module({
  imports: [
    SequelizeModule.forRoot(sequelizeConfig),
    ProfileModule,
    AddressModule,
    RoleModule,
    ManageUserModule,
  ],
  providers: [ConsumerService],
})
export class AppModule implements OnModuleInit, NestModule {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async onModuleInit() {
    try {
      await this.sequelize.authenticate();
      console.log('PostgreSQL connected');
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error.message);
    }
  }

  configure(consumer: MiddlewareConsumer) {
    // consumer.apply(RateLimiterMiddleware).forRoutes('*');
  }
}
