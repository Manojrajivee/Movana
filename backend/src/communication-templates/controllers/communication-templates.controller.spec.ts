import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationTemplatesController } from './communication-templates.controller';
import { CommunicationTemplatesService } from '../services/communication-templates.service';

describe('CommunicationTemplatesController', () => {
  let controller: CommunicationTemplatesController;
  let service: jest.Mocked<CommunicationTemplatesService>;

  const mockTemplate = {
    id: 'tmpl-1',
    template_code: 'TRIP_UPDATE:en',
    channel: 'EMAIL' as const,
    subject: 'Trip Update',
    body_template: 'Hello {{name}}',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockService = {
      createTemplate: jest.fn(),
      getTemplates: jest.fn(),
      getTemplateById: jest.fn(),
      updateTemplate: jest.fn(),
      deleteTemplate: jest.fn(),
      renderTemplate: jest.fn(),
      previewTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunicationTemplatesController],
      providers: [{ provide: CommunicationTemplatesService, useValue: mockService }],
    }).compile();

    controller = module.get<CommunicationTemplatesController>(CommunicationTemplatesController);
    service = module.get(CommunicationTemplatesService);
  });

  it('should create template', async () => {
    service.createTemplate.mockResolvedValue(mockTemplate);

    const result = await controller.createTemplate({
      templateCode: 'TRIP_UPDATE:en',
      channel: 'EMAIL',
      subject: 'Trip Update',
      bodyTemplate: 'Hello {{name}}',
    });

    expect(result.id).toBe('tmpl-1');
  });

  it('should list templates', async () => {
    service.getTemplates.mockResolvedValue([mockTemplate]);

    const result = await controller.getTemplates({});
    expect(result).toHaveLength(1);
  });

  it('should get template by ID', async () => {
    service.getTemplateById.mockResolvedValue(mockTemplate);

    const result = await controller.getTemplateById('tmpl-1');
    expect(result.id).toBe('tmpl-1');
  });

  it('should update template', async () => {
    service.updateTemplate.mockResolvedValue({
      ...mockTemplate,
      subject: 'New Subject',
    });

    const result = await controller.updateTemplate('tmpl-1', {
      subject: 'New Subject',
    });
    expect(result.subject).toBe('New Subject');
  });

  it('should delete template', async () => {
    service.deleteTemplate.mockResolvedValue({ success: true });

    const result = await controller.deleteTemplate('tmpl-1');
    expect(result.success).toBe(true);
  });

  it('should render template', async () => {
    service.renderTemplate.mockResolvedValue({
      templateCode: 'TRIP_UPDATE:en',
      channel: 'EMAIL',
      localeUsed: 'en',
      subject: 'Trip Update',
      body: 'Hello John',
      missingVariables: [],
    });

    const result = await controller.renderTemplate({
      templateCode: 'TRIP_UPDATE:en',
      channel: 'EMAIL',
      variables: { name: 'John' },
    });

    expect(result.body).toBe('Hello John');
  });

  it('should preview template', async () => {
    service.previewTemplate.mockResolvedValue({
      templateCode: 'TRIP_UPDATE:en',
      channel: 'EMAIL',
      localeUsed: 'en',
      subject: 'Trip Update',
      body: 'Hello John',
      missingVariables: [],
    });

    const result = await controller.previewTemplate('tmpl-1', { name: 'John' });
    expect(result.body).toBe('Hello John');
  });
});
