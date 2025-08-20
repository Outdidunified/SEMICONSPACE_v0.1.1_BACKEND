// dto/create-role.dto.ts
import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';

export class CreateRoleDto {
  @IsOptional()
  @IsNumber()
  role_id?: number; // system-managed

  @IsOptional() // let Joi enforce required
  @IsString()
  role_name!: string;

  @IsOptional() // let Joi enforce required
  @IsString()
  created_by!: string;

  @IsOptional()
  @IsArray()
  permissions?: {
    module: string;
    actions: string[]; // ['create', 'view', 'update']
  }[];
}
