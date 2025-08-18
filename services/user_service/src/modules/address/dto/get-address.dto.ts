// src/modules/address/dto/get-address.dto.ts
import { IsUUID, IsNotEmpty } from 'class-validator';

export class GetAddressDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'userId cannot be empty' })
  userId: string;
}
