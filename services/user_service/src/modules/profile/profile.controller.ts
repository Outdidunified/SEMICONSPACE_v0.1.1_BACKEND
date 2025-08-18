import { Controller, Post, Body, Logger, UsePipes, ValidationPipe ,HttpStatus,HttpCode} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetProfileDto } from './dto/get-profile.dto';

@Controller('user/profile')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private readonly service: ProfileService) {}

  @Post('get')  
  @HttpCode(HttpStatus.OK)
  
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getProfile(@Body() dto: GetProfileDto) {
    this.logger.log(`Fetching profile for user: ${dto.userId}`);
    const profile = await this.service.getProfile(dto.userId);
    return {
      success: true,
      message: 'Profile fetched successfully',
      data: profile,
    };
  }

  @Post('update')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateProfile(@Body() dto: UpdateProfileDto) {
    this.logger.log(`Updating profile for user: ${dto.userId}`);
    const updated = await this.service.updateProfile(dto.userId, dto);
    return {
      success: true,
      message: 'Profile updated successfully',
      data: updated,
    };
  }
}
