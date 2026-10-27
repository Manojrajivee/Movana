import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  const mockDatabaseService = {
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 5,
      database: 'movana',
      user: 'movana_app',
    }),
    closePool: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedisService = {
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 2,
      required: false,
    }),
    closeClient: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    // Provide safe test environment variables
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3001';
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

  it('GET /unknown-route should return safe 404 response with consistent JSON envelope', async () => {
    const res = await request(app.getHttpServer()).get('/unknown-endpoint-404').expect(404);

    expect(res.body).toEqual(
      expect.objectContaining({
        statusCode: 404,
        path: '/unknown-endpoint-404',
      }),
    );
    expect(res.body.timestamp).toBeDefined();
  });
});
