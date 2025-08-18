import { 
  IsArray, 
  IsNumber, 
  IsString, 
  IsUUID, 
  ValidateNested, 
  IsOptional, 
  IsObject, 
  IsNotEmpty 
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  qty!: number;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @Type(() => Number)
  @IsNumber()
  totalPrice!: number;

  @IsNotEmpty()
  @IsString()
  package_type?: string;

  @IsNotEmpty()
  @IsString()
  manufacturerPartNumber?: string;

  @IsNotEmpty()
  @IsString()
  manufacturerName?: string;
}

class BillingDetailsDto {
  @IsString()
  @IsNotEmpty()
  first_name!: string;

  @IsString()
  @IsNotEmpty()
  last_name!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  pin!: string;
}

export class CreateOrderDto {
  @IsUUID()
  userId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @Type(() => Number)
  @IsNumber()
  subtotal!: number;

  @Type(() => Number)
  @IsNumber()
  gstAmount!: number;

  @Type(() => Number)
  @IsNumber()
  shippingCharge!: number;

  @Type(() => Number)
  @IsNumber()
  total!: number;

  @IsOptional()
  @IsString()
  razorpayOrderId?: string;

  @IsOptional()
  @IsString()
  razorpayPaymentId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => BillingDetailsDto)
  billingDetails!: BillingDetailsDto;
}
