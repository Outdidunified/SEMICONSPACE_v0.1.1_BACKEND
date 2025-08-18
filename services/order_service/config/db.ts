// src/config/db.config.ts

import { SequelizeModuleOptions } from '@nestjs/sequelize';
import { Order } from '../modules/order/order.model';
export const sequelizeConfig: SequelizeModuleOptions = {
  dialect: 'postgres',
  host: process.env.POSTGRES_HOST || '172.235.17.60',
  port: parseInt(process.env.POSTGRES_PORT || '3502'),
  username: process.env.POSTGRES_USER || 'semicon',
  password: process.env.POSTGRES_PASSWORD || 'semicon',
  database: process.env.POSTGRES_DB || 'semicon',
  models: [Order],
  autoLoadModels: true,
  synchronize: true, // use false in production
  logging: false,
};
