import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePermissionDto {
  @IsOptional()
  @IsBoolean()
  can_create?: boolean;

  @IsOptional()
  @IsBoolean()
  can_view?: boolean;

  @IsOptional()
  @IsBoolean()
  can_update?: boolean;

  @IsOptional()
  @IsBoolean()
  can_delete?: boolean;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  // module/sub_module sent only for reference, not updated
  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  sub_module?: string;
}
