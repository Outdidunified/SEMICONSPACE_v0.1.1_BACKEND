// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisProvider } from './redis.provider';

@Module({
  providers: [RedisService, RedisProvider],
  exports: [RedisService, RedisProvider],
})
export class RedisModule {}
