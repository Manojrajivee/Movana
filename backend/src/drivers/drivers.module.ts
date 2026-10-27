import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DriversController } from './controllers/drivers.controller';
import { DriverDocumentsController } from './controllers/driver-documents.controller';
import { DriverAssignmentsController } from './controllers/driver-assignments.controller';
import { DriverAvailabilityController } from './controllers/driver-availability.controller';
import { DriversService } from './services/drivers.service';
import { DriverDocumentsService } from './services/driver-documents.service';
import { DriverAssignmentsService } from './services/driver-assignments.service';
import { DriversRepository } from './repositories/drivers.repository';
import { DriverDocumentsRepository } from './repositories/driver-documents.repository';
import { DriverAssignmentsRepository } from './repositories/driver-assignments.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [
    DriverAssignmentsController,
    DriverAvailabilityController,
    DriverDocumentsController,
    DriversController,
  ],
  providers: [
    DriversService,
    DriverDocumentsService,
    DriverAssignmentsService,
    DriversRepository,
    DriverDocumentsRepository,
    DriverAssignmentsRepository,
  ],
  exports: [
    DriversService,
    DriverDocumentsService,
    DriverAssignmentsService,
    DriversRepository,
    DriverDocumentsRepository,
    DriverAssignmentsRepository,
  ],
})
export class DriversModule {}
