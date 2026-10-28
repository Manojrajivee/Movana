import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { AlertRulesController } from './controllers/alert-rules.controller';
import { AlertRulesRepository } from './repositories/alert-rules.repository';
import { AlertRulesService } from './services/alert-rules.service';

@Module({
  imports: [DatabaseModule, RedisModule, NotificationsModule],
  controllers: [AlertRulesController],
  providers: [AlertRulesRepository, AlertRulesService],
  exports: [AlertRulesService, AlertRulesRepository],
})
export class AlertRulesModule {}
