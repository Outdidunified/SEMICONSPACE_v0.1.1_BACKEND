import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    try {
      // Try to initialize connection
      await this.dataSource.initialize();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to the database', error);
    }
  }
}
