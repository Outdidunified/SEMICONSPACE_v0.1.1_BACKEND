import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
 
@Controller('order')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);
 
  constructor(private readonly orderService: OrderService) {}
 
  @Post('createorder')
  @HttpCode(HttpStatus.OK)
  async placeOrder(@Body() payload: CreateOrderDto) {
    try {
      const order = await this.orderService.createOrderFromPayload(payload);
      return { error: false, order };
    } catch (error) {
      this.logger.error('Order placement failed:', error.message);
      throw new HttpException(
        { error: true, message: error.message || 'Order placement failed' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
 
  @Post('user-orders')
  @HttpCode(HttpStatus.OK)
  async getOrdersByUser(@Body('userId') userId: string) {
    if (!userId) {
      throw new HttpException(
        { error: true, message: 'User ID is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
 
    try {
      const orders = await this.orderService.getOrdersByUser(userId);
      return { error: false, orders };
    } catch (error) {
      this.logger.error('Failed to fetch orders for user:', error.message);
      throw new HttpException(
        { error: true, message: error.message || 'Failed to fetch user orders' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
 
  @Get(':orderId')
  @HttpCode(HttpStatus.OK)
  async getOrder(@Param('orderId') orderId: string) {
    if (!orderId) {
      throw new HttpException(
        { error: true, message: 'Order ID is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
 
    try {
      const order = await this.orderService.getOrderById(orderId);
      return { error: false, order };
    } catch (error) {
      this.logger.error('Failed to fetch order:', error.message);
      throw new HttpException(
        { error: true, message: error.message || 'Failed to fetch order' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}