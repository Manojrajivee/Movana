import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StopsController } from './controllers/stops.controller';
import { StopsRepository } from './repositories/stops.repository';
import { StopsService } from './services/stops.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StopsController],
  providers: [StopsRepository, StopsService],
  exports: [StopsService, StopsRepository],
})
export class StopsModule {}
