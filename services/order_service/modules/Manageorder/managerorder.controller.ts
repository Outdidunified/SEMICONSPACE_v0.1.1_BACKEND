import { Controller, Get, Post, Put, Body } from '@nestjs/common';
import { ManagerOrderService } from './managerorder.service';
import { UpdateManagerOrderDto } from './dto/update-managerorder.dto';

@Controller('order/admin')
export class ManagerOrderController {
  constructor(private readonly orderService: ManagerOrderService) {}

  @Get('allorders')
  getAllOrders() {
    return this.orderService.findAll();
  }

  @Post('view')
  getOrderById(@Body('orderId') orderId: string) {
    return this.orderService.findOne(orderId);
  }

  @Put('update')
  updateOrder(@Body() dto: UpdateManagerOrderDto) {
    return this.orderService.update(dto.orderId, dto);
  }

  @Post('by-user')
  getOrdersByUserId(@Body('userId') userId: string) {
    return this.orderService.findByUserId(userId);
  }

  @Get('analytics') // GET /order/admin/analytics
getOrderAnalytics() {
  return this.orderService.getAnalytics();
}

}
