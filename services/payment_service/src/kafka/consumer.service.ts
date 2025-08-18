import { Injectable, Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { PaymentService } from '../modules/payment/payment.service';

@Injectable()
export class KafkaConsumerService {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: any;

  constructor(private readonly paymentService: PaymentService) {}

  async startConsumer() {
    try {
      const kafka = new Kafka({
        clientId: 'payment-service',
        brokers: [process.env.KAFKA_BROKER!],
      });

      this.consumer = kafka.consumer({ groupId: 'payment-group' });
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: 'order.created' });

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const raw = message.value!.toString();
            this.logger.log(`Kafka Received order.created: ${raw}`);
            const order = JSON.parse(raw);

            await this.paymentService.initiatePayment(order);
          } catch (err) {
            this.logger.error('Error processing Kafka message', err?.message);
          }
        },
      });

      this.logger.log('Kafka consumer listening on topic: order.created');
    } catch (err) {
      this.logger.error('Failed to start Kafka consumer, continuing without it', err?.stack);
    }
  }

  async stopConsumer() {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    }
  }
}
