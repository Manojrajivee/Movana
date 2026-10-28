import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';

describe('Real-Time Gateway (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let adminToken: string;

  const userId = '11111111-1111-4111-a111-111111111111';

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: userId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });

    adminToken = jwtService.sign({
      sub: '44444444-4444-4444-a444-444444444444',
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/real-time/channels', () => {
    it('should return available real-time channels with 200 OK without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/real-time/channels');

      expect(res.status).toBe(200);
      expect(res.body.channels).toBeInstanceOf(Array);
      expect(res.body.channels).toHaveLength(5);
      expect(res.body.documentation).toBeDefined();
    });
  });

  describe('GET /api/v1/real-time/stats', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/real-time/stats');
      expect(res.status).toBe(401);
    });

    it('should reject passenger access with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/real-time/stats')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow ADMIN to retrieve stats with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/real-time/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.activeConnections).toBeDefined();
      expect(res.body.totalMessagesSent).toBeDefined();
    });
  });

  describe('POST /api/v1/real-time/publish', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/real-time/publish');
      expect(res.status).toBe(401);
    });

    it('should reject passenger access with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/real-time/publish')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          room: 'trip:101',
          event: 'trip:progress',
          data: { progress: 50 },
        });

      expect(res.status).toBe(403);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/real-time/publish')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should allow ADMIN to publish real-time event with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/real-time/publish')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          room: 'trip:101',
          event: 'trip:progress',
          data: { progress: 50 },
        });

      expect(res.status).toBe(200);
      expect(res.body.room).toBe('trip:101');
      expect(res.body.event).toBe('trip:progress');
    });
  });
});
