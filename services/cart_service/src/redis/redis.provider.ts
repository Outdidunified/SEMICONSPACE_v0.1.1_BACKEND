import { Provider } from '@nestjs/common';
import { createClient } from 'redis';
import { Inject } from '@nestjs/common';


export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: async () => {
    const client = createClient({
      socket: {
        host: process.env.REDIS_HOST || '',
        port: parseInt(process.env.REDIS_PORT || ''),
      },
    });

    client.on('error', (err) => {
      console.error('❌ Redis error:', err);
    });

    await client.connect();
    console.log('⚡ Redis connected');
    return client;
  },
};

export const InjectRedis = () => Inject('REDIS_CLIENT');
