import { Controller, Get, Post, Put, Body, HttpCode, HttpStatus, BadRequestException, UsePipes, ValidationPipe } from '@nestjs/common';
import { ManagerOrderService } from './managerorder.service';
import { UpdateManagerOrderDto } from './dto/update-managerorder.dto';

@Controller('order/admin')
export class ManagerOrderController {
  constructor(private readonly orderService: ManagerOrderService) {}

  @Get('allorders')
  @HttpCode(HttpStatus.OK)
  async getAllOrders() {
    const data = await this.orderService.findAll();
    return { success: true, message: 'Orders fetched successfully', data };
  }

  @Post('view')
  @HttpCode(HttpStatus.OK)
  async getOrderById(@Body('orderId') orderId: string) {
    if (!orderId) throw new BadRequestException('Order ID is required');
    const data = await this.orderService.findOne(orderId);
    return { success: true, message: 'Order fetched successfully', data };
  }

  @Put('update')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateOrder(@Body() dto: UpdateManagerOrderDto) {
    if (!dto?.orderId) throw new BadRequestException('Order ID is required');
    const data = await this.orderService.update(dto.orderId, dto);
    return { success: true, message: 'Order updated successfully', data };
  }

  @Post('by-user')
  @HttpCode(HttpStatus.OK)
  async getOrdersByUserId(@Body('userId') userId: string) {
    if (!userId) throw new BadRequestException('User ID is required');
    const data = await this.orderService.findByUserId(userId);
    return { success: true, message: 'Orders fetched successfully', data };
  }

  @Get('analytics') // GET /order/admin/analytics
  @HttpCode(HttpStatus.OK)
  async getOrderAnalytics() {
    const data = await this.orderService.getAnalytics();
    return { success: true, message: 'Order analytics fetched successfully', data };
  }
}