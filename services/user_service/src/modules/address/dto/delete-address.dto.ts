import { IsUUID, IsArray, ArrayNotEmpty } from 'class-validator';

export class DeleteAddressDto {
  @IsUUID()
  userId: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'addressIds cannot be empty' })
  @IsUUID('all', { each: true, message: 'Each addressId must be a valid UUID' })
  addressIds: string[];
}
