// src/app.module.ts
import { Module } from '@nestjs/common';
import { SearchService } from './modules/search/search.service';
import { KafkaConsumerService } from './kafka/consumer.service';
import { SearchController } from './modules/search/search.controller';

@Module({
  imports: [],
  controllers: [SearchController],
  providers: [SearchService, KafkaConsumerService],
})
export class AppModule {}
