import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { JourneyPlannerController } from './controllers/journey-planner.controller';
import { JourneyPlannerRepository } from './repositories/journey-planner.repository';
import { JourneyPlannerService } from './services/journey-planner.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JourneyPlannerController],
  providers: [JourneyPlannerRepository, JourneyPlannerService],
  exports: [JourneyPlannerService, JourneyPlannerRepository],
})
export class JourneyPlannerModule {}
