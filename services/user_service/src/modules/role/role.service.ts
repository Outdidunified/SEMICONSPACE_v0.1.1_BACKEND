import { Injectable, HttpException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from './role.model';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
  ) {}

  async create(dto: CreateRoleDto): Promise<any> {
    try {
      // Always increment the role_id by finding current MAX(role_id)
      const lastRole = await this.roleModel.findOne({ order: [['role_id', 'DESC']] });
      const nextRoleId = lastRole ? lastRole.role_id + 1 : 1;

      // Allow duplicate role_name as per requirement
      const role = await this.roleModel.create({
        role_id: nextRoleId,
        role_name: dto.role_name,
        created_by: dto.created_by || 'system',
        created_date: new Date(),
        status: true,
      });

      return {
        success: true,
        message: 'Role created successfully',
        data: role,
      };
    } catch (error) {
      console.error('❌ Error in create():', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Internal Server Error', 500);
    }
  }

  async findAll(): Promise<any> {
    try {
      const roles = await this.roleModel.findAll();
      return {
        success: true,
        message: 'Roles fetched successfully',
        data: roles,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch roles', 500);
    }
  }

  async findOne(id: number): Promise<any> {
    try {
      const role = await this.roleModel.findOne({ where: { role_id: id } });

      if (!role) {
        throw new HttpException(`Role with ID ${id} not found`, 404);
      }

      return {
        success: true,
        message: 'Role fetched successfully',
        data: role,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch role', 500);
    }
  }

  async update(roleId: number, dto: UpdateRoleDto): Promise<any> {
    try {
      const role = await this.roleModel.findOne({ where: { role_id: roleId } });

      if (!role) {
        throw new HttpException(`Role with ID ${roleId} does not exist`, 404);
      }

      const hasRoleNameChanged = dto.role_name && dto.role_name !== role.role_name;
      const hasStatusChanged = typeof dto.status === 'boolean' && dto.status !== role.status;
      const hasModifiedByChanged = dto.modified_by && dto.modified_by !== role.modified_by;

      if (!hasRoleNameChanged && !hasStatusChanged && !hasModifiedByChanged) {
        throw new HttpException('No changes detected. Role is already up to date.', 402);
      }

      await role.update({
        ...(hasRoleNameChanged && { role_name: dto.role_name }),
        ...(hasStatusChanged && { status: dto.status }),
        modified_by: dto.modified_by,
        modified_date: new Date(),
      });

      const changes: string[] = [];
      if (hasRoleNameChanged) changes.push('role name');
      if (hasStatusChanged) changes.push(`status (${dto.status ? 'activated' : 'deactivated'})`);

      return {
        success: true,
        message: `Updated ${changes.join(' and ')} successfully by ${dto.modified_by}`,
        data: role,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('An unexpected error occurred while updating the role. Please try again later.', 500);
    }
  }

  async updateStatus(roleId: number, status: boolean, modifiedBy: string): Promise<any> {
    try {
      const role = await this.roleModel.findOne({ where: { role_id: roleId } });

      if (!role) {
        throw new HttpException('Role not found', 404);
      }

      if (typeof status === 'boolean' && role.status === status) {
        throw new HttpException('No changes made', 402);
      }

      await role.update({
        status,
        modified_by: modifiedBy,
        modified_date: new Date(),
      });

      return {
        success: true,
        message: status ? 'Activated successfully' : 'Deactivated successfully',
        data: { updatedStatus: status, modifiedBy },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to update role status', 500);
    }
  }
}