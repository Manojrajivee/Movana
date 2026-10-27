import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';

describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  const mockDatabaseService = {
    checkHealth: jest.fn(),
    closePool: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedisService = {
    checkHealth: jest.fn(),
    closeClient: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3002';
    process.env.DATABASE_NAME = 'movana';
    process.env.DATABASE_USER = 'movana_app';
    process.env.DATABASE_PASSWORD = 'TestIntegrationSecretPassword123!';
    process.env.REDIS_REQUIRED_FOR_READY = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health/live returns 200 OK independent of infrastructure status', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);

    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.timestamp).toBeDefined();

    // Verify infrastructure checks were NOT called for liveness
    expect(mockDatabaseService.checkHealth).not.toHaveBeenCalled();
    expect(mockRedisService.checkHealth).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 OK when PostgreSQL is healthy', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 12,
      database: 'movana',
      user: 'movana_app',
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 1,
      required: false,
    });

    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.redis.status).toBe('up');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /health/ready returns 503 Service Unavailable when database identity check fails', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 45,
      error: 'Database connection or identity verification failed',
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 2,
      required: false,
    });

    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(res.body.status).toBe('down');
    expect(res.body.checks.database.status).toBe('down');
    // Ensure response is sanitized and doesn't leak secrets or stack traces
    const resStr = JSON.stringify(res.body);
    expect(resStr).not.toContain('password');
    expect(resStr).not.toContain('stack');
  });
});
