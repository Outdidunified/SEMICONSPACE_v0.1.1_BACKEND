// permission.service.ts
import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
// import { Permission } from './permission.model';
import { Permission } from './manage-permission.model';
import { BulkPermissionDto } from './dto/bulk-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
// import { MODULES } from './permission.constants';
import {MODULES} from './modules.config';
@Injectable()
export class PermissionService {
  constructor(
    @InjectModel(Permission)
    private readonly permissionModel: typeof Permission,
  ) {}

  async getModules() {
    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: 'Modules with submodules fetched',
      data: MODULES,
    };
  }

  async assignBulkPermissions(dto: BulkPermissionDto) {
    const results = [];

    for (const p of dto.permissions) {
      const existing = await this.permissionModel.findOne({
        where: { role_id: dto.role_id, module: p.module, sub_module: p.sub_module },
      });

      if (existing) {
        await existing.update(p);
        results.push({ action: 'updated', permission: existing });
      } else {
        const newPerm = await this.permissionModel.create({ ...p, role_id: dto.role_id });
        results.push({ action: 'created', permission: newPerm });
      }
    }

    return {
      statusCode: HttpStatus.OK,
      success: false,
      message: 'Permissions assigned/updated successfully',
      data: results,
    };
  }

  async findByRole(roleId: number) {
  const permissions = await this.permissionModel.findAll({ where: { role_id: roleId } });

  // Only keep permissions that exist in MODULES
  const filteredPermissions = permissions.filter((p) =>
    MODULES.some((m) =>
      m.module === p.module &&
      m.submodules.some((s) => s.name === p.sub_module)
    )
  );

  return {
    statusCode: 200,
    success: true,
    message: 'Permissions fetched successfully',
    data: filteredPermissions,
  };
}


 async update(permissionId: string, dto: UpdatePermissionDto) {
  const permission = await this.permissionModel.findByPk(permissionId);
  if (!permission) {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      success: false,
      message: 'Permission not found',
    };
  }

  // Only update the action flags and status, ignore module/sub_module
  const { can_create, can_view, can_update, can_delete, status } = dto;

  await permission.update({
    can_create,
    can_view,
    can_update,
    can_delete,
    status,
  });

  return {
    statusCode: HttpStatus.OK,
    success: true,
    message: 'Permission updated successfully',
    data: permission,
  };
}

}
