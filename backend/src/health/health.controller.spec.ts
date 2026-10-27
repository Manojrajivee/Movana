import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController (Unit Tests)', () => {
  let controller: HealthController;
  let mockHealthService: any;

  beforeEach(async () => {
    mockHealthService = {
      getLiveness: jest.fn().mockReturnValue({
        status: 'ok',
        uptimeSeconds: 42,
        timestamp: '2026-10-26T12:00:00.000Z',
      }),
      getReadiness: jest.fn().mockResolvedValue({
        statusCode: HttpStatus.OK,
        response: {
          status: 'ok',
          timestamp: '2026-10-26T12:00:00.000Z',
          checks: {
            database: { status: 'up', latencyMs: 5 },
            redis: { status: 'up', latencyMs: 2, required: false },
          },
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return liveness response', () => {
    const live = controller.getLive();
    expect(live.status).toBe('ok');
    expect(live.uptimeSeconds).toBe(42);
  });

  it('should return readiness response and set status code', async () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
    } as any;

    const ready = await controller.getReady(mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(ready.status).toBe('ok');
    expect(ready.checks.database.status).toBe('up');
  });
});
