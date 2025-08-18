
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'payment-service',
    brokers: [process.env.KAFKA_BROKER!],
  });

  private producer = this.kafka.producer();

  async onModuleInit() {
    await this.producer.connect();
    console.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

 async produceEvent(topic: string, data: any) {
  console.log(` Producing event to topic: ${topic}`);
  console.log(' Event payload:', JSON.stringify(data, null, 2)); // Pretty print

  await this.producer.send({
    topic,
    messages: [{ value: JSON.stringify(data) }],
  });
}

}
