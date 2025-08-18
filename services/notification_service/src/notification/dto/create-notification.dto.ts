import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsNumber,
  IsEmail,
  IsBoolean,
} from 'class-validator';

export class CreateNotificationDto {
  @IsNumber()
  notificationId: number;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsDateString()
  timestamp: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsString()
  sent_to_userId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @IsOptional()
  @IsEmail()
  toEmail?: string;
}