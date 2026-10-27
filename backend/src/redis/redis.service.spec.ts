import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService (Unit Tests)', () => {
  let service: RedisService;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockRedisClient = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      on: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                'redis.host': 'localhost',
                'redis.port': 6379,
                'redis.requiredForReady': false,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    if ((service as any).client) {
      (service as any).client.disconnect();
    }
    (service as any).client = mockRedisClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return up status when Redis responds with PONG', async () => {
    const health = await service.checkHealth();
    expect(health.status).toBe('up');
    expect(health.required).toBe(false);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return down status when Redis ping fails without crashing', async () => {
    mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection refused'));

    const health = await service.checkHealth();
    expect(health.status).toBe('down');
    expect(health.error).toBe('Redis unreachable or connection timed out');
  });

  it('12. should cleanly quit or disconnect client on graceful shutdown', async () => {
    await service.closeClient();
    expect(mockRedisClient.quit).toHaveBeenCalledTimes(1);
    expect((service as any).client).toBeNull();
  });
});
