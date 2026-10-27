import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RouteVariantsController } from './controllers/route-variants.controller';
import { RouteVariantsRepository } from './repositories/route-variants.repository';
import { RouteVariantsService } from './services/route-variants.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RouteVariantsController],
  providers: [RouteVariantsRepository, RouteVariantsService],
  exports: [RouteVariantsService, RouteVariantsRepository],
})
export class RouteVariantsModule {}
