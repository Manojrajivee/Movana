import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import {
  EmailChannelAdapter,
  InAppChannelAdapter,
  PushChannelAdapter,
  SmsChannelAdapter,
} from './adapters/notification-channel.adapter';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [DatabaseModule, RedisModule, ConfigModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    InAppChannelAdapter,
    EmailChannelAdapter,
    SmsChannelAdapter,
    PushChannelAdapter,
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
