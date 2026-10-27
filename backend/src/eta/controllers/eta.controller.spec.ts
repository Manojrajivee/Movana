import { Test, TestingModule } from '@nestjs/testing';
import { EtaController } from './eta.controller';
import { EtaService } from '../services/eta.service';

describe('EtaController', () => {
  let controller: EtaController;
  let service: jest.Mocked<EtaService>;

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<EtaService>> = {
      getTripEta: jest.fn(),
      getStopEta: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EtaController],
      providers: [
        {
          provide: EtaService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<EtaController>(EtaController);
    service = module.get(EtaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getTripEta to service', async () => {
    const expected = {
      tripId: '11111111-1111-1111-1111-111111111111',
      tripNumber: 'TRIP-101',
      routeCode: 'R10',
      routeName: 'Downtown Loop',
      vehicleCode: 'BUS-001',
      currentPosition: { latitude: 40.71, longitude: -74.0 },
      tripStatus: 'IN_TRANSIT',
      overallDelayMinutes: 0,
      stopsEta: [],
    };
    service.getTripEta.mockResolvedValue(expected);

    const res = await controller.getTripEta('11111111-1111-1111-1111-111111111111');
    expect(res).toBe(expected);
    expect(service.getTripEta).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('should delegate getStopEta to service', async () => {
    const expected: any[] = [];
    service.getStopEta.mockResolvedValue(expected);

    const res = await controller.getStopEta('22222222-2222-2222-2222-222222222222');
    expect(res).toBe(expected);
    expect(service.getStopEta).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });
});
