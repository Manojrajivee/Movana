import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CreateTemplateDto,
  QueryTemplatesDto,
  RenderTemplateDto,
  UpdateTemplateDto,
} from '../dto/communication-templates.dto';
import {
  CommunicationTemplatesRepository,
  NotificationTemplateEntity,
} from '../repositories/communication-templates.repository';

export interface RenderResult {
  templateCode: string;
  channel: string;
  localeUsed: string;
  subject: string | null;
  body: string;
  missingVariables: string[];
}

@Injectable()
export class CommunicationTemplatesService {
  private readonly logger = new Logger(CommunicationTemplatesService.name);

  constructor(private readonly repository: CommunicationTemplatesRepository) {}

  private sanitizeString(input: unknown): string {
    if (input === null || input === undefined) {
      return '';
    }
    const str = String(input);
    // Sanitize HTML entities to prevent script injection / XSS
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async createTemplate(dto: CreateTemplateDto): Promise<NotificationTemplateEntity> {
    const channel = dto.channel ?? 'EMAIL';
    const existing = await this.repository.findTemplateByCodeAndChannel(dto.templateCode, channel);
    if (existing) {
      throw new ConflictException(
        `Template with code '${dto.templateCode}' and channel '${channel}' already exists`,
      );
    }
    return this.repository.createTemplate({ ...dto, channel });
  }

  async getTemplates(query: QueryTemplatesDto): Promise<NotificationTemplateEntity[]> {
    return this.repository.findTemplates(query);
  }

  async getTemplateById(id: string): Promise<NotificationTemplateEntity> {
    const template = await this.repository.findTemplateById(id);
    if (!template) {
      throw new NotFoundException(`Notification template '${id}' not found`);
    }
    return template;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto): Promise<NotificationTemplateEntity> {
    await this.getTemplateById(id);
    const updated = await this.repository.updateTemplate(id, dto);
    return updated!;
  }

  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    await this.getTemplateById(id);
    await this.repository.deleteTemplate(id);
    return { success: true };
  }

  async renderTemplate(dto: RenderTemplateDto): Promise<RenderResult> {
    const locale = dto.locale || 'en';
    let template: NotificationTemplateEntity | null = null;
    let localeUsed = locale;

    // 1. Try localized code e.g. TRIP_DELAY:ta
    template = await this.repository.findTemplateByCodeAndChannel(
      `${dto.templateCode}:${locale}`,
      dto.channel,
    );

    // 2. Fallback to English variant e.g. TRIP_DELAY:en
    if (!template && locale !== 'en') {
      template = await this.repository.findTemplateByCodeAndChannel(
        `${dto.templateCode}:en`,
        dto.channel,
      );
      if (template) {
        localeUsed = 'en';
      }
    }

    // 3. Fallback to direct code e.g. TRIP_DELAY
    if (!template) {
      template = await this.repository.findTemplateByCodeAndChannel(dto.templateCode, dto.channel);
      if (template) {
        localeUsed = 'default';
      }
    }

    if (!template) {
      throw new NotFoundException(
        `Template '${dto.templateCode}' not found for channel '${dto.channel}' (attempted locale: ${locale})`,
      );
    }

    // 4. Substitute variables with HTML sanitization
    const variables = dto.variables || {};
    const missingVariables: string[] = [];

    const replacePlaceholders = (text: string | null): string => {
      if (!text) return '';
      return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, varName) => {
        if (varName in variables) {
          return this.sanitizeString(variables[varName]);
        }
        if (!missingVariables.includes(varName)) {
          missingVariables.push(varName);
        }
        return `{{${varName}}}`;
      });
    };

    const renderedSubject = template.subject ? replacePlaceholders(template.subject) : null;
    const renderedBody = replacePlaceholders(template.body_template);

    return {
      templateCode: template.template_code,
      channel: template.channel,
      localeUsed,
      subject: renderedSubject,
      body: renderedBody,
      missingVariables,
    };
  }

  async previewTemplate(id: string, variables: Record<string, any>): Promise<RenderResult> {
    const template = await this.getTemplateById(id);
    return this.renderTemplate({
      templateCode: template.template_code,
      channel: template.channel,
      variables,
      locale: 'en',
    });
  }
}
