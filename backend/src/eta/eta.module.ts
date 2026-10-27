import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EtaRepository } from './repositories/eta.repository';
import { EtaService } from './services/eta.service';
import { EtaController } from './controllers/eta.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [EtaController],
  providers: [EtaRepository, EtaService],
  exports: [EtaService, EtaRepository],
})
export class EtaModule {}
