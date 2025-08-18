import {
  Body,
  Controller,
  Logger,
  Post,
  UsePipes,HttpCode,HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create.address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { GetAddressDto } from './dto/get-address.dto';
import { DeleteAddressDto } from './dto/delete-address.dto';


@Controller('user/address')
export class AddressController {
  private readonly logger = new Logger(AddressController.name);

  constructor(private readonly service: AddressService) {}


  @HttpCode(HttpStatus.OK)
  @Post('get')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getAll(@Body() dto: GetAddressDto) {
    const addresses = await this.service.getUserAddresses(dto.userId);
    return {
      success: true,
      message: 'Addresses fetched successfully',
      data: addresses,
    };
  }

  @Post('create')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(@Body() dto: CreateAddressDto) {
    const address = await this.service.createAddress(dto);
    return {
      success: true,
      message: 'Address created successfully',
      data: address,
    };
  }

  @Post('update')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(@Body() dto: UpdateAddressDto) {
    const updated = await this.service.updateAddress(dto);
    return {
      success: true,
      message: 'Address updated successfully',
      data: updated,
    };
  }

  // endpoint for delete
@Post('delete')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
async delete(@Body() dto: DeleteAddressDto) {
  const result = await this.service.deleteAddress(dto.userId, dto.addressIds);
  return {
    success: true,
    message: 'Address(es) deleted successfully',
    data: result,
  };
}
}
