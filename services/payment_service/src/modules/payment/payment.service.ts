import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Payment } from './payment.model';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto';
import { KafkaProducerService } from '../../kafka/producer.service';
import Razorpay = require('razorpay');
import * as dotenv from 'dotenv';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async initiatePayment(order: any) {
    this.logger.log(`Starting payment initiation for orderId: ${order?.orderId}`);

    const totalInRupees = Number(order.total);
    if (!totalInRupees || totalInRupees < 1) throw new BadRequestException('Invalid order total: must be at least ₹1');

    const MAX_AMOUNT = 500000;
    if (totalInRupees > MAX_AMOUNT) throw new BadRequestException(`Order total ₹${totalInRupees} exceeds maximum ₹${MAX_AMOUNT}`);

    const amountInPaise = Math.round(totalInRupees * 100);

    try {
      const rzpOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: String(order.orderId),
      });

      await Payment.create({
        orderId: order.orderId,
        userId: order.userId,
        razorpayOrderId: rzpOrder.id,
        razorpayPaymentId: '',
        status: 'pending',
        total: totalInRupees,
        items: order.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          totalprice: item.totalPrice ?? item.price * item.qty,
        })),
      });

      this.logger.log(`Payment record created for orderId: ${order.orderId}`);

      return {
        razorpayOrderId: rzpOrder.id,
        orderId: order.orderId,
        userId: order.userId,
        amount: totalInRupees,
        currency: 'INR',
      };
    } catch (err: any) {
      this.logger.error(`Razorpay order creation failed for orderId: ${order?.orderId}`, err.stack);
      throw new BadRequestException(err?.description || err.message || 'Failed to create Razorpay order');
    }
  }

 async confirmPayment(dto: ConfirmPaymentDto) {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = dto;

  // Ensure all fields are provided
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new BadRequestException(
      'All payment fields are required: razorpayOrderId, razorpayPaymentId, razorpaySignature'
    );
  }

  const payment = await Payment.findOne({ where: { razorpayOrderId } });
  if (!payment) throw new NotFoundException('Payment record not found');

  // ✅ Prevent multiple confirmations
  if (payment.status === 'success') {
    throw new BadRequestException('Payment is already confirmed');
  }

  // Update payment record
  payment.status = 'success';
  payment.razorpayPaymentId = razorpayPaymentId;
  await payment.save();

  // Produce Kafka event
  await this.kafkaProducer.produceEvent('payment.success', {
    orderId: payment.orderId,
    userId: payment.userId,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId,
    status: 'success',
    total: payment.total,
    createdAt: payment.createdAt,
    items: payment.items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
      totalprice: item.totalprice,
    })),
  });

  return {
    data: {
      orderId: payment.orderId,
      userId: payment.userId,
      paymentId: razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      total: payment.total,
      status: payment.status,
      createdAt: payment.createdAt,
      items: payment.items,
    },
  };
}



  async getRazorpayOrder(orderId: string) {
    this.logger.log(`Fetching Razorpay order for orderId: ${orderId}`);

    const payment = await Payment.findOne({ where: { orderId } });
    if (!payment) throw new NotFoundException('Razorpay order not found');

    return {
      razorpayOrderId: payment.razorpayOrderId,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: payment.total,
      currency: 'INR',
    };
  }
}
