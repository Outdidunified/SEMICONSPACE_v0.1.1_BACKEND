// src/modules/address/address.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Address } from './address.model';
import { CreateAddressDto } from './dto/create.address.dto';
import { ProducerService } from '../../kafka/producer.service';

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(private readonly producer: ProducerService) {}

  async getUserAddresses(userId: string) {
    this.logger.log(`Fetching addresses for user: ${userId}`);
    return Address.findAll({ where: { userId } });
  }

 async createAddress(dto: CreateAddressDto) {
  const { userId, isDefault } = dto;

  try {
    if (isDefault) {
      await Address.update({ isDefault: false }, { where: { userId } });
    }

    const address = await Address.create({
      ...dto,
      modified_by: dto.modified_by || dto.userId,
    });

    this.logger.log(`Created new address for user: ${userId}`);
    await this.producer.produceEvent('user.address.added', address);

    return address;
  } catch (error) {
    this.logger.error(`Error creating address for user: ${userId}`, error.stack);
    throw new Error('Failed to create address');
  }
}


  // src/modules/address/address.service.ts

async updateAddress(dto: CreateAddressDto) {
  const { addressId, userId, isDefault } = dto;

  if (!addressId) throw new Error('Address ID is required for update');

  try {
    const existing = await Address.findOne({ where: { addressId, userId } });

    if (!existing) {
      this.logger.warn(`No address found for addressId: ${addressId}`);
      throw new Error('No address found to update');
    }

    if (isDefault) {
      await Address.update({ isDefault: false }, { where: { userId } });
    }

    await existing.update({
      ...dto,
      modified_by: dto.modified_by || userId,
    });

    this.logger.log(`Updated address for user: ${userId}, addressId: ${addressId}`);
    await this.producer.produceEvent('user.address.updated', existing);

    return existing;
  } catch (error) {
    this.logger.error(`Error updating address for user: ${userId}`, error.stack);
    throw new Error('Failed to update address');
  }
}


}
