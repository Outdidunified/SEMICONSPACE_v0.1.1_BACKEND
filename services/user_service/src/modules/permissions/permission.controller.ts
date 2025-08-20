// permission.controller.ts
import { Controller, Post, Body, Get, Param, Put } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { BulkPermissionDto } from './dto/bulk-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Controller('user/permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  // Fetch all modules + submodules + actions
  @Get('modules')
  getModules() {
    return this.permissionService.getModules();
  }

  // Assign bulk permissions to a role
  @Post('bulk')
assignBulk(@Body() dto: BulkPermissionDto) {
  return this.permissionService.assignBulkPermissions(dto);
}


  // Get role permissions
  @Get(':roleId')
  findByRole(@Param('roleId') roleId: string) {
    return this.permissionService.findByRole(+roleId);
  }

  // Update specific permission by id
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionService.update(id, dto);
  }
}
