import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { StopRemindersController } from './controllers/stop-reminders.controller';
import { StopRemindersRepository } from './repositories/stop-reminders.repository';
import { StopRemindersService } from './services/stop-reminders.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [StopRemindersController],
  providers: [StopRemindersService, StopRemindersRepository],
  exports: [StopRemindersService, StopRemindersRepository],
})
export class StopRemindersModule {}
