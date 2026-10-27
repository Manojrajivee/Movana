import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RouteOptimizationController } from './controllers/route-optimization.controller';
import { RouteOptimizationRepository } from './repositories/route-optimization.repository';
import { RouteOptimizationService } from './services/route-optimization.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RouteOptimizationController],
  providers: [RouteOptimizationRepository, RouteOptimizationService],
  exports: [RouteOptimizationService, RouteOptimizationRepository],
})
export class RouteOptimizationModule {}
