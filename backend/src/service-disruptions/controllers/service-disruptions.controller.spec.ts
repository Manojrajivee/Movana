import { Test, TestingModule } from '@nestjs/testing';
import { ServiceDisruptionsController } from './service-disruptions.controller';
import { ServiceDisruptionsService } from '../services/service-disruptions.service';

describe('ServiceDisruptionsController', () => {
  let controller: ServiceDisruptionsController;
  let service: jest.Mocked<ServiceDisruptionsService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'safety@movana.internal',
    roles: ['SAFETY_OFFICER'],
    permissions: [],
  };

  const disruptionId = '22222222-2222-4222-a222-222222222222';
  const routeId = '33333333-3333-4333-a333-333333333333';

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<ServiceDisruptionsService>> = {
      createDisruption: jest.fn(),
      getDisruptions: jest.fn(),
      getActiveDisruptions: jest.fn(),
      getDisruptionById: jest.fn(),
      updateDisruption: jest.fn(),
      resolveDisruption: jest.fn(),
      deleteDisruption: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceDisruptionsController],
      providers: [
        {
          provide: ServiceDisruptionsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ServiceDisruptionsController>(ServiceDisruptionsController);
    service = module.get(ServiceDisruptionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate createDisruption to service', async () => {
    const payload = {
      title: 'Dense Fog Advisory',
      description: 'Visibility below 50m on Yamuna Expressway',
      disruptionType: 'WEATHER_ALERT',
      severity: 'WARNING',
      routeId,
    };
    service.createDisruption.mockResolvedValue({ id: disruptionId } as any);

    const res = await controller.createDisruption(payload, mockUser);
    expect(res.id).toBe(disruptionId);
    expect(service.createDisruption).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dense Fog Advisory' }),
      mockUser,
    );
  });

  it('should delegate getActiveDisruptions to service', async () => {
    service.getActiveDisruptions.mockResolvedValue([{ id: disruptionId } as any]);

    const res = await controller.getActiveDisruptions();
    expect(res).toHaveLength(1);
    expect(service.getActiveDisruptions).toHaveBeenCalled();
  });

  it('should delegate getDisruptions to service', async () => {
    service.getDisruptions.mockResolvedValue([{ id: disruptionId } as any]);

    const res = await controller.getDisruptions({ status: 'ACTIVE', limit: '20' });
    expect(res).toHaveLength(1);
    expect(service.getDisruptions).toHaveBeenCalled();
  });

  it('should delegate getDisruptionById to service', async () => {
    service.getDisruptionById.mockResolvedValue({ id: disruptionId } as any);

    const res = await controller.getDisruptionById(disruptionId);
    expect(res.id).toBe(disruptionId);
    expect(service.getDisruptionById).toHaveBeenCalledWith(disruptionId);
  });

  it('should delegate updateDisruption to service', async () => {
    service.updateDisruption.mockResolvedValue({ id: disruptionId, severity: 'CRITICAL' } as any);

    const res = await controller.updateDisruption(disruptionId, { severity: 'CRITICAL' });
    expect(res.severity).toBe('CRITICAL');
    expect(service.updateDisruption).toHaveBeenCalledWith(disruptionId, { severity: 'CRITICAL' });
  });

  it('should delegate resolveDisruption to service', async () => {
    service.resolveDisruption.mockResolvedValue({ id: disruptionId, status: 'RESOLVED' } as any);

    const res = await controller.resolveDisruption(disruptionId, {
      resolutionNotes: 'Fog cleared',
    });
    expect(res.status).toBe('RESOLVED');
    expect(service.resolveDisruption).toHaveBeenCalledWith(disruptionId, {
      resolutionNotes: 'Fog cleared',
    });
  });

  it('should delegate deleteDisruption to service', async () => {
    service.deleteDisruption.mockResolvedValue({ success: true, message: 'Deleted' });

    const res = await controller.deleteDisruption(disruptionId);
    expect(res.success).toBe(true);
    expect(service.deleteDisruption).toHaveBeenCalledWith(disruptionId);
  });
});
