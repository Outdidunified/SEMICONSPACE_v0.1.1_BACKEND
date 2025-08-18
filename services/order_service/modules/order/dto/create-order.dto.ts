import { 
  IsArray, 
  IsNumber, 
  IsString, 
  IsUUID, 
  ValidateNested, 
  IsOptional, 
  IsObject 
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsString()
  productId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  qty!: number;

  @IsNumber()
  price!: number;

  @IsNumber()
  totalPrice!: number;

  @IsOptional()
  @IsString()
  package_type?: string;

  @IsOptional()
  @IsString()
  manufacturerPartNumber?: string;

  @IsOptional()
  @IsString()
  manufacturerName?: string;
}

class BillingDetailsDto {
  @IsString()
  first_name!: string;

  @IsString()
  last_name!: string;

  @IsString()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  address!: string;

  @IsString()
  country!: string;

  @IsString()
  state!: string;

  @IsString()
  city!: string;

  @IsString()
  pin!: string;
}

export class CreateOrderDto {
  @IsUUID()
  userId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsNumber()
  subtotal!: number;

  @IsNumber()
  gstAmount!: number;

  @IsNumber()
  shippingCharge!: number;

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
