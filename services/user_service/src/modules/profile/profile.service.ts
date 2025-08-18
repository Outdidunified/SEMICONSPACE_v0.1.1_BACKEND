import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Profile } from '../../models/profile.model';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProducerService } from '../../kafka/producer.service';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly producer: ProducerService) {}

  // Get profile by userId
  async getProfile(userId: string) {
    this.logger.log(`Attempting to fetch profile for userId: ${userId}`);

    const profile = await Profile.findOne({ where: { userId } });

    if (!profile) {
      this.logger.warn(`Profile not found for userId: ${userId}`);
      throw new NotFoundException('Profile not found'); // HTTP 404
    }

    this.logger.log(`Profile successfully fetched for userId: ${userId}`);
    return profile; // ✅ return raw entity
  }

  // Update profile
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    this.logger.log(`Attempting to update profile for userId: ${userId}`);

    const existingProfile = await Profile.findOne({ where: { userId } });

    if (!existingProfile) {
      this.logger.warn(`Cannot update: Profile not found for userId: ${userId}`);
      throw new NotFoundException('Profile not found'); // HTTP 404
    }

    const updateData = {
      ...dto,
      userId,
      modified_by: dto.modified_by || dto.userId,
    };

    this.logger.log(
      `Upserting profile for userId: ${userId} with data: ${JSON.stringify(updateData)}`,
    );

    const [profile] = await Profile.upsert(updateData, { returning: true });

    this.logger.log(`Profile updated successfully for userId: ${userId}`);

    // Produce Kafka event
    try {
      await this.producer.produceEvent('user.updated', profile);
      this.logger.log(`Kafka event 'user.updated' produced for userId: ${userId}`);
    } catch (kafkaError) {
      this.logger.error(
        `Failed to produce Kafka event for userId: ${userId}`,
        kafkaError.stack,
      );
    }

    return profile; // ✅ return raw entity
  }
}
