import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CreateTemplateSchema,
  QueryTemplatesSchema,
  RenderTemplateSchema,
  UpdateTemplateSchema,
} from '../dto/communication-templates.dto';
import { CommunicationTemplatesService } from '../services/communication-templates.service';

@Controller('api/v1/communication-templates')
export class CommunicationTemplatesController {
  constructor(private readonly service: CommunicationTemplatesService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(@Body() body: unknown) {
    const parsed = CreateTemplateSchema.parse(body);
    return this.service.createTemplate(parsed);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async getTemplates(@Query() query: Record<string, string>) {
    const parsed = QueryTemplatesSchema.parse(query);
    return this.service.getTemplates(parsed);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR')
  async getTemplateById(@Param('id') id: string) {
    return this.service.getTemplateById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  async updateTemplate(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateTemplateSchema.parse(body);
    return this.service.updateTemplate(id, parsed);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  async deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  @Post('render')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async renderTemplate(@Body() body: unknown) {
    const parsed = RenderTemplateSchema.parse(body);
    return this.service.renderTemplate(parsed);
  }

  @Post(':id/preview')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  async previewTemplate(
    @Param('id') id: string,
    @Body('variables') variables: Record<string, any>,
  ) {
    return this.service.previewTemplate(id, variables || {});
  }
}
