// cart.kafka.controller.ts
import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CartService } from './cart.service';

@Controller()
export class CartKafkaController {
  constructor(private readonly cartService: CartService) {}

  @MessagePattern('cart.events')
  async handleCartEvent(message: {
    userId: string;
    action: string;
    productId?: string;
    quantity?: number;
    price?: number;
    packageType?: string;
  }) {
    return await this.cartService.handleKafkaCartEvent(message);
  }
}