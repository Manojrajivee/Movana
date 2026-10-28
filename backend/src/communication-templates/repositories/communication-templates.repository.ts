import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { NotificationChannel } from '../../notifications/dto/create-notification.dto';
import {
  CreateTemplateDto,
  QueryTemplatesDto,
  UpdateTemplateDto,
} from '../dto/communication-templates.dto';

export interface NotificationTemplateEntity {
  id: string;
  template_code: string;
  channel: NotificationChannel;
  subject: string | null;
  body_template: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CommunicationTemplatesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createTemplate(dto: CreateTemplateDto): Promise<NotificationTemplateEntity> {
    const query = `
      INSERT INTO notification_templates (
        template_code,
        channel,
        subject,
        body_template,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const params = [dto.templateCode, dto.channel, dto.subject || null, dto.bodyTemplate];
    const res = await this.db.query<NotificationTemplateEntity>(query, params);
    return res.rows[0];
  }

  async findTemplateById(id: string): Promise<NotificationTemplateEntity | null> {
    const query = `
      SELECT *
      FROM notification_templates
      WHERE id = $1;
    `;
    const res = await this.db.query<NotificationTemplateEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async findTemplateByCodeAndChannel(
    templateCode: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplateEntity | null> {
    const query = `
      SELECT *
      FROM notification_templates
      WHERE template_code = $1
        AND channel = $2;
    `;
    const res = await this.db.query<NotificationTemplateEntity>(query, [templateCode, channel]);
    return res.rows[0] || null;
  }

  async findTemplates(queryDto: QueryTemplatesDto): Promise<NotificationTemplateEntity[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (queryDto.channel) {
      conditions.push(`channel = $${pIdx++}`);
      params.push(queryDto.channel);
    }

    if (queryDto.templateCode) {
      conditions.push(`template_code ILIKE $${pIdx++}`);
      params.push(`%${queryDto.templateCode}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM notification_templates
      ${whereClause}
      ORDER BY template_code ASC, channel ASC;
    `;

    const res = await this.db.query<NotificationTemplateEntity>(query, params);
    return res.rows;
  }

  async updateTemplate(
    id: string,
    dto: UpdateTemplateDto,
  ): Promise<NotificationTemplateEntity | null> {
    const query = `
      UPDATE notification_templates
      SET subject = COALESCE($2, subject),
          body_template = COALESCE($3, body_template),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const params = [id, dto.subject || null, dto.bodyTemplate || null];
    const res = await this.db.query<NotificationTemplateEntity>(query, params);
    return res.rows[0] || null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const query = `
      DELETE FROM notification_templates
      WHERE id = $1;
    `;
    const res = await this.db.query(query, [id]);
    return (res.rowCount || 0) > 0;
  }
}
