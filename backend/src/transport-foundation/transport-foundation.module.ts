import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TransportFoundationController } from './controllers/transport-foundation.controller';
import { TransportFoundationRepository } from './repositories/transport-foundation.repository';
import { TransportFoundationService } from './services/transport-foundation.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TransportFoundationController],
  providers: [TransportFoundationRepository, TransportFoundationService],
  exports: [TransportFoundationRepository, TransportFoundationService],
})
export class TransportFoundationModule {}
