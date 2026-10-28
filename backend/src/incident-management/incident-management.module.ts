import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { IncidentManagementController } from './controllers/incident-management.controller';
import { IncidentManagementRepository } from './repositories/incident-management.repository';
import { IncidentManagementService } from './services/incident-management.service';

@Module({
  imports: [DatabaseModule, RedisModule, NotificationsModule],
  controllers: [IncidentManagementController],
  providers: [IncidentManagementRepository, IncidentManagementService],
  exports: [IncidentManagementService, IncidentManagementRepository],
})
export class IncidentManagementModule {}
