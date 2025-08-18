import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ManageUser } from './manage-user.model';
import { Profile } from '../../models/profile.model'; // ✅ Import Profile model
import { ManageUserController } from './manage-user.controller';
import { ManageUserService } from './manage-user.service';
import { ProducerService } from '../../kafka/producer.service';

@Module({
  imports: [SequelizeModule.forFeature([ManageUser, Profile])], // ✅ Register both models
  controllers: [ManageUserController],
  providers: [ManageUserService, ProducerService],
})
export class ManageUserModule {}
