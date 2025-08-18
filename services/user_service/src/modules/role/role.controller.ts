import { Controller, Post, Get, Param, Put, Body, Patch } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('user/roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post('/createrole')
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Get()
  findAll() {
    return this.roleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(+id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(+id, dto);
  }

  // @Patch(':id/status')
  // updateStatus(
  //   @Param('id') id: number,
  //   @Body('status') status: boolean,
  //   @Body('modified_by') modifiedBy: string,
  // ) {
  //   return this.roleService.updateStatus(+id, status, modifiedBy);
  // }
}
