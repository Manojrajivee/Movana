import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { RealTimeGateway } from './real-time.gateway';
import { RealTimeService } from '../services/real-time.service';

describe('RealTimeGateway', () => {
  let gateway: RealTimeGateway;
  let jwtService: jest.Mocked<JwtService>;
  let realTimeService: jest.Mocked<RealTimeService>;

  const userId = '11111111-1111-4111-a111-111111111111';

  beforeEach(async () => {
    const mockJwt = {
      verifyAsync: jest.fn(),
    };

    const mockRealTimeService = {
      setServer: jest.fn(),
      onClientConnected: jest.fn(),
      onClientDisconnected: jest.fn(),
      publishToRoom: jest.fn(),
      broadcastToAll: jest.fn(),
      getStats: jest.fn(),
      getAvailableChannels: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealTimeGateway,
        { provide: JwtService, useValue: mockJwt },
        { provide: RealTimeService, useValue: mockRealTimeService },
      ],
    }).compile();

    gateway = module.get<RealTimeGateway>(RealTimeGateway);
    jwtService = module.get(JwtService);
    realTimeService = module.get(RealTimeService);
  });

  describe('handleConnection', () => {
    it('should authenticate client with valid JWT token', async () => {
      const mockSocket = {
        id: 'socket-1',
        handshake: {
          auth: { token: 'valid-jwt-token' },
          headers: {},
        },
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      jwtService.verifyAsync.mockResolvedValue({
        sub: userId,
        email: 'passenger@movana.internal',
        roles: ['PASSENGER'],
      });

      await gateway.handleConnection(mockSocket as any);

      expect((mockSocket.data as any).user).toBeDefined();
      expect((mockSocket.data as any).user.userId).toBe(userId);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'connected',
        expect.objectContaining({ userId }),
      );
      expect(realTimeService.onClientConnected).toHaveBeenCalledWith(
        'socket-1',
        expect.objectContaining({ userId }),
      );
    });

    it('should disconnect client if token is missing', async () => {
      const mockSocket = {
        id: 'socket-missing-token',
        handshake: { auth: {}, headers: {} },
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockSocket as any);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('missing') }),
      );
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect client if token is invalid or expired', async () => {
      const mockSocket = {
        id: 'socket-bad-token',
        handshake: { auth: { token: 'invalid' }, headers: {} },
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await gateway.handleConnection(mockSocket as any);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('invalid') }),
      );
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleSubscribe', () => {
    let mockSocket: any;

    beforeEach(() => {
      mockSocket = {
        id: 'socket-test',
        data: {
          user: {
            userId,
            roles: ['PASSENGER'],
          },
        },
        join: jest.fn(),
        leave: jest.fn(),
      };
    });

    it('should subscribe to vehicle room', () => {
      const result = gateway.handleSubscribe(mockSocket, {
        channel: 'vehicle',
        targetId: 'bus-101',
      });

      expect(result.success).toBe(true);
      expect(result.room).toBe('vehicle:bus-101');
      expect(mockSocket.join).toHaveBeenCalledWith('vehicle:bus-101');
    });

    it('should subscribe to trip room', () => {
      const result = gateway.handleSubscribe(mockSocket, {
        channel: 'trip',
        targetId: 'trip-202',
      });

      expect(result.success).toBe(true);
      expect(result.room).toBe('trip:trip-202');
      expect(mockSocket.join).toHaveBeenCalledWith('trip:trip-202');
    });

    it('should allow user to subscribe to their own user room', () => {
      const result = gateway.handleSubscribe(mockSocket, {
        channel: 'user',
        targetId: userId,
      });

      expect(result.success).toBe(true);
      expect(result.room).toBe(`user:${userId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('should reject passenger from subscribing to another user room', () => {
      const result = gateway.handleSubscribe(mockSocket, {
        channel: 'user',
        targetId: 'other-user-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot subscribe to another user');
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should reject passenger from subscribing to operations channel', () => {
      const result = gateway.handleSubscribe(mockSocket, {
        channel: 'operations',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires staff dispatch');
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should permit OPERATOR to subscribe to operations channel', () => {
      mockSocket.data.user.roles = ['OPERATOR'];

      const result = gateway.handleSubscribe(mockSocket, {
        channel: 'operations',
      });

      expect(result.success).toBe(true);
      expect(result.room).toBe('operations');
      expect(mockSocket.join).toHaveBeenCalledWith('operations');
    });
  });

  describe('handleUnsubscribe and handlePing', () => {
    it('should leave room on unsubscribe', () => {
      const mockSocket = {
        id: 'socket-leave',
        leave: jest.fn(),
      };

      const result = gateway.handleUnsubscribe(mockSocket as any, {
        room: 'trip:101',
      });

      expect(result.success).toBe(true);
      expect(mockSocket.leave).toHaveBeenCalledWith('trip:101');
    });

    it('should reply with pong on ping', () => {
      const result = gateway.handlePing();
      expect(result.event).toBe('pong');
      expect(result.timestamp).toBeDefined();
    });
  });
});
