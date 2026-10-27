import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FleetController } from './controllers/fleet.controller';
import { FleetService } from './services/fleet.service';
import { FleetRepository } from './repositories/fleet.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [FleetController],
  providers: [FleetService, FleetRepository],
  exports: [FleetService, FleetRepository],
})
export class FleetModule {}
