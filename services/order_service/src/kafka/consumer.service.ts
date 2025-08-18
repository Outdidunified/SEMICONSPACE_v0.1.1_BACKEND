import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { Order } from '../../src/modules/order/order.model';
import { OrderService } from '../modules/order/order.service';
import axios from 'axios';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaConsumerService.name);

  constructor(private readonly orderService: OrderService) {}

  async onModuleInit() {
    try {
      const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
      const consumer = kafka.consumer({ groupId: 'order-group' });

      await consumer.connect();
      await consumer.subscribe({ topic: 'payment.success', fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (!message.value) return;
          try {
            const data = JSON.parse(message.value.toString());
            await this.handlePaymentSuccess(data);
          } catch (err) {
            this.logger.error('Failed to parse/process Kafka message', err.stack);
          }
        },
      });

      this.logger.log('✅ Kafka consumer running');
    } catch (err) {
      this.logger.error('⚠️ Kafka consumer failed to start', err.stack);
      // Retry connecting every 10s if Kafka fails
      setTimeout(() => this.onModuleInit(), 10000);
    }
  }

  private async handlePaymentSuccess(data: any) {
    const { orderId, razorpayOrderId, razorpayPaymentId } = data;
    const order = await Order.findByPk(orderId);
    if (!order) {
      this.logger.warn(`Order ${orderId} not found`);
      return;
    }

    order.status = 'confirmed';
    order.razorpayOrderId = razorpayOrderId;
    order.razorpayPaymentId = razorpayPaymentId;
    order.confirmedAt = new Date();
    await order.save();

    this.logger.log(`Order ${orderId} marked as confirmed`);

    try {
      const fullOrder = await this.orderService.getOrderById(orderId);
      const payload = this.buildExternalPayload(fullOrder);
      await axios.post('http://192.168.1.25:8010/shipway/receive-order', payload);
      this.logger.log(`Order ${orderId} sent to external API`);
    } catch (err) {
      this.logger.error(`Failed sending order ${orderId} to external API`, err.stack);
    }
  }

  private buildExternalPayload(fullOrder: any) {
    const { deliveryAddress, items } = fullOrder;
    const products = Array.isArray(items)
      ? items.map((item) => ({
          product: item.name,
          price: ((item.totalPrice ?? 0) / (item.qty ?? 1)).toFixed(2),
          product_code: item.productId,
          product_quantity: String(item.qty ?? 1),
        }))
      : [];

    const payload: any = {
      order_id: fullOrder.orderId,
      products,
      payment_type: 'PrePaid',
      shipping_country: deliveryAddress?.country ?? 'India',
      shipping_phone: deliveryAddress?.phone ?? null,
      shipping_zipcode: deliveryAddress?.pin ?? null,
      shipping_address: deliveryAddress?.address ?? null,
      shipping_city: deliveryAddress?.city ?? null,
      shipping_state: deliveryAddress?.state ?? null,
      shipping_firstname: deliveryAddress?.first_name ?? null,
      shipping_lastname: deliveryAddress?.last_name ?? null,
      order_date: new Date(fullOrder.createdAt).toISOString(),
      shipping: fullOrder.shippingCharge ?? 0,
      order_total: fullOrder.total ?? 0,
      taxes: fullOrder.gstAmount ?? 0,
    };

    Object.keys(payload).forEach((key) => (payload[key] == null) && delete payload[key]);
    return payload;
  }
}
