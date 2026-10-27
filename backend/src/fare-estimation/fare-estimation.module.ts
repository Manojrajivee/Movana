import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FareEstimationController } from './controllers/fare-estimation.controller';
import { FareEstimationRepository } from './repositories/fare-estimation.repository';
import { FareEstimationService } from './services/fare-estimation.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FareEstimationController],
  providers: [FareEstimationRepository, FareEstimationService],
  exports: [FareEstimationService, FareEstimationRepository],
})
export class FareEstimationModule {}
