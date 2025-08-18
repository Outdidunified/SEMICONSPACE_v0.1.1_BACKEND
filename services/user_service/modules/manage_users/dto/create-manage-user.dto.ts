// create-manage-user.dto.ts
export class CreateManageUserDto {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  role_id: number;
  created_by: string; // <-- Add this
}
