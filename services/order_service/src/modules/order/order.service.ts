import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { Order } from './order.model';
import { KafkaProducerService } from '../../kafka/producer.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

 async createOrderFromPayload(payload: CreateOrderDto) {
  const {
    userId,
    billingDetails,
    items,
    subtotal,
    gstAmount,
    shippingCharge,
    total,
  } = payload;


  // 🔹 Validate cart with cart service
  const cartUrl = `http://172.232.110.10:8005/cart/getallcartitems/${userId}`;
  let cartRes;
  try {
    cartRes = await axios.get(cartUrl);
  } catch (err: any) {
    this.logger.error(`Cart service unavailable: ${err.message}`);
    throw new ServiceUnavailableException('Cart Service is not available');
  }

  const cartItems = cartRes.data?.data?.items || [];
  if (cartItems.length === 0) throw new BadRequestException('Cart is empty');

  for (const p of items) {
    const found = cartItems.find(
      (c: any) =>
        c.productId.toString().trim().toLowerCase() ===
          p.productId.toString().trim().toLowerCase() &&
        c.quantity >= p.qty,
    );
    if (!found) {
      throw new BadRequestException(
        `Product "${p.name}" not found in cart or insufficient quantity`,
      );
    }
  }

  // 🔹 Save order in DB
  const order = await Order.create({
    userId,
    items,
    subtotal,
    gstAmount,
    shippingCharge,
    total,
    billingDetails,
    status: 'pending',
  });

  // 🔹 Call payment service
  const paymentServiceUrl = `http://172.232.110.10:8007/payment/initiate`;
  let paymentRes;
  try {
    paymentRes = await axios.post(paymentServiceUrl, {
      orderId: order.orderId,
      userId: order.userId,
      total: order.total,
      items: order.items,
    });
  } catch (err: any) {
    this.logger.error(`Payment service failed: ${err.message}`);
    throw new BadRequestException(
      err.response?.data?.message || 'Payment initiation failed',
    );
  }

  if (!paymentRes.data?.razorpayOrderId) {
    throw new BadRequestException('Failed to create Razorpay order');
  }

  // 🔹 Emit Kafka event
  try {
    await this.kafkaProducer.produceEvent('order.created', order.toJSON());
    this.logger.log(`Kafka event 'order.created' produced for userId: ${userId}`);
  } catch (kafkaError) {
    this.logger.error(`Failed to produce Kafka event`, kafkaError.stack);
  }

  this.logger.log(`Order created & payment initiated for user: ${userId}`);

  return {
    ...order.toJSON(),
    razorpayOrderId: paymentRes.data.razorpayOrderId,
    razorpayAmount: paymentRes.data.amount,
    currency: paymentRes.data.currency,
  };
}

  async getOrderById(id: string) {
    const order = await Order.findByPk(id);
    if (!order) throw new NotFoundException('Order not found');

    return {
      ...order.toJSON(),
      deliveryAddress: order.billingDetails || {},
      items: Array.isArray(order.items) ? order.items : [],
    };
  }

  async getOrdersByUser(userId: string) {
    const orders = await Order.findAll({ where: { userId } });
    if (!orders || orders.length === 0) {
      throw new NotFoundException('No orders found for this user');
    }
    return orders.map((order) => order.toJSON());
  }

  
}
