import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BusDevicesController } from './controllers/bus-devices.controller';
import { BusDevicesRepository } from './repositories/bus-devices.repository';
import { BusDevicesService } from './services/bus-devices.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BusDevicesController],
  providers: [BusDevicesRepository, BusDevicesService],
  exports: [BusDevicesService, BusDevicesRepository],
})
export class BusDevicesModule {}
