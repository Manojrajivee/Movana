import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TripProgressController } from './controllers/trip-progress.controller';
import { TripProgressRepository } from './repositories/trip-progress.repository';
import { TripProgressService } from './services/trip-progress.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TripProgressController],
  providers: [TripProgressService, TripProgressRepository],
  exports: [TripProgressService, TripProgressRepository],
})
export class TripProgressModule {}
