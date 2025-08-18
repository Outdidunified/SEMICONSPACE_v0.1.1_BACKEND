// cart.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  UseInterceptors,
  ClassSerializerInterceptor,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, NotEquals, IsOptional } from 'class-validator';

export class AddToCartDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;  // required, coming from user request

  @IsOptional()
  @IsString()
  packageType?: string;
}


@Controller('cart')
@UseInterceptors(ClassSerializerInterceptor)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  @UsePipes(new ValidationPipe({ transform: true }))
  async addToCart(@Body() body: AddToCartDto) {
    return this.cartService.handleAddToCart(body);
  }

  @Get('getallcartitems/:userId')
  async getCartItemsByUserId(@Param('userId') userId: string) {
    return this.cartService.handleGetCartItems(userId);
  }

  @Delete('removecartitem/:userId/:productId')
  async removeFromCart(
    @Param('userId') userId: string,
    @Param('productId') productIdParam: string
  ) {
    return this.cartService.handleRemoveFromCart(userId, productIdParam);
  }
}
