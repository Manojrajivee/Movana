import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GeofencingController } from './controllers/geofencing.controller';
import { GeofencingRepository } from './repositories/geofencing.repository';
import { GeofencingService } from './services/geofencing.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GeofencingController],
  providers: [GeofencingRepository, GeofencingService],
  exports: [GeofencingService, GeofencingRepository],
})
export class GeofencingModule {}
