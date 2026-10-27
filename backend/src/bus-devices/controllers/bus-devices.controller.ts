import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateBusDeviceSchema } from '../dto/create-bus-device.dto';
import { PairBusDeviceSchema } from '../dto/pair-bus-device.dto';
import { QueryBusDevicesSchema } from '../dto/query-bus-devices.dto';
import { UpdateBusDeviceSchema } from '../dto/update-bus-device.dto';
import { BusDevicesService } from '../services/bus-devices.service';

@ApiTags('Bus Devices')
@ApiBearerAuth()
@Controller('api/v1/bus-devices')
export class BusDevicesController {
  constructor(private readonly service: BusDevicesService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new hardware GPS telematics tracking device' })
  @ApiResponse({ status: 201, description: 'Tracking device registered successfully' })
  async createDevice(@Body() body: unknown) {
    const validated = CreateBusDeviceSchema.parse(body);
    return this.service.createDevice(validated);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and query tracking devices' })
  @ApiResponse({ status: 200, description: 'Tracking devices retrieved successfully' })
  async getDevices(@Query() query: unknown) {
    const validated = QueryBusDevicesSchema.parse(query);
    return this.service.getDevices(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get tracking device details by ID' })
  @ApiResponse({ status: 200, description: 'Tracking device found' })
  async getDeviceById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDeviceById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tracking device configuration or firmware version' })
  @ApiResponse({ status: 200, description: 'Tracking device updated successfully' })
  async updateDevice(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateBusDeviceSchema.parse(body);
    return this.service.updateDevice(id, validated);
  }

  @Post(':id/pair')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pair tracking device to an active vehicle' })
  @ApiResponse({ status: 200, description: 'Tracking device paired to vehicle' })
  async pairDevice(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = PairBusDeviceSchema.parse(body);
    return this.service.pairDevice(id, validated);
  }

  @Post(':id/unpair')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpair tracking device from its current vehicle' })
  @ApiResponse({ status: 200, description: 'Tracking device unpaired successfully' })
  async unpairDevice(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.unpairDevice(id);
  }

  @Get(':id/status')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get tracking device connectivity and telemetry heartbeat status' })
  @ApiResponse({ status: 200, description: 'Tracking device status retrieved' })
  async getDeviceStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDeviceStatus(id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decommission tracking device' })
  @ApiResponse({ status: 200, description: 'Tracking device decommissioned' })
  async decommissionDevice(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.decommissionDevice(id);
  }
}
