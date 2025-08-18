import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { SequelizeModule, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';

import { ProfileModule } from './modules/profile/profile.module';
import { AddressModule } from './modules/address/address.module';
import { ConsumerService } from './kafka/consumer.service';
import { sequelizeConfig } from './config/db';
import { RoleModule } from './modules/role/role.module';
import { ManageUserModule } from './modules/manage_users/manage-user.module';


@Module({
  imports: [
    SequelizeModule.forRoot(sequelizeConfig),
    ProfileModule,
    AddressModule,
    RoleModule,
    ManageUserModule
  ],
  providers: [ConsumerService],
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
