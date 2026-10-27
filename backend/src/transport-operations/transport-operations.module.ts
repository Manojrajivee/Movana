import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DriversModule } from '../drivers/drivers.module';
import { FleetModule } from '../fleet/fleet.module';
import { TransportOperationsController } from './controllers/transport-operations.controller';
import { TransportOperationsRepository } from './repositories/transport-operations.repository';
import { TransportOperationsService } from './services/transport-operations.service';

@Module({
  imports: [DatabaseModule, AuthModule, FleetModule, DriversModule],
  controllers: [TransportOperationsController],
  providers: [TransportOperationsRepository, TransportOperationsService],
  exports: [TransportOperationsRepository, TransportOperationsService],
})
export class TransportOperationsModule {}
