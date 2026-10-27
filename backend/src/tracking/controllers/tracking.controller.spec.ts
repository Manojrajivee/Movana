import { Test, TestingModule } from '@nestjs/testing';
import { TrackingController } from './tracking.controller';
import { TrackingService } from '../services/tracking.service';

describe('TrackingController', () => {
  let controller: TrackingController;
  let service: jest.Mocked<TrackingService>;

  const vehicleId = '11111111-1111-4111-a111-111111111111';
  const tripId = '22222222-2222-4222-a222-222222222222';

  const mockVehicleTracking: any = {
    vehicle_id: vehicleId,
    vehicle_code: 'BUS-DEL-101',
    registration_number: 'DL-01-AB-1234',
    current_latitude: 28.6139,
    current_longitude: 77.209,
    vehicle_status: 'ACTIVE',
  };

  const mockTripTracking: any = {
    trip_id: tripId,
    trip_number: 'TRIP-DEL-JPR-101',
    route_code: 'DEL-JPR-01',
    trip_status: 'IN_TRANSIT',
  };

  beforeEach(async () => {
    const mockService = {
      getActiveVehicles: jest.fn().mockResolvedValue({
        items: [mockVehicleTracking],
        total: 1,
      }),
      getNearbyVehicles: jest.fn().mockResolvedValue([
        {
          ...mockVehicleTracking,
          distance_km: 1.5,
        },
      ]),
      getVehicleTracking: jest.fn().mockResolvedValue(mockVehicleTracking),
      getTripTracking: jest.fn().mockResolvedValue(mockTripTracking),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [{ provide: TrackingService, useValue: mockService }],
    }).compile();

    controller = module.get<TrackingController>(TrackingController);
    service = module.get(TrackingService);
  });

  it('queries active vehicle tracking feed', async () => {
    const res = await controller.getActiveVehicles({ limit: 10, offset: 0 });
    expect(res.items).toHaveLength(1);
    expect(service.getActiveVehicles).toHaveBeenCalled();
  });

  it('queries nearby live transit vehicles', async () => {
    const query = { latitude: 28.61, longitude: 77.2, radiusKm: 10, limit: 20 };
    const res = await controller.getNearbyVehicles(query);
    expect(res).toHaveLength(1);
    expect(service.getNearbyVehicles).toHaveBeenCalledWith(query);
  });

  it('gets real-time tracking for vehicle by ID', async () => {
    const res = await controller.getVehicleTracking(vehicleId);
    expect(res.vehicle_id).toBe(vehicleId);
    expect(service.getVehicleTracking).toHaveBeenCalledWith(vehicleId);
  });

  it('gets real-time tracking for trip by ID', async () => {
    const res = await controller.getTripTracking(tripId);
    expect(res.trip_id).toBe(tripId);
    expect(service.getTripTracking).toHaveBeenCalledWith(tripId);
  });
});
