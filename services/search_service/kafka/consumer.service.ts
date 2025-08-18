import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { SearchService } from '../modules/search/search.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaConsumerService.name);

  constructor(private readonly searchService: SearchService) {}

  async onModuleInit() {
    this.logger.log('⏳ Kafka Consumer initializing...');

    const kafkaBroker = process.env.KAFKA_BROKER;
    const kafkaGroupId = process.env.KAFKA_GROUP_ID;

    this.logger.log(`Kafka broker: ${kafkaBroker}`);
    this.logger.log(`Kafka group ID: ${kafkaGroupId}`);

    const kafka = new Kafka({
      clientId: 'search-service-consumer-v2',  // Changed clientId to a new unique value
      brokers: [kafkaBroker],
    });

    const consumer = kafka.consumer({ groupId: kafkaGroupId });

    try {
      await consumer.connect();
      this.logger.log('✅ Kafka Consumer connected');
    } catch (err) {
      this.logger.error(`❌ Kafka connect failed: ${err.message}`, err.stack);
      throw err;
    }

    try {
      await consumer.subscribe({ topic: 'product.added', fromBeginning: true });
      this.logger.log('📩 Subscribed to topic: product.added');
    } catch (err) {
      this.logger.error(`❌ Kafka subscribe failed: ${err.message}`, err.stack);
      throw err;
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        let payload;
        try {
          payload = JSON.parse(message.value.toString());
        } catch (e) {
          this.logger.error(`❌ Failed to parse message: ${e.message}`);
          return; // skip invalid message
        }

        this.logger.log(`📨 Received message on "${topic}": ${JSON.stringify(payload, null, 2)}`);

        // Check required fields including semicon_part_number
        if (
          !payload.productname ||
          !payload.category ||
          !payload.manufacturer ||
          !payload.subcategory ||
          !payload.semicon_part_number||
          !payload.manufacturer_part_number
        ) {
          this.logger.warn('⚠️ Missing required product fields including semicon_part_number. Skipping.');
          return;
        }

        try {
          await this.searchService.createOrUpdateProduct(payload);
          this.logger.log('✅ Product stored in Typesense and sent to recommendations API');
        } catch (error) {
          this.logger.error('❌ Failed to process product.added event:', error);
        }
      },
    });
  }
}
