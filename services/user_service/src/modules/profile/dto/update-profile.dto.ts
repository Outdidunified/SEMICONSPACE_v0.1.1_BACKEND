import { IsString, IsUUID, IsBoolean, IsEmail, IsNumber,IsNotEmpty } from 'class-validator';

export class UpdateProfileDto {
  @IsUUID('4', { message: 'userId is required and must be a valid UUID' })
  userId: string;

  @IsString({ message: 'first_name is required' })
  first_name: string;

  @IsString({ message: 'last_name is required' })
  last_name: string;

  @IsEmail({}, { message: 'email is required and must be a valid email' })
  email: string;

  @IsString({ message: 'phone is required' })
  phone: string;

  @IsString({ message: 'password is required' })
  password: string;

  @IsString({ message: 'role must be a string' })
  @IsNotEmpty({ message: 'role is required' })
  role: string;

  @IsNumber({}, { message: 'role_id is required and must be a number' })
  role_id: number;

  @IsString({ message: 'modified_by is required' })
  modified_by: string;

  @IsBoolean({ message: 'status is required and must be boolean' })
  status: boolean;
}
