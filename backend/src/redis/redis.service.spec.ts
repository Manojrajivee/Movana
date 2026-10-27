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
      get: jest.fn().mockResolvedValue('{"cached":true}'),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue(['test:1', 'test:2']),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue(['mem1', 'mem2']),
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

  it('provides safe key-value cache operations', async () => {
    expect(service.isAvailable()).toBe(true);
    await service.set('foo', 'bar', 60);
    expect(mockRedisClient.set).toHaveBeenCalledWith('foo', 'bar', 'EX', 60);

    const val = await service.get('foo');
    expect(val).toBe('{"cached":true}');

    await service.del('foo');
    expect(mockRedisClient.del).toHaveBeenCalledWith('foo');

    await service.delByPattern('test:*');
    expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
    expect(mockRedisClient.del).toHaveBeenCalledWith('test:1', 'test:2');

    await service.sadd('set-key', 'item-1');
    expect(mockRedisClient.sadd).toHaveBeenCalledWith('set-key', 'item-1');

    await service.srem('set-key', 'item-1');
    expect(mockRedisClient.srem).toHaveBeenCalledWith('set-key', 'item-1');

    const members = await service.smembers('set-key');
    expect(members).toEqual(['mem1', 'mem2']);

    const matchedKeys = await service.keys('test:*');
    expect(matchedKeys).toEqual(['test:1', 'test:2']);
  });
});
