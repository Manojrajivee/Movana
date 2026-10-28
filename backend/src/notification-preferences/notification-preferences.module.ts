import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository';
import { NotificationPreferencesService } from './services/notification-preferences.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesRepository, NotificationPreferencesService],
  exports: [NotificationPreferencesService, NotificationPreferencesRepository],
})
export class NotificationPreferencesModule {}
