import { Injectable, Logger } from '@nestjs/common';
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

  try {
    if (!userId) throw new Error('User ID is required');
    if (!billingDetails?.email) throw new Error('Billing details are required');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Items list is required');

    // Validate cart
    const cartUrl = `http://172.232.110.10:8005/cart/getallcartitems/${userId}`;
    let cartRes;
    try {
      cartRes = await axios.get(cartUrl);
    } catch (err: any) {
      this.logger.error(`Cart service unavailable: ${err.message}`);
      throw new Error(`Cart Service is not available: ${err.message}`);
    }

    const cartItems = cartRes.data?.data?.items || [];
    if (cartItems.length === 0) throw new Error('Cart is empty');

    for (const p of items) {
      const found = cartItems.find(
        (c: any) =>
          c.productId.toString().trim().toLowerCase() ===
            p.productId.toString().trim().toLowerCase() &&
          c.quantity >= p.qty,
      );
      if (!found) {
        throw new Error(`Product "${p.name}" not found in cart or insufficient quantity`);
      }
    }

    // Create order in DB, store manufacturer details & package_type per item
    const order = await Order.create({
      userId,
      items: items.map((it) => ({
        productId: it.productId,
        name: it.name,
        qty: it.qty,
        price: it.price,
        totalPrice: it.totalPrice,
        package_type: it.package_type,
        manufacturerPartNumber: it.manufacturerPartNumber,
        manufacturerName: it.manufacturerName,
      })),
      subtotal,
      gstAmount,
      shippingCharge,
      total,
      billingDetails,
      status: 'pending',
    });

    // Create Razorpay order via payment service
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
      throw new Error(`${err.response?.data?.message || err.message}`);
    }

    if (!paymentRes.data?.razorpayOrderId) {
      throw new Error('Failed to create Razorpay order');
    }

    // Emit Kafka event (order.created)
    await this.kafkaProducer.produceEvent('order.created', order.toJSON());

    this.logger.log(`Order created & payment initiated for user: ${userId}`);

    return {
      ...order.toJSON(),
      razorpayOrderId: paymentRes.data.razorpayOrderId,
      razorpayAmount: paymentRes.data.amount,
      currency: paymentRes.data.currency,
    };
  } catch (error: any) {
    this.logger.error(`Failed to create order or payment: ${error.message}`);
    throw new Error(error.message || 'Failed to create order');
  }
}


  async getOrderById(id: string) {
    const order = await Order.findByPk(id);
    if (!order) throw new Error('Order not found');

    return {
      ...order.toJSON(),
      deliveryAddress: order.billingDetails || {},
      items: Array.isArray(order.items) ? order.items : [],
    };
  }

  async getOrdersByUser(userId: string) {
    const orders = await Order.findAll({ where: { userId } });
    return orders.map((order) => order.toJSON());
  }

  async updateOrderStatus(id: string, status: string) {
    const order = await Order.findByPk(id);
    if (!order) throw new Error('Order not found');

    order.status = status;
    await order.save();

    await this.kafkaProducer.produceEvent('order.status.updated', order.toJSON());
    return order;
  }
} 

