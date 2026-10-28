import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationTemplatesRepository } from '../repositories/communication-templates.repository';
import { CommunicationTemplatesService } from './communication-templates.service';

describe('CommunicationTemplatesService', () => {
  let service: CommunicationTemplatesService;
  let repository: jest.Mocked<CommunicationTemplatesRepository>;

  const mockTemplate = {
    id: 'tmpl-1111-1111-1111-111111111111',
    template_code: 'TRIP_DELAY_ALERT:en',
    channel: 'EMAIL' as const,
    subject: 'Delay Alert: Bus {{busNumber}}',
    body_template:
      'Dear {{passengerName}}, your trip #{{tripNumber}} is delayed by {{delayMinutes}} minutes.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockTamilTemplate = {
    id: 'tmpl-2222-2222-2222-222222222222',
    template_code: 'TRIP_DELAY_ALERT:ta',
    channel: 'EMAIL' as const,
    subject: 'தாமத எச்சரிக்கை: பேருந்து {{busNumber}}',
    body_template:
      'அன்புள்ள {{passengerName}}, பேருந்து #{{tripNumber}} {{delayMinutes}} நிமிடங்கள் தாமதமாக உள்ளது.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      createTemplate: jest.fn(),
      findTemplateById: jest.fn(),
      findTemplateByCodeAndChannel: jest.fn(),
      findTemplates: jest.fn(),
      updateTemplate: jest.fn(),
      deleteTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationTemplatesService,
        { provide: CommunicationTemplatesRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<CommunicationTemplatesService>(CommunicationTemplatesService);
    repository = module.get(CommunicationTemplatesRepository);
  });

  describe('createTemplate', () => {
    it('should successfully create a new communication template', async () => {
      repository.findTemplateByCodeAndChannel.mockResolvedValue(null);
      repository.createTemplate.mockResolvedValue(mockTemplate);

      const result = await service.createTemplate({
        templateCode: 'TRIP_DELAY_ALERT:en',
        channel: 'EMAIL',
        subject: 'Delay Alert: Bus {{busNumber}}',
        bodyTemplate: 'Dear {{passengerName}}...',
      });

      expect(result.id).toBe(mockTemplate.id);
      expect(repository.createTemplate).toHaveBeenCalled();
    });

    it('should reject creating duplicate template code and channel with ConflictException', async () => {
      repository.findTemplateByCodeAndChannel.mockResolvedValue(mockTemplate);

      await expect(
        service.createTemplate({
          templateCode: 'TRIP_DELAY_ALERT:en',
          channel: 'EMAIL',
          bodyTemplate: 'Duplicate',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getTemplates and getTemplateById', () => {
    it('should return list of templates', async () => {
      repository.findTemplates.mockResolvedValue([mockTemplate]);

      const result = await service.getTemplates({});
      expect(result).toHaveLength(1);
    });

    it('should return template by ID or throw NotFoundException', async () => {
      repository.findTemplateById.mockResolvedValue(null);

      await expect(service.getTemplateById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('renderTemplate and Multilingual Fallback', () => {
    it('should render requested localized template when available', async () => {
      repository.findTemplateByCodeAndChannel.mockImplementation((code) => {
        if (code === 'TRIP_DELAY_ALERT:ta') return Promise.resolve(mockTamilTemplate);
        return Promise.resolve(null);
      });

      const result = await service.renderTemplate({
        templateCode: 'TRIP_DELAY_ALERT',
        channel: 'EMAIL',
        locale: 'ta',
        variables: {
          busNumber: '401',
          passengerName: 'Manoj',
          tripNumber: 'TRIP-99',
          delayMinutes: 15,
        },
      });

      expect(result.localeUsed).toBe('ta');
      expect(result.subject).toContain('401');
      expect(result.body).toContain('Manoj');
      expect(result.body).toContain('15');
      expect(result.missingVariables).toHaveLength(0);
    });

    it('should fallback to English when requested locale is unavailable', async () => {
      repository.findTemplateByCodeAndChannel.mockImplementation((code) => {
        if (code === 'TRIP_DELAY_ALERT:en') return Promise.resolve(mockTemplate);
        return Promise.resolve(null);
      });

      const result = await service.renderTemplate({
        templateCode: 'TRIP_DELAY_ALERT',
        channel: 'EMAIL',
        locale: 'fr', // French not available -> falls back to en
        variables: {
          busNumber: '401',
          passengerName: 'John',
          tripNumber: 'TRIP-99',
          delayMinutes: 20,
        },
      });

      expect(result.localeUsed).toBe('en');
      expect(result.subject).toContain('Bus 401');
      expect(result.body).toContain('John');
    });

    it('should sanitize HTML tags and script injections in variables', async () => {
      repository.findTemplateByCodeAndChannel.mockResolvedValue(mockTemplate);

      const result = await service.renderTemplate({
        templateCode: 'TRIP_DELAY_ALERT:en',
        channel: 'EMAIL',
        variables: {
          busNumber: '401',
          passengerName: '<script>alert("xss")</script>',
          tripNumber: 'TRIP-99',
          delayMinutes: 10,
        },
      });

      expect(result.body).not.toContain('<script>');
      expect(result.body).toContain('&lt;script&gt;');
    });

    it('should track missing variables when placeholders are omitted', async () => {
      repository.findTemplateByCodeAndChannel.mockResolvedValue(mockTemplate);

      const result = await service.renderTemplate({
        templateCode: 'TRIP_DELAY_ALERT:en',
        channel: 'EMAIL',
        variables: {
          busNumber: '401',
          // passengerName omitted
          tripNumber: 'TRIP-99',
          // delayMinutes omitted
        },
      });

      expect(result.missingVariables).toContain('passengerName');
      expect(result.missingVariables).toContain('delayMinutes');
      expect(result.body).toContain('{{passengerName}}');
    });
  });

  describe('updateTemplate and deleteTemplate', () => {
    it('should update template', async () => {
      repository.findTemplateById.mockResolvedValue(mockTemplate);
      repository.updateTemplate.mockResolvedValue({
        ...mockTemplate,
        subject: 'Updated Subject',
      });

      const result = await service.updateTemplate(mockTemplate.id, {
        subject: 'Updated Subject',
      });

      expect(result.subject).toBe('Updated Subject');
    });

    it('should delete template', async () => {
      repository.findTemplateById.mockResolvedValue(mockTemplate);
      repository.deleteTemplate.mockResolvedValue(true);

      const result = await service.deleteTemplate(mockTemplate.id);
      expect(result.success).toBe(true);
    });
  });
});
