// src/redis/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly logger = new Logger(RedisService.name);
  private reconnectTimer: NodeJS.Timeout;
  private isShuttingDown = false;

  async onModuleInit() {
    await this.createAndConnectClient();
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.closeConnection();
  }

  private async createAndConnectClient() {
    try {
      const options = {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          reconnectStrategy: (retries: number) => {
            // Exponential backoff with max delay of 10 seconds
            const delay = Math.min(Math.pow(2, retries) * 100, 10000);
            this.logger.log(`Redis reconnect attempt ${retries} in ${delay}ms`);
            return delay;
          },
          connectTimeout: 10000, // 10 seconds
        },
      };

      this.client = createClient(options) as RedisClientType;

      // Set up event handlers
      this.client.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`, err.stack);
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connecting...');
      });

      this.client.on('ready', () => {
        this.logger.log('Redis ready and connected');
      });

      this.client.on('reconnecting', () => {
        this.logger.log('Redis reconnecting...');
      });

      this.client.on('end', () => {
        this.logger.log('Redis connection closed');
        // Try to reconnect if not shutting down
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`, error.stack);
      // Schedule reconnect attempt
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(async () => {
      this.logger.log('Attempting to reconnect to Redis...');
      await this.createAndConnectClient();
    }, 5000); // Try to reconnect after 5 seconds
  }

  private async closeConnection() {
    if (this.client && this.client.isOpen) {
      try {
        await this.client.quit();
        this.logger.log('Redis connection closed gracefully');
      } catch (error) {
        this.logger.error(`Error closing Redis connection: ${error.message}`, error.stack);
        // Force disconnect if quit fails
        this.client.disconnect();
      }
    }
  }

  getClient(): RedisClientType {
    if (!this.client || !this.client.isOpen) {
      this.logger.warn('Redis client requested but not connected. Attempting to reconnect...');
      this.createAndConnectClient();
      throw new Error('Redis client not connected. Please retry your operation.');
    }
    return this.client;
  }

  // Health check method for monitoring
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client || !this.client.isOpen) {
        return false;
      }
      // Ping Redis to check connection
      await this.client.ping();
      return true;
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      return false;
    }
  }
}
