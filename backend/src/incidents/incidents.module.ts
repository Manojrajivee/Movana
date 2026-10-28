import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IncidentsController } from './controllers/incidents.controller';
import { IncidentsRepository } from './repositories/incidents.repository';
import { IncidentsService } from './services/incidents.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IncidentsController],
  providers: [IncidentsRepository, IncidentsService],
  exports: [IncidentsService, IncidentsRepository],
})
export class IncidentsModule {}
