// dto/create-role.dto.ts
export class CreateRoleDto {
  role_id: number;
  role_name: string;
  created_by: string;
  permissions?: {
    module: string;
    actions: string[]; // ['create', 'view', 'update']
  }[];
}
