import { IsString, IsNotEmpty } from 'class-validator';

export class ConfirmPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'razorpayOrderId is required' })
  razorpayOrderId: string;

  @IsString()
  @IsNotEmpty({ message: 'razorpayPaymentId is required' })
  razorpayPaymentId: string;

  @IsString()
  @IsNotEmpty({ message: 'razorpaySignature is required' })
  razorpaySignature: string;
}
