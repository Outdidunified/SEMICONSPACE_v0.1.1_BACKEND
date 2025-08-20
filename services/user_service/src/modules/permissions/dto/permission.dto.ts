import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PermissionDto {
  @IsString()
  module: string;

  @IsOptional()
  @IsString()
  sub_module?: string;   // 👈 make optional

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
}
