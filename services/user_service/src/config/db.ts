import { SequelizeModuleOptions } from '@nestjs/sequelize';
import { Address } from '../modules/address/address.model';
import { Profile } from '../modules/profile/profile.model';
import { Role } from '../modules/role/role.model';
import { ManageUser } from '../modules/manage_users/manage-user.model';
// import { Permission } from '../modules/permission/permission.model'; // <-- Added
import { Permission } from '../modules/permissions/manage-permission.model'; // <-- Added

export const sequelizeConfig: SequelizeModuleOptions = {
  dialect: 'postgres',
  host: process.env.POSTGRES_HOST || '172.235.17.60',
  port: parseInt(process.env.POSTGRES_PORT || '3502'),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'semicon',
  models: [Profile, Address, Role, ManageUser, Permission], // <-- Added Permission
  autoLoadModels: true,
  synchronize: true,   // 👈 this creates table automatically
  logging: false,
  retry: { max: 10 },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};
