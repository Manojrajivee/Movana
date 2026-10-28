import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { LocationSharingController } from './controllers/location-sharing.controller';
import { LocationSharingRepository } from './repositories/location-sharing.repository';
import { LocationSharingService } from './services/location-sharing.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [LocationSharingController],
  providers: [LocationSharingRepository, LocationSharingService],
  exports: [LocationSharingService, LocationSharingRepository],
})
export class LocationSharingModule {}
