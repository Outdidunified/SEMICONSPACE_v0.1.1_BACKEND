import { IsString, IsOptional, IsNumber,IsNotEmpty } from 'class-validator';

export class UpdateManagerOrderDto {
@IsString()
  @IsNotEmpty()
  orderId: string;   // ✅ Required field

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
