import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service';
import { RealTimeService } from './real-time.service';

describe('RealTimeService', () => {
  let service: RealTimeService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedis = {
      publish: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RealTimeService, { provide: RedisService, useValue: mockRedis }],
    }).compile();

    service = module.get<RealTimeService>(RealTimeService);
    redisService = module.get(RedisService);
  });

  it('should track connected and disconnected clients', () => {
    service.onClientConnected('socket-1', {
      userId: 'user-1',
      roles: ['PASSENGER'],
    });
    expect(service.getStats().activeConnections).toBe(1);

    service.onClientConnected('socket-2', {
      userId: 'user-2',
      roles: ['OPERATOR'],
    });
    expect(service.getStats().activeConnections).toBe(2);

    service.onClientDisconnected('socket-1');
    expect(service.getStats().activeConnections).toBe(1);
  });

  it('should publish to room and forward to Redis', async () => {
    const mockServer = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    };
    service.setServer(mockServer as any);

    const result = await service.publishToRoom('trip:trip-101', 'trip:progress', {
      progressPercentage: 50,
    });

    expect(result.deliveredLocally).toBe(true);
    expect(mockServer.to).toHaveBeenCalledWith('trip:trip-101');
    expect(redisService.publish).toHaveBeenCalledWith(
      'movana:realtime:events',
      expect.stringContaining('trip:trip-101'),
    );
  });

  it('should broadcast event to all connected sockets', async () => {
    const mockServer = {
      emit: jest.fn(),
    };
    service.setServer(mockServer as any);

    const result = await service.broadcastToAll('system:alert', {
      notice: 'Maintenance',
    });

    expect(result.deliveredLocally).toBe(true);
    expect(mockServer.emit).toHaveBeenCalledWith('system:alert', {
      notice: 'Maintenance',
    });
  });

  it('should return available channel descriptors', () => {
    const channels = service.getAvailableChannels();
    expect(channels).toHaveLength(5);
    const names = channels.map((c) => c.channel);
    expect(names).toContain('vehicle');
    expect(names).toContain('trip');
    expect(names).toContain('route');
    expect(names).toContain('user');
    expect(names).toContain('operations');
  });
});
