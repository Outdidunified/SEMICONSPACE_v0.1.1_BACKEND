import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ManagerOrder } from './managerorder.model';
import { ManagerOrderService } from './managerorder.service';
import { ManagerOrderController } from './managerorder.controller';

@Module({
  imports: [SequelizeModule.forFeature([ManagerOrder])],
  providers: [ManagerOrderService],
  controllers: [ManagerOrderController],
})
export class ManagerOrderModule {}
