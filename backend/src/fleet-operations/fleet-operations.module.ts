import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FleetModule } from '../fleet/fleet.module';
import { DriversModule } from '../drivers/drivers.module';
import { FleetOperationsController } from './controllers/fleet-operations.controller';
import { FleetOperationsService } from './services/fleet-operations.service';
import { FleetOperationsRepository } from './repositories/fleet-operations.repository';

@Module({
  imports: [DatabaseModule, FleetModule, DriversModule],
  controllers: [FleetOperationsController],
  providers: [FleetOperationsService, FleetOperationsRepository],
  exports: [FleetOperationsService, FleetOperationsRepository],
})
export class FleetOperationsModule {}
