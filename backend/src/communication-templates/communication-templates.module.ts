import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommunicationTemplatesController } from './controllers/communication-templates.controller';
import { CommunicationTemplatesRepository } from './repositories/communication-templates.repository';
import { CommunicationTemplatesService } from './services/communication-templates.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CommunicationTemplatesController],
  providers: [CommunicationTemplatesRepository, CommunicationTemplatesService],
  exports: [CommunicationTemplatesService, CommunicationTemplatesRepository],
})
export class CommunicationTemplatesModule {}
