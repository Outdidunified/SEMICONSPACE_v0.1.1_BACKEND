// src/modules/address/dto/update-address.dto.ts
import { IsString, IsBoolean, IsUUID, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateAddressDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId: string;

  @IsUUID('4', { message: 'addressId is required and must be a valid UUID' })
  addressId: string;

  @IsOptional()
  @IsString({ message: 'address must be a string' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'pin must be a string' })
  pin?: string;

  @IsOptional()
  @IsString({ message: 'city must be a string' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'state must be a string' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'country must be a string' })
  country?: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be boolean' })
  isDefault?: boolean;

  @IsString({ message: 'modified_by is required' })
  @IsNotEmpty({ message: 'modified_by cannot be empty' })
  modified_by: string;
}
