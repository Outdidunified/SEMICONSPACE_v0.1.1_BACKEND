import { SequelizeModuleOptions } from '@nestjs/sequelize';
import { Payment } from '../modules/payment/payment.model';

export const sequelizeConfig: SequelizeModuleOptions = {
  dialect: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  models: [Payment],
  autoLoadModels: true,
  synchronize: true,
  logging: false,
};
