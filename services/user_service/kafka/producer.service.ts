// producer.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class ProducerService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'user-service',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  });

  private producer: Producer = this.kafka.producer();

  async onModuleInit() {
    try {
      await this.producer.connect();
      console.log('Kafka producer connected');
    } catch (error) {
      console.error('Kafka producer connection error:', (error as Error).message);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    console.log('Kafka producer disconnected');
  }

  async produceEvent(topic: string, message: object) {
    try {
      const payload = {
        success: true,
        data: message,
      };

      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });

      console.log(`Kafka event sent to [${topic}]:`, payload);
    } catch (error) {
      const err = error as Error;
      const failurePayload = {
        success: false,
        error: err.message,
        data: message,
      };

      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(failurePayload) }],
      });

      console.error(' Failed to produce Kafka event:', err.message);
    }
  }
}
