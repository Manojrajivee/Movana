import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { TrackingController } from './controllers/tracking.controller';
import { TrackingRepository } from './repositories/tracking.repository';
import { TrackingService } from './services/tracking.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [TrackingController],
  providers: [TrackingRepository, TrackingService],
  exports: [TrackingService, TrackingRepository],
})
export class TrackingModule {}
