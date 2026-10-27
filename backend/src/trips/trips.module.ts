import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TripsController } from './controllers/trips.controller';
import { TripsRepository } from './repositories/trips.repository';
import { TripsService } from './services/trips.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TripsController],
  providers: [TripsService, TripsRepository],
  exports: [TripsService, TripsRepository],
})
export class TripsModule {}
