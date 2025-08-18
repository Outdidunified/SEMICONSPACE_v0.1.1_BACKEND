// src/modules/profile/dto/update-profile.dto.ts
import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';

export class UpdateProfileDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;


  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  role_id?: string;

  @IsOptional()
  @IsString()
  modified_by?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean; 
}
