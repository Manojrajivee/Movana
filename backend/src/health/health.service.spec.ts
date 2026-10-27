import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

describe('HealthService (Unit Tests)', () => {
  let service: HealthService;
  let mockDatabaseService: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockDatabaseService = {
      checkHealth: jest.fn(),
    };

    mockRedisService = {
      checkHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('9. liveness remains independent of database and Redis availability', () => {
    // Even if database and redis services are never called, liveness succeeds
    const liveness = service.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(typeof liveness.uptimeSeconds).toBe('number');
    expect(liveness.timestamp).toBeDefined();
    expect(mockDatabaseService.checkHealth).not.toHaveBeenCalled();
    expect(mockRedisService.checkHealth).not.toHaveBeenCalled();
  });

  it('should return 200 OK readiness when required dependencies are up', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 15,
      database: 'movana',
      user: 'movana_app',
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 3,
      required: false,
    });

    const result = await service.getReadiness();
    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.response.status).toBe('ok');
    expect(result.response.checks.database.status).toBe('up');
    expect(result.response.checks.redis.status).toBe('up');
  });

  it('10. readiness returns 503 Service Unavailable when PostgreSQL is down or identity invalid', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 50,
      error: 'Database connection or identity verification failed',
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 2,
      required: false,
    });

    const result = await service.getReadiness();
    expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result.response.status).toBe('down');
    expect(result.response.checks.database.status).toBe('down');
  });

  it('10b. readiness returns 503 when Redis is marked REQUIRED and is down', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 10,
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 50,
      required: true,
      error: 'Connection refused',
    });

    const result = await service.getReadiness();
    expect(result.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result.response.status).toBe('down');
    expect(result.response.checks.redis.status).toBe('down');
    expect(result.response.checks.redis.required).toBe(true);
  });

  it('10c. readiness returns 200 when Redis is OPTIONAL and down', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'up',
      latencyMs: 12,
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 50,
      required: false, // Optional for local dev
      error: 'Connection refused',
    });

    const result = await service.getReadiness();
    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.response.status).toBe('ok');
    expect(result.response.checks.database.status).toBe('up');
    expect(result.response.checks.redis.status).toBe('down');
  });

  it('11. health responses do not reveal secrets, hostnames, passwords, or raw driver errors', async () => {
    mockDatabaseService.checkHealth.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 25,
      error: 'Database connection or identity verification failed',
    });
    mockRedisService.checkHealth.mockResolvedValueOnce({
      status: 'down',
      latencyMs: 10,
      required: false,
      error: 'Redis unreachable or connection timed out',
    });

    const result = await service.getReadiness();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('127.0.0.1');
    expect(serialized).not.toContain('localhost');
    expect(serialized).not.toContain('movana_app');
    expect(serialized).not.toContain('ECONNREFUSED');
  });
});
