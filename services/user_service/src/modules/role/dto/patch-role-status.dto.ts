import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class PatchRoleStatusDto {
  @IsBoolean()
  @IsNotEmpty({ message: 'status is required' })
  status: boolean;

  @IsString()
  @IsNotEmpty({ message: 'modified_by is required' })
  modified_by: string;
}