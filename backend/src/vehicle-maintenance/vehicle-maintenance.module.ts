import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FleetModule } from '../fleet/fleet.module';
import { VehicleMaintenanceController } from './controllers/vehicle-maintenance.controller';
import { VehicleMaintenanceService } from './services/vehicle-maintenance.service';
import { VehicleMaintenanceRepository } from './repositories/vehicle-maintenance.repository';

@Module({
  imports: [DatabaseModule, FleetModule],
  controllers: [VehicleMaintenanceController],
  providers: [VehicleMaintenanceService, VehicleMaintenanceRepository],
  exports: [VehicleMaintenanceService, VehicleMaintenanceRepository],
})
export class VehicleMaintenanceModule {}
