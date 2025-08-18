// src/modules/profile/profile.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Profile } from '../../models/profile.model';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProducerService } from '../../kafka/producer.service';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly producer: ProducerService) {}

  async getProfile(userId: string) {
    this.logger.log(`Fetching profile for user: ${userId}`);
    try {
      const profile = await Profile.findOne({ where: { userId } });
      return profile;
    } catch (error) {
      this.logger.error(`Error fetching profile for user: ${userId}`, error.stack);
      throw new Error('Failed to fetch profile');
    }
  }

// src/modules/profile/profile.service.ts
async updateProfile(userId: string, dto: UpdateProfileDto) {
  this.logger.log(`Updating profile for user: ${userId}`);

  const existingProfile = await Profile.findOne({ where: { userId } });
  if (!existingProfile) {
    throw new Error('Profile not found for the current user');
  }

  const updateData = {
    ...dto,
    userId,
    modified_by: dto.modified_by || dto.userId,
  };

  const [profile] = await Profile.upsert(updateData, { returning: true });

  await this.producer.produceEvent('user.updated', profile);
  return profile;
}

}
