import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { RealTimeModule } from '../real-time/real-time.module';
import { RedisModule } from '../redis/redis.module';
import { SafetyZonesController } from './controllers/safety-zones.controller';
import { SafetyZonesRepository } from './repositories/safety-zones.repository';
import { SafetyZonesService } from './services/safety-zones.service';

@Module({
  imports: [DatabaseModule, RedisModule, IncidentsModule, RealTimeModule],
  controllers: [SafetyZonesController],
  providers: [SafetyZonesRepository, SafetyZonesService],
  exports: [SafetyZonesService, SafetyZonesRepository],
})
export class SafetyZonesModule {}
