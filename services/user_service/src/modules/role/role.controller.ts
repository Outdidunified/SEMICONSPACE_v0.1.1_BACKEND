import { Controller, Post, Get, Param, Put, Body, Patch, UsePipes, HttpCode } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JoiValidationPipe } from '../../middlewares/joiValidation.pipe';
import { createRoleSchema } from './dto/create-role.schema';
import { PatchRoleStatusDto } from './dto/patch-role-status.dto';

@Controller('user/roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post('/createrole')
  @HttpCode(200)
  @UsePipes(new JoiValidationPipe(createRoleSchema))
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

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: PatchRoleStatusDto,
  ) {
    return this.roleService.updateStatus(+id, dto.status, dto.modified_by);
  }
}
