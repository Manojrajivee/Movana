import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { SavedJourneysController } from './controllers/saved-journeys.controller';
import { SavedJourneysRepository } from './repositories/saved-journeys.repository';
import { SavedJourneysService } from './services/saved-journeys.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [SavedJourneysController],
  providers: [SavedJourneysRepository, SavedJourneysService],
  exports: [SavedJourneysService, SavedJourneysRepository],
})
export class SavedJourneysModule {}
