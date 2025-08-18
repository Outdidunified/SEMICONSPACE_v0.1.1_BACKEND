export class UpdateManageUserDto {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
  role_id?: number;
  status?: boolean; // 👈 for activating/deactivating
  modified_by: string;
}
