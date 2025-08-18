
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { PaymentService } from '../modules/payment/payment.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  constructor(private readonly paymentService: PaymentService) {}

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'payment-service',
      brokers: [process.env.KAFKA_BROKER!],
    });

    const consumer = kafka.consumer({ groupId: 'payment-group' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'order.created' });

    await consumer.run({
  eachMessage: async ({ message }) => {
    try {
      const raw = message.value!.toString();
      console.log(' Kafka Received order.created message:', raw);
      const order = JSON.parse(raw);

      await this.paymentService.initiatePayment(order);
    } catch (err) {
      console.error(' Error handling order.created message:', err.message);
    }
  },
});
    console.log('Kafka consumer listening on topic: order.created');
  }
}
