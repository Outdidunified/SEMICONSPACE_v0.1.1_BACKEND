import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateManagerOrderDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string; // JSON stringified billingDetails

  @IsOptional()
  @IsNumber()
  totalAmount?: number;
}
