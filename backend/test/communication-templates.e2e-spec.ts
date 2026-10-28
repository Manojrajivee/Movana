import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { CommunicationTemplatesRepository } from '../src/communication-templates/repositories/communication-templates.repository';

describe('Communication Templates (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let adminToken: string;

  const tmplId = '11111111-1111-4111-a111-111111111111';

  const mockTemplate = {
    id: tmplId,
    template_code: 'TRIP_DELAY_ALERT:en',
    channel: 'EMAIL',
    subject: 'Delay Notice: Bus {{busNumber}}',
    body_template:
      'Dear {{passengerName}}, trip #{{tripNumber}} is delayed by {{delayMinutes}} mins.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockDatabaseService = {
    verifyIdentity: jest.fn().mockResolvedValue({
      database_name: 'movana',
      database_user: 'movana_app',
    }),
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 1,
      database: 'movana',
      user: 'movana_app',
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  const mockTemplateRepo = {
    createTemplate: jest.fn().mockResolvedValue(mockTemplate),
    findTemplateById: jest.fn().mockImplementation((id: string) => {
      if (id === tmplId) return Promise.resolve(mockTemplate);
      return Promise.resolve(null);
    }),
    findTemplateByCodeAndChannel: jest.fn().mockImplementation((code: string) => {
      if (code === 'TRIP_DELAY_ALERT:en') return Promise.resolve(mockTemplate);
      return Promise.resolve(null);
    }),
    findTemplates: jest.fn().mockResolvedValue([mockTemplate]),
    updateTemplate: jest.fn().mockResolvedValue({
      ...mockTemplate,
      subject: 'Updated Subject',
    }),
    deleteTemplate: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(CommunicationTemplatesRepository)
      .useValue(mockTemplateRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: 'passenger-id',
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });

    adminToken = jwtService.sign({
      sub: 'admin-id',
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/communication-templates', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/communication-templates');
      expect(res.status).toBe(401);
    });

    it('should reject passenger with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communication-templates')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          templateCode: 'CUSTOM_ALERT',
          channel: 'EMAIL',
          bodyTemplate: 'Test',
        });
      expect(res.status).toBe(403);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communication-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should allow ADMIN to create template with 201 Created', async () => {
      mockTemplateRepo.findTemplateByCodeAndChannel.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/api/v1/communication-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          templateCode: 'TRIP_DELAY_ALERT:en',
          channel: 'EMAIL',
          subject: 'Delay Notice: Bus {{busNumber}}',
          bodyTemplate: 'Dear {{passengerName}}...',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(tmplId);
    });
  });

  describe('GET /api/v1/communication-templates', () => {
    it('should reject passenger access with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/communication-templates')
        .set('Authorization', `Bearer ${passengerToken}`);
      expect(res.status).toBe(403);
    });

    it('should return template list for ADMIN with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/communication-templates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/v1/communication-templates/:id', () => {
    it('should return 404 for non-existent template', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/communication-templates/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('should return template details with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/communication-templates/${tmplId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tmplId);
    });
  });

  describe('PATCH /api/v1/communication-templates/:id', () => {
    it('should update template with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/communication-templates/${tmplId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject: 'Updated Subject' });

      expect(res.status).toBe(200);
      expect(res.body.subject).toBe('Updated Subject');
    });
  });

  describe('DELETE /api/v1/communication-templates/:id', () => {
    it('should delete template with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/communication-templates/${tmplId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/communication-templates/render', () => {
    it('should reject passenger render request with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communication-templates/render')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          templateCode: 'TRIP_DELAY_ALERT',
          channel: 'EMAIL',
        });
      expect(res.status).toBe(403);
    });

    it('should render template with variables and HTML escaping with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communication-templates/render')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          templateCode: 'TRIP_DELAY_ALERT',
          channel: 'EMAIL',
          locale: 'en',
          variables: {
            busNumber: '401',
            passengerName: 'Manoj',
            tripNumber: 'TRIP-10',
            delayMinutes: 15,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.body).toContain('Manoj');
      expect(res.body.body).toContain('15');
      expect(res.body.localeUsed).toBe('en');
    });
  });
});
