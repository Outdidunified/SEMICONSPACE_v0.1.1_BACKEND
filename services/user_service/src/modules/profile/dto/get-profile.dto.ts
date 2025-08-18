// src/modules/profile/dto/get-profile.dto.ts
import { IsUUID, IsNotEmpty } from 'class-validator';

export class GetProfileDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'userId cannot be empty' })
  userId: string;
}
