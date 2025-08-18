// src/modules/address/dto/create-address.dto.ts
import { IsString, IsOptional, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateAddressDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'userId cannot be empty' }) // <-- Add this
  userId: string;

  @IsOptional()
  @IsUUID('4', { message: 'addressId must be a valid UUID' })
  addressId?: string;

  @IsString({ message: 'address is required' })
  @IsNotEmpty({ message: 'address cannot be empty' })
  address: string;

  @IsString({ message: 'pin is required' })
  @IsNotEmpty({ message: 'pin cannot be empty' })
  pin: string;

  @IsString({ message: 'city is required' })
  @IsNotEmpty({ message: 'city cannot be empty' })
  city: string;

  @IsString({ message: 'state is required' })
  @IsNotEmpty({ message: 'state cannot be empty' })
  state: string;

  @IsString({ message: 'country is required' })
  @IsNotEmpty({ message: 'country cannot be empty' })
  country: string;

  @IsOptional()
  @IsString({ message: 'modified_by must be a string' })
  modified_by?: string;
}
