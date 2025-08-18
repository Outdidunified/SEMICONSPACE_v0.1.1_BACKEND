// services/order_service/kafka/producer.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
//producerservice
@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'user-order',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'], // fallback if env is undefined
  });

  private producer: Producer = this.kafka.producer();

  async onModuleInit() {
    try {
      await this.producer.connect();
      console.log(' Kafka producer connected');
    } catch (error) {
      const err = error as Error;
      console.error(' Kafka producer connection error:', err.message);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    console.log('Kafka producer disconnected');
  }

  async produceEvent(topic: string, message: object) {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }],
      });
      console.log(`Kafka event sent to [${topic}]:`, message);
    } catch (error) {
      const err = error as Error;
      console.error(' Failed to produce Kafka event:', err.message);
    }
  }
}
