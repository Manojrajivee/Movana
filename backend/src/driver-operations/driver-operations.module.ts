import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DriversModule } from '../drivers/drivers.module';
import { FleetModule } from '../fleet/fleet.module';
import { DriverOperationsController } from './controllers/driver-operations.controller';
import { DriverOperationsService } from './services/driver-operations.service';
import { DriverOperationsRepository } from './repositories/driver-operations.repository';

@Module({
  imports: [DatabaseModule, DriversModule, FleetModule],
  controllers: [DriverOperationsController],
  providers: [DriverOperationsService, DriverOperationsRepository],
  exports: [DriverOperationsService, DriverOperationsRepository],
})
export class DriverOperationsModule {}
