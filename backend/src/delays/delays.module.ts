import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DelaysRepository } from './repositories/delays.repository';
import { DelaysService } from './services/delays.service';
import { DelaysController } from './controllers/delays.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [DelaysController],
  providers: [DelaysRepository, DelaysService],
  exports: [DelaysService, DelaysRepository],
})
export class DelaysModule {}
