import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { GpsIngestionController } from './controllers/gps-ingestion.controller';
import { GpsIngestionRepository } from './repositories/gps-ingestion.repository';
import { GpsIngestionService } from './services/gps-ingestion.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [GpsIngestionController],
  providers: [GpsIngestionRepository, GpsIngestionService],
  exports: [GpsIngestionService, GpsIngestionRepository],
})
export class GpsIngestionModule {}
