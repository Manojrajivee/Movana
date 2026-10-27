import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ServiceDisruptionsController } from './controllers/service-disruptions.controller';
import { ServiceDisruptionsRepository } from './repositories/service-disruptions.repository';
import { ServiceDisruptionsService } from './services/service-disruptions.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [ServiceDisruptionsController],
  providers: [ServiceDisruptionsService, ServiceDisruptionsRepository],
  exports: [ServiceDisruptionsService, ServiceDisruptionsRepository],
})
export class ServiceDisruptionsModule {}
