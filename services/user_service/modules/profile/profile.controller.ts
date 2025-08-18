// src/modules/profile/profile.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('user/profile')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private readonly service: ProfileService) {}

  @Post('get')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getProfile(@Body('userId') userId: string) {
    if (!userId) {
      throw new HttpException({ error: true, message: 'User ID is required' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const profile = await this.service.getProfile(userId);
      if (!profile) {
        throw new HttpException({ error: true, message: 'Profile not found' }, HttpStatus.NOT_FOUND);
      }
      return { error: false, profile };
    } catch (error) {
      this.logger.error(`Error fetching profile: ${error.message}`);
      throw new HttpException({ error: true, message: 'Failed to fetch profile' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('update')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateProfile(@Body() dto: UpdateProfileDto) {
    if (!dto.userId) {
      throw new HttpException({ error: true, message: 'User ID is required' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const profile = await this.service.updateProfile(dto.userId, dto);
      return {
        error: false,
        message: 'Profile updated successfully',
        profile,
      };
    } catch (error) {
      this.logger.error('Failed to update profile:', error.message);
      throw new HttpException(
        { error: true, message: error.message || 'Failed to update profile' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
