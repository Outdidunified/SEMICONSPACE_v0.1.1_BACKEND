import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
// import { Permission } from './permission.model';
import { Permission } from './manage-permission.model';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';

@Module({
  imports: [SequelizeModule.forFeature([Permission])],
  controllers: [PermissionController],
  providers: [PermissionService],
  exports: [PermissionService], // 👈 export if other modules (like Role) need permissions
})
export class PermissionModule {}
