import { Test, TestingModule } from '@nestjs/testing';
import { StopsController } from './stops.controller';
import { StopsService } from '../services/stops.service';

describe('StopsController', () => {
  let controller: StopsController;
  let service: jest.Mocked<StopsService>;

  const stopId = '11111111-1111-4111-a111-111111111111';

  const mockStop: any = {
    id: stopId,
    stop_code: 'DEL-NDLS-01',
    name: 'New Delhi Railway Station Gate 2',
    address: 'Bhavbhuti Marg',
    city: 'New Delhi',
    state: 'Delhi',
    latitude: 28.6429,
    longitude: 77.2195,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const mockService = {
      createStop: jest.fn().mockResolvedValue(mockStop),
      getStops: jest.fn().mockResolvedValue({ items: [mockStop], total: 1 }),
      getNearbyStops: jest.fn().mockResolvedValue([{ ...mockStop, distance_km: 1.5 }]),
      getStopById: jest.fn().mockResolvedValue(mockStop),
      updateStop: jest.fn().mockResolvedValue({ ...mockStop, name: 'Updated Stop' }),
      updateStopStatus: jest.fn().mockResolvedValue({ ...mockStop, status: 'INACTIVE' }),
      deleteStop: jest.fn().mockResolvedValue(mockStop),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StopsController],
      providers: [{ provide: StopsService, useValue: mockService }],
    }).compile();

    controller = module.get<StopsController>(StopsController);
    service = module.get(StopsService);
  });

  it('creates stop', async () => {
    const body = {
      stopCode: 'DEL-NDLS-01',
      name: 'New Delhi Railway Station Gate 2',
      address: 'Bhavbhuti Marg',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.6429,
      longitude: 77.2195,
    };
    const result = await controller.createStop(body);
    expect(result).toBeDefined();
    expect(service.createStop).toHaveBeenCalledWith(body);
  });

  it('lists stops', async () => {
    const result = await controller.getStops({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(service.getStops).toHaveBeenCalled();
  });

  it('gets nearby stops', async () => {
    const query = { latitude: 28.64, longitude: 77.22, radiusKm: 5, limit: 10 };
    const result = await controller.getNearbyStops(query);
    expect(result).toHaveLength(1);
    expect(service.getNearbyStops).toHaveBeenCalledWith(query);
  });

  it('gets stop by ID', async () => {
    const result = await controller.getStopById(stopId);
    expect(result.id).toBe(stopId);
    expect(service.getStopById).toHaveBeenCalledWith(stopId);
  });

  it('updates stop', async () => {
    const body = { name: 'Updated Stop' };
    const result = await controller.updateStop(stopId, body);
    expect(result.name).toBe('Updated Stop');
    expect(service.updateStop).toHaveBeenCalledWith(stopId, body);
  });

  it('updates stop status', async () => {
    const body = { status: 'INACTIVE' as const };
    const result = await controller.updateStopStatus(stopId, body);
    expect(result.status).toBe('INACTIVE');
    expect(service.updateStopStatus).toHaveBeenCalledWith(stopId, body);
  });

  it('deletes stop', async () => {
    const result = await controller.deleteStop(stopId);
    expect(result.id).toBe(stopId);
    expect(service.deleteStop).toHaveBeenCalledWith(stopId);
  });
});
