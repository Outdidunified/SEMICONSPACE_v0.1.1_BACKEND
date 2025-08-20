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
  HttpException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number; // optional; will be derived from product service if not provided

  @IsOptional()
  @IsString()
  packageType?: string; // optional; will be derived from product service
}

@Controller('cart')
@UseInterceptors(ClassSerializerInterceptor)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => {
        const message =
          errors
            .map((e) => Object.values(e.constraints || {}).join(', '))
            .filter(Boolean)
            .join('; ') || 'Invalid input';
        return { error: true, message, data: {} };
      },
    }),
  )
  async addToCart(@Body() body: AddToCartDto) {
    const result = await this.cartService.handleAddToCart(body);
    if ((result as any).success === false) {
      // Throw to let GlobalErrorFilter format and send response once
      throw new HttpException(result, (result as any).statusCode || 400);
    }
    return result;
  }

  @Get('getallcartitems/:userId')
  async getCartItemsByUserId(@Param('userId') userId: string) {
    const result = await this.cartService.handleGetCartItems(userId);
    if ((result as any).success === false) {
      throw new HttpException(result, (result as any).statusCode || 400);
    }
    return result;
  }

  @Delete('removecartitem/:userId/:productId/:packageType')
  async removeFromCart(
    @Param('userId') userId: string,
    @Param('productId') productIdParam: string,
    @Param('packageType') packageType: string,
  ) {
    const result = await this.cartService.handleRemoveFromCart(userId, productIdParam, packageType);
    if ((result as any).success === false) {
      throw new HttpException(result, (result as any).statusCode || 400);
    }
    return result;
  }
}
