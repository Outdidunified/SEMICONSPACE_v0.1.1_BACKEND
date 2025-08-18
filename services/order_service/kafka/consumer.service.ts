import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import axios from 'axios';
import { Order } from '../modules/order/order.model';
import { OrderService } from '../modules/order/order.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaConsumerService.name);

  constructor(private readonly orderService: OrderService) {}

  async onModuleInit() {
    const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER!] });
    const consumer = kafka.consumer({ groupId: 'order-group' });

    await consumer.connect();
    await consumer.subscribe({ topic: 'payment.success', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (topic === 'payment.success') {
          try {
            const data = JSON.parse(message.value.toString());
            const { orderId, razorpayOrderId, razorpayPaymentId } = data;

            const order = await Order.findByPk(orderId);
            if (!order) {
              this.logger.warn(`Order ${orderId} not found`);
              return;
            }

            // Update order status & payment info
            order.status = 'confirmed';
            order.razorpayOrderId = razorpayOrderId;
            order.razorpayPaymentId = razorpayPaymentId;
            order.confirmedAt = new Date();
            await order.save();

            this.logger.log(`Order ${orderId} marked as confirmed`);

            // Fetch fresh order details via OrderService
            const fullOrder = await this.orderService.getOrderById(orderId);
            const { deliveryAddress, items } = fullOrder;

            // Prepare payload for external API
            const products = Array.isArray(items)
              ? items.map((item) => ({
                  product: item.name || `Product-${item.productId}`,
                  price: ((item.totalPrice ?? item.totalprice) / item.qty).toFixed(2),
                  product_code: item.productId,
                  product_quantity: String(item.qty),
                  discount: item.discount || '0',
                  tax_rate: item.taxRate || '0',
                  tax_title: item.taxTitle || null,
                }))
              : [];

            const payload = {
              order_id: fullOrder.orderId,
              products,
              payment_type: 'PrePaid', // adjust if needed
              ewaybill: 'NA',
              shipping_country: deliveryAddress?.country || 'India',
              shipping_phone: deliveryAddress?.phone || null,
              shipping_zipcode: deliveryAddress?.pin || null,
              shipping_address: deliveryAddress?.address || null,
              shipping_city: deliveryAddress?.city || null,
              shipping_state: deliveryAddress?.state || null,
              shipping_firstname: deliveryAddress?.first_name || null,
              shipping_lastname: deliveryAddress?.last_name || null,
              order_date: new Date(fullOrder.createdAt).toISOString().slice(0, 19).replace('T', ' '),
              shipping: fullOrder.shippingCharge ?? 0,
              order_total: fullOrder.total,
              taxes: fullOrder.gstAmount ?? 0,
              order_weight: fullOrder.weight ?? null,
              box_length: fullOrder.length ?? null,
              box_breadth: fullOrder.breadth ?? null,
              box_height: fullOrder.height ?? null,
            };

            // Remove null or undefined keys
            Object.keys(payload).forEach(
              (key) =>
                (payload[key] === null || payload[key] === undefined) && delete payload[key],
            );

            // Send to external API
            const response = await axios.post(
              'http://192.168.1.25:8010/shipway/receive-order',
              payload,
            );

            this.logger.log(`Sent order ${orderId} to external API: ${JSON.stringify(response.data)}`);
          } catch (err: any) {
            this.logger.error(`Failed processing payment.success for order: ${err.message}`, err.stack);
          }
        }
      },
    });
  }
}
