// services/payment_service/modules/payment/payment.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Payment } from './payment.model';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto';
import { KafkaProducerService } from '../../kafka/producer.service';
import * as crypto from 'crypto';
import Razorpay = require('razorpay');
import * as dotenv from 'dotenv';

dotenv.config(); // Load environment variables before Razorpay

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);

    constructor(private readonly kafkaProducer: KafkaProducerService) { }

  async initiatePayment(order: any) {
  this.logger.log('Initiating payment for order:', order);

  // Ensure total is in rupees
  let totalInRupees = Number(order.total);

  // // If the total looks like paise (big number), convert to rupees
  // if (totalInRupees > 100000) {
  //   totalInRupees = totalInRupees / 100;
  // }

  if (!totalInRupees || totalInRupees < 1) {
    this.logger.error(`Invalid order total received: ${order.total}`);
    throw new Error('Invalid order total: must be at least ₹1');
  }

  // ✅ Custom maximum amount check
  const MAX_AMOUNT = 500000; // ₹5,00,000
  if (totalInRupees > MAX_AMOUNT) {
    const formattedTotal = totalInRupees.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const formattedMax = MAX_AMOUNT.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    this.logger.error(`Order total ₹${formattedTotal} exceeds maximum allowed ₹${formattedMax}`);
    throw new Error(`order total ₹${formattedTotal} exceeds maximum allowed ₹${formattedMax}`);
  }

  const amountInPaise = Math.round(totalInRupees * 100);

  this.logger.log(`Creating Razorpay order for ₹${totalInRupees} (${amountInPaise} paise)`);

  try {
    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise, // integer in paise
      currency: 'INR',
      receipt: String(order.orderId),
    });

    this.logger.log(`Razorpay order created: ${rzpOrder.id}`);

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
        totalprice: item.totalPrice ?? (item.price ? item.price * item.qty / 100 : 0),
      })),
    });

    this.logger.log(`Payment record created for order: ${order.orderId}`);

    return {
      razorpayOrderId: rzpOrder.id,
      orderId: order.orderId,
      userId: order.userId,
      amount: totalInRupees,
      currency: 'INR',
    };
  } catch (err: any) {
    this.logger.error('Razorpay order creation failed:', err.message, err);
    throw new Error(err?.description || err.message || 'Failed to create Razorpay order');
  }
}



    async confirmPayment(dto: ConfirmPaymentDto) {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = dto;

        // const generatedSignature = crypto
        //   .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        //   .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        //   .digest('hex');
        //
        // if (generatedSignature !== razorpaySignature) {
        //   throw new Error('Invalid signature');
        // }

        const payment = await Payment.findOne({ where: { razorpayOrderId } });
        if (!payment) throw new Error('Payment record not found');

        payment.status = 'success';
        payment.razorpayPaymentId = razorpayPaymentId;
        await payment.save();

        await this.kafkaProducer.produceEvent('payment.success', {
            orderId: payment.orderId,
            userId: payment.userId,
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: razorpayPaymentId,
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
            success: true,
            message: 'Payment confirmed successfully',
            data: {
                orderId: payment.orderId,
                userId: payment.userId,
                paymentId: razorpayPaymentId,
                razorpayOrderId: payment.razorpayOrderId,
                total: payment.total,
                status: payment.status,
                createdAt: payment.createdAt,
                items: payment.items.map((item) => ({
                    productId: item.productId,
                    qty: item.qty,
                    totalprice: item.totalprice,
                })),
            },
        };
    }

    async getRazorpayOrder(orderId: string) {
        const payment = await Payment.findOne({ where: { orderId } });

        if (!payment) {
            throw new Error('Razorpay Order not found');
        }

        return {
            razorpayOrderId: payment.razorpayOrderId,
            orderId: payment.orderId,
            userId: payment.userId,
            amount: payment.total,
            currency: 'INR',
        };
    }
} 