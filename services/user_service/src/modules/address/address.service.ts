import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Address } from './address.model';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreateAddressDto } from './dto/create.address.dto';
import { ProducerService } from '../../kafka/producer.service';

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(private readonly producer: ProducerService) {}

  async getUserAddresses(userId: string) {
    this.logger.log(`Fetching addresses for userId: ${userId}`);
    const addresses = await Address.findAll({ where: { userId } });

    if (!addresses || addresses.length === 0) {
      this.logger.warn(`No addresses found for userId: ${userId}`);
      throw new NotFoundException('No addresses found');
    }

    return addresses;
  }

  async createAddress(dto: CreateAddressDto) {
    try {
      await Address.update({ isDefault: false }, { where: { userId: dto.userId } });

      const address = await Address.create({
        ...dto,
        isDefault: true,
      });

      this.logger.log(`Created new default address for userId: ${dto.userId}`);

      const addressData = address.toJSON();

      await this.producer.produceEvent('user.address.added', {
        addressId: addressData.addressId,
        userId: addressData.userId,
        address: addressData.address,
        state: addressData.state,
        pin: addressData.pin,
        country: addressData.country,
        city: addressData.city,
        isDefault: addressData.isDefault,
        created_at: addressData.created_at,
      });

      return addressData;
    } catch (error) {
      this.logger.error(`Error creating address for userId: ${dto.userId}`, error.stack);
      throw error;
    }
  }

  async updateAddress(dto: UpdateAddressDto) {
    try {
      const existing = await Address.findOne({
        where: { addressId: dto.addressId, userId: dto.userId },
      });

      if (!existing) {
        this.logger.warn(`No address found for userId: ${dto.userId}, addressId: ${dto.addressId}`);
        throw new NotFoundException(`Address with ID ${dto.addressId} not found`);
      }

      if (dto.isDefault) {
        await Address.update({ isDefault: false }, { where: { userId: dto.userId } });
      }

      await existing.update({
        ...dto,
        modified_by: dto.modified_by || dto.userId,
      });

      const updatedData = existing.toJSON();

      await this.producer.produceEvent('user.address.updated', {
        addressId: updatedData.addressId,
        userId: updatedData.userId,
        address: updatedData.address,
        state: updatedData.state,
        pin: updatedData.pin,
        country: updatedData.country,
        city: updatedData.city,
        isDefault: updatedData.isDefault,
        modified_date: updatedData.modified_date,
        modified_by: updatedData.modified_by,
      });

      return updatedData;
    } catch (error) {
      this.logger.error(`Error updating address for userId: ${dto.userId}`, error.stack);
      throw error;
    }
  }

  //  New deleteAddress function
  async deleteAddress(userId: string, addressIds: string[]) {
    const deleted = await Address.destroy({
      where: {
        userId,
        addressId: addressIds,
      },
    });

    if (deleted === 0) {
      this.logger.warn(`No address deleted for userId: ${userId}`);
      throw new NotFoundException('No addresses found to delete');
    }

    this.logger.log(`Deleted ${deleted} address(es) for userId: ${userId}`);

    // Send Kafka event for each deleted address
    for (const id of addressIds) {
      await this.producer.produceEvent('user.address.deleted', {
        userId,
        addressId: id,
      });
    }

    return { deletedCount: deleted };
  }
}
