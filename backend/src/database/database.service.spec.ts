import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

describe('DatabaseService (Unit Tests)', () => {
  let service: DatabaseService;
  let mockClient: any;
  let mockPool: any;

  beforeEach(async () => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                'database.host': 'localhost',
                'database.port': 5432,
                'database.name': 'movana',
                'database.user': 'movana_app',
                'database.password': 'ValidSecretPassword!',
                'database.ssl': false,
                'database.poolMin': 2,
                'database.poolMax': 10,
                'database.connectionTimeoutMs': 5000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    // Drain initially created pool before attaching mock to prevent open handles
    if ((service as any).pool) {
      await (service as any).pool.end();
    }
    (service as any).pool = mockPool;
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  it('6. should accept only the exact expected identity (movana, movana_app)', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ database_name: 'movana', database_user: 'movana_app' }],
    });

    const identity = await service.verifyIdentity();

    expect(identity.database_name).toBe('movana');
    expect(identity.database_user).toBe('movana_app');
    expect(service.isIdentityVerified()).toBe(true);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('7. should reject an unexpected database name and fail closed', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ database_name: 'wrong_database', database_user: 'movana_app' }],
    });

    await expect(service.verifyIdentity()).rejects.toThrowError(
      /CRITICAL DATABASE ISOLATION VIOLATION/i,
    );
    expect(service.isIdentityVerified()).toBe(false);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('8. should reject an unexpected database user and forbidden privileged roles', async () => {
    // Attempting connection as postgres superuser
    mockClient.query.mockResolvedValueOnce({
      rows: [{ database_name: 'movana', database_user: 'postgres' }],
    });

    await expect(service.verifyIdentity()).rejects.toThrowError(
      /CRITICAL PRIVILEGE VIOLATION.*forbidden privileged role 'postgres'/i,
    );
    expect(service.isIdentityVerified()).toBe(false);

    // Attempting connection as movana_owner
    mockClient.query.mockResolvedValueOnce({
      rows: [{ database_name: 'movana', database_user: 'movana_owner' }],
    });

    await expect(service.verifyIdentity()).rejects.toThrowError(
      /CRITICAL PRIVILEGE VIOLATION.*forbidden privileged role 'movana_owner'/i,
    );
    expect(service.isIdentityVerified()).toBe(false);
  });

  it('12. should gracefully drain and close pool on shutdown', async () => {
    await service.closePool();
    expect(mockPool.end).toHaveBeenCalledTimes(1);
    expect((service as any).pool).toBeNull();
  });

  it('should return sanitized health status on checkHealth failure', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('Connection timed out to 192.168.1.1:5432'));

    const health = await service.checkHealth();
    expect(health.status).toBe('down');
    expect(health.error).toBe('Database connection or identity verification failed');
    // Ensure no IP or host is leaked
    expect(health.error).not.toContain('192.168.1.1');
  });
});
