import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealTimeModule } from '../real-time/real-time.module';
import { RedisModule } from '../redis/redis.module';
import { SosController } from './controllers/sos.controller';
import { SosRepository } from './repositories/sos.repository';
import { SosService } from './services/sos.service';

@Module({
  imports: [DatabaseModule, RedisModule, NotificationsModule, RealTimeModule],
  controllers: [SosController],
  providers: [SosRepository, SosService],
  exports: [SosService, SosRepository],
})
export class SosModule {}
