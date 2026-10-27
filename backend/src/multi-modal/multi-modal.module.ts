import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MultiModalController } from './controllers/multi-modal.controller';
import { MultiModalRepository } from './repositories/multi-modal.repository';
import { MultiModalService } from './services/multi-modal.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MultiModalController],
  providers: [MultiModalRepository, MultiModalService],
  exports: [MultiModalService, MultiModalRepository],
})
export class MultiModalModule {}
