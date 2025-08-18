import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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
      const normalizedInput = dto.role_name.toLowerCase().replace(/\s+/g, '');
      const allRoles = await this.roleModel.findAll({ order: [['role_id', 'ASC']] });

      const existingByName = allRoles.find(
        r => r.role_name.toLowerCase().replace(/\s+/g, '') === normalizedInput,
      );

      if (existingByName) {
        return {
          statusCode: HttpStatus.CONFLICT,
          error: true,
          message: 'Role Name already exists',
        };
      }

      const endUser = allRoles.find(
        r => r.role_name.toLowerCase().replace(/\s+/g, '') === 'enduser',
      );

      let insertRoleId: number;

      if (endUser) {
        insertRoleId = endUser.role_id;

        for (let i = allRoles.length - 1; i >= 0; i--) {
          if (allRoles[i].role_id >= insertRoleId) {
            await allRoles[i].update({ role_id: allRoles[i].role_id + 1 });
          }
        }
      } else {
        const maxRoleId = allRoles.length > 0 ? allRoles[allRoles.length - 1].role_id : 0;
        insertRoleId = maxRoleId + 1;
      }

      const role = await this.roleModel.create({
        role_id: insertRoleId,
        role_name: dto.role_name,
        created_by: dto.created_by || 'system',
        created_date: new Date(),
        status: true,
      });

      return {
        statusCode: HttpStatus.CREATED,
        error: false,
        message: 'Role created successfully',
        data: role,
      };
    } catch (error) {
      console.error('❌ Error in create():', error);
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: 'Internal Server Error',
      };
    }
  }

  async findAll(): Promise<any> {
    try {
      const roles = await this.roleModel.findAll();
      return {
        statusCode: HttpStatus.OK,
        error: false,
        message: 'Roles fetched successfully',
        data: roles,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: 'Failed to fetch roles',
      };
    }
  }

  async findOne(id: number): Promise<any> {
    try {
      const role = await this.roleModel.findOne({ where: { role_id: id } });

      if (!role) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: true,
          message: `Role with ID ${id} not found`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        error: false,
        message: 'Role fetched successfully',
        data: role,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: 'Failed to fetch role',
      };
    }
  }
async update(roleId: number, dto: UpdateRoleDto): Promise<any> {
  try {
    const role = await this.roleModel.findOne({ where: { role_id: roleId } });

    if (!role) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        error: true,
        message: `Role with ID ${roleId} does not exist`,
      };
    }

    const hasRoleNameChanged = dto.role_name && dto.role_name !== role.role_name;
    const hasStatusChanged = typeof dto.status === 'boolean' && dto.status !== role.status;
    const hasModifiedByChanged = dto.modified_by && dto.modified_by !== role.modified_by;

    if (!hasRoleNameChanged && !hasStatusChanged && !hasModifiedByChanged) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: true,
        message: 'No changes detected. Role is already up to date.',
      };
    }

    await role.update({
      ...(hasRoleNameChanged && { role_name: dto.role_name }),
      ...(hasStatusChanged && { status: dto.status }),
      modified_by: dto.modified_by,
      modified_date: new Date(),
    });

    const changes = [];
    if (hasRoleNameChanged) changes.push('role name');
    if (hasStatusChanged) changes.push(`status (${dto.status ? 'activated' : 'deactivated'})`);

    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: `Updated ${changes.join(' and ')} successfully by ${dto.modified_by}`,
      data: role,
    };
  } catch (error) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: true,
      message: 'An unexpected error occurred while updating the role. Please try again later.',
    };
  }
}


//   async updateStatus(roleId: number, status: boolean, modifiedBy: string): Promise<any> {
//   try {
//     const role = await this.roleModel.findOne({ where: { role_id: roleId } });

//     if (!role) {
//       return {
//         statusCode: HttpStatus.NOT_FOUND,
//         error: true,
//         message: 'Role not found',
//       };
//     }

//     if (role.status === status) {
//       return {
//         statusCode: HttpStatus.BAD_REQUEST,
//         error: true,
//         message: 'No changes made',
//       };
//     }

//     await role.update({
//       status,
//       modified_by: modifiedBy,
//       modified_date: new Date(),
//     });

//     return {
//       statusCode: HttpStatus.OK,
//       error: false,
//       message: status ? 'Activated successfully' : 'Deactivated successfully',
//       updatedStatus: status,
//       modifiedBy,
//     };
//   } catch (error) {
//     return {
//       statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
//       error: true,
//       message: 'Failed to update role status',
//     };
//   }
// }

}
