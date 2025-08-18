// src/modules/address/address.controller.ts

import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe,
  Param,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create.address.dto';

@Controller('user/address')
export class AddressController {
  private readonly logger = new Logger(AddressController.name);

  constructor(private readonly service: AddressService) {}

  @Post('get')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAll(@Body('userId') userId: string) {
    if (!userId) {
      throw new HttpException({ error: true, message: 'User ID is required' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const addresses = await this.service.getUserAddresses(userId);
      if (!addresses || addresses.length === 0) {
        throw new HttpException({ error: true, message: 'No addresses found' }, HttpStatus.NOT_FOUND);
      }

      return { error: false, addresses };
    } catch (error) {
      this.logger.error(`Failed to get addresses: ${error.message}`);
      throw new HttpException(
        { error: true, message: 'Failed to fetch addresses' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('create')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(@Body() dto: CreateAddressDto) {
    if (!dto.userId) {
      throw new HttpException({ error: true, message: 'User ID is required' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const address = await this.service.createAddress(dto);
      return {
        error: false,
        message: 'Address saved successfully',
        address,
      };
    } catch (error) {
      this.logger.error('Failed to create address:', error.message);
      throw new HttpException(
        { error: true, message: error.message || 'Failed to add address' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('update')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(@Body() dto: CreateAddressDto) {
    if (!dto.userId) {
      throw new HttpException({ error: true, message: 'User ID is required' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const address = await this.service.updateAddress(dto);
      return {
        error: false,
        message: 'Address updated successfully',
        address,
      };
    } catch (error) {
      this.logger.error('Failed to update address:', error.message);
      throw new HttpException(
        { error: true, message: error.message || 'Failed to update address' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
