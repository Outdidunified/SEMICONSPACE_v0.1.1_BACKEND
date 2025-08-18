import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Profile } from '../../models/profile.model'; // ✅ Import Profile model
import { ProducerService } from '../../kafka/producer.service';

@Module({
  imports: [SequelizeModule.forFeature([Profile])],
  controllers: [ProfileController],
  providers: [ProfileService, ProducerService],
})
export class ProfileModule {}
