import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StopArrivalsController } from './controllers/stop-arrivals.controller';
import { StopArrivalsRepository } from './repositories/stop-arrivals.repository';
import { StopArrivalsService } from './services/stop-arrivals.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StopArrivalsController],
  providers: [StopArrivalsService, StopArrivalsRepository],
  exports: [StopArrivalsService, StopArrivalsRepository],
})
export class StopArrivalsModule {}
