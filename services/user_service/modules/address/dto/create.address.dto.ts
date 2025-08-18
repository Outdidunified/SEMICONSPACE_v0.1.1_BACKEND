

// src/modules/address/dto/create.address.dto.ts
import { IsString, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateAddressDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  pin?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  state?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  modified_by?: string;

  
}

