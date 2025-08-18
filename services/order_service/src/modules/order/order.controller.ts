import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('order')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  @Post('createorder')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async placeOrder(@Body() payload: CreateOrderDto) {
    this.logger.log(`Placing order for user: ${payload.userId}`);

    const order = await this.orderService.createOrderFromPayload(payload);

    return {
      success: true,
      message: 'Order placed successfully',
      data: order,
    };
  }

  @Post('user-orders')
  @HttpCode(HttpStatus.OK)
  async getOrdersByUser(@Body('userId') userId: string) {
    this.logger.log(`Fetching orders for user: ${userId}`);

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const orders = await this.orderService.getOrdersByUser(userId);

    return {
      success: true,
      message: 'Orders fetched successfully',
      data: orders,
    };
  }

  @Get(':orderId')
  @HttpCode(HttpStatus.OK)
  async getOrder(@Param('orderId') orderId: string) {
    this.logger.log(`Fetching order with ID: ${orderId}`);

    if (!orderId) {
      throw new BadRequestException('Order ID is required');
    }

    const order = await this.orderService.getOrderById(orderId);

    return {
      success: true,
      message: 'Order fetched successfully',
      data: order,
    };
  }
}
