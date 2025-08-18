import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'role_name is required' })
  role_name: string;

  @IsString()
  @IsNotEmpty({ message: 'modified_by is required' })
  modified_by: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  modified_date?: Date;
}
