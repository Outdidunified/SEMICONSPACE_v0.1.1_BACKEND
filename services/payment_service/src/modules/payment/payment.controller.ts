import { Controller, Post, Body, Get, Param, Logger ,BadRequestException} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post('initiate')
  async initiatePayment(@Body() order: any) {
    this.logger.log(`Initiating payment for orderId: ${order?.orderId}`);
    const result = await this.paymentService.initiatePayment(order);
    return {
      success: true,
      message: 'Payment initiated successfully',
      data: result,
    };
  }

 @Post('confirm')
async confirm(@Body() dto: ConfirmPaymentDto) {
  this.logger.log(`Confirming payment for Razorpay Order: ${dto.razorpayOrderId}`);

  // Optional extra safeguard in case ValidationPipe is not used
  if (!dto.razorpayOrderId || !dto.razorpayPaymentId || !dto.razorpaySignature) {
    throw new BadRequestException(
      'razorpayOrderId, razorpayPaymentId, and razorpaySignature are required'
    );
  }

  const result = await this.paymentService.confirmPayment(dto);

  return {
    success: true,
    message: 'Payment confirmed successfully',
    data: result.data,
  };
}



  @Get('razorpay-order/:orderId')
  async getRazorpayOrder(@Param('orderId') orderId: string) {
    this.logger.log(`Fetching Razorpay order for orderId: ${orderId}`);
    const result = await this.paymentService.getRazorpayOrder(orderId);
    return {
      success: true,
      message: 'Razorpay order fetched successfully',
      data: result,
    };
  }
}
