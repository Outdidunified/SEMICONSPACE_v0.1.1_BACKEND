import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PermissionDto } from './permission.dto';

export class BulkPermissionDto {
  @IsNumber()
  role_id: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
