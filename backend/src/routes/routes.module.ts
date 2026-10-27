import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RoutesController } from './controllers/routes.controller';
import { RoutesRepository } from './repositories/routes.repository';
import { RoutesService } from './services/routes.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RoutesController],
  providers: [RoutesRepository, RoutesService],
  exports: [RoutesService, RoutesRepository],
})
export class RoutesModule {}
