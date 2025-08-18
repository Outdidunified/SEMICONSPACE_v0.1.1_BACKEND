import { Body, Controller, Post,Get } from '@nestjs/common';
import { ManageUserService } from './manage-user.service';
import { CreateManageUserDto } from './dto/create-manage-user.dto';
import { UpdateManageUserDto } from './dto/update-manage-user.dto';

@Controller('user/manage_users')
export class ManageUserController {
  constructor(private readonly userService: ManageUserService) {}

  @Post('create')
  create(@Body() dto: CreateManageUserDto) {
     console.log('👉 Incoming DTO:', dto); // Check what you're actually getting
    return this.userService.create(dto);
  }

 @Get('getall')
findAll() {
  return this.userService.findAll();
}


  @Post('getone')
  findOne(@Body() body: { userId: string }) {
    return this.userService.findOne(body.userId);
  }

 @Post('update')
update(@Body() dto: UpdateManageUserDto & { userId: string; modified_by: string }) {
  return this.userService.update(dto.userId, dto);
}

@Get('stats')
getUserStats() {
  return this.userService.getUserStats();
}


  // @Post('status')
  // toggleStatus(@Body() body: { userId: string; status: boolean; modified_by: string }) {
  //   return this.userService.toggleStatus(body.userId, body.status, body.modified_by);
  // }
}
