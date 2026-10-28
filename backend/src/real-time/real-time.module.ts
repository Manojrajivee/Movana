import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { RealTimeController } from './controllers/real-time.controller';
import { RealTimeGateway } from './gateways/real-time.gateway';
import { RealTimeService } from './services/real-time.service';

@Module({
  imports: [RedisModule, AuthModule],
  controllers: [RealTimeController],
  providers: [RealTimeGateway, RealTimeService],
  exports: [RealTimeService, RealTimeGateway],
})
export class RealTimeModule {}
