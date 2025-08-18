import { Module } from '@nestjs/common';
import { AddressController } from './address.controller';  // Import AddressController
import { ProducerService } from '../../kafka/producer.service';  // Import ProducerService
import { AddressService } from './address.service';  // Correct the import path for AddressService

@Module({
  controllers: [AddressController],  // Register the AddressController
  providers: [AddressService, ProducerService],  // Register the AddressService and ProducerService
  exports: [AddressService],  // Export AddressService for use in other modules (optional, if needed)
})
export class AddressModule {}
