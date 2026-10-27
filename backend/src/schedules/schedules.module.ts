import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchedulesController } from './controllers/schedules.controller';
import { SchedulesRepository } from './repositories/schedules.repository';
import { SchedulesService } from './services/schedules.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SchedulesController],
  providers: [SchedulesRepository, SchedulesService],
  exports: [SchedulesService, SchedulesRepository],
})
export class SchedulesModule {}
