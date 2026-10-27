import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service';
import { TrackingRepository } from '../repositories/tracking.repository';
import { TrackingService } from './tracking.service';

describe('TrackingService', () => {
  let service: TrackingService;
  let repo: jest.Mocked<TrackingRepository>;
  let redis: jest.Mocked<RedisService>;

  const vehicleId = '11111111-1111-4111-a111-111111111111';
  const tripId = '22222222-2222-4222-a222-222222222222';

  const mockVehicleTracking: any = {
    vehicle_id: vehicleId,
    vehicle_code: 'BUS-DEL-101',
    registration_number: 'DL-01-AB-1234',
    vehicle_type: 'Low-Floor Electric Bus',
    vehicle_status: 'ACTIVE',
    current_latitude: 28.6139,
    current_longitude: 77.209,
    last_location_at: new Date(),
    current_odometer: 14500.5,
    fuel_type: 'ELECTRIC',
    device_imei: '862000000000001',
    active_trip_id: tripId,
    active_trip_number: 'TRIP-DEL-JPR-101',
    active_trip_status: 'IN_TRANSIT',
  };

  const mockTripTracking: any = {
    trip_id: tripId,
    trip_number: 'TRIP-DEL-JPR-101',
    route_code: 'DEL-JPR-01',
    route_name: 'Delhi to Jaipur High Speed',
    origin_stop: 'ISBT Kashmiri Gate',
    destination_stop: 'Sindhi Camp Jaipur',
    vehicle_code: 'BUS-DEL-101',
    registration_number: 'DL-01-AB-1234',
    primary_driver_name: 'Rajesh Sharma',
    driver_phone: '+919876543210',
    scheduled_departure_at: new Date(),
    scheduled_arrival_at: new Date(Date.now() + 6 * 3600 * 1000),
    actual_departure_at: new Date(),
    actual_arrival_at: null,
    delay_minutes: 0,
    trip_status: 'IN_TRANSIT',
    current_stop: 'Gurugram IFFCO Chowk',
    current_latitude: 28.472,
    current_longitude: 77.0725,
    last_telemetry_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findActiveVehicles: jest.fn().mockResolvedValue({
        items: [mockVehicleTracking],
        total: 1,
      }),
      findVehicleTrackingById: jest.fn().mockImplementation((id: string) => {
        if (id === vehicleId) return Promise.resolve(mockVehicleTracking);
        return Promise.resolve(null);
      }),
      findTripTrackingById: jest.fn().mockImplementation((id: string) => {
        if (id === tripId) return Promise.resolve(mockTripTracking);
        return Promise.resolve(null);
      }),
      findNearbyVehicles: jest.fn().mockResolvedValue([
        {
          ...mockVehicleTracking,
          distance_km: 1.25,
        },
      ]),
    };

    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: TrackingRepository, useValue: mockRepo },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TrackingService>(TrackingService);
    repo = module.get(TrackingRepository);
    redis = module.get(RedisService);
  });

  describe('getActiveVehicles', () => {
    it('queries active vehicles tracking feed', async () => {
      const res = await service.getActiveVehicles({
        limit: 10,
        offset: 0,
      });

      expect(res.items).toHaveLength(1);
      expect(repo.findActiveVehicles).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });
  });

  describe('getVehicleTracking', () => {
    it('fetches vehicle location from DB and caches in Redis when cache misses', async () => {
      const res = await service.getVehicleTracking(vehicleId);

      expect(res).toBeDefined();
      expect(res.vehicle_id).toBe(vehicleId);
      expect(repo.findVehicleTrackingById).toHaveBeenCalledWith(vehicleId);
      expect(redis.set).toHaveBeenCalledWith(
        `tracking:vehicle:${vehicleId}`,
        expect.any(String),
        10,
      );
    });

    it('returns cached vehicle position from Redis when cache hits', async () => {
      (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockVehicleTracking));

      const res = await service.getVehicleTracking(vehicleId);

      expect(res).toBeDefined();
      expect(res.vehicle_id).toBe(vehicleId);
      expect(repo.findVehicleTrackingById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if vehicle tracking not found', async () => {
      await expect(
        service.getVehicleTracking('99999999-9999-4999-a999-999999999999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTripTracking', () => {
    it('fetches trip current status from DB and caches in Redis when cache misses', async () => {
      const res = await service.getTripTracking(tripId);

      expect(res).toBeDefined();
      expect(res.trip_id).toBe(tripId);
      expect(repo.findTripTrackingById).toHaveBeenCalledWith(tripId);
      expect(redis.set).toHaveBeenCalledWith(`tracking:trip:${tripId}`, expect.any(String), 10);
    });

    it('returns cached trip progress from Redis when cache hits', async () => {
      (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockTripTracking));

      const res = await service.getTripTracking(tripId);

      expect(res).toBeDefined();
      expect(res.trip_id).toBe(tripId);
      expect(repo.findTripTrackingById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if trip tracking not found', async () => {
      await expect(service.getTripTracking('99999999-9999-4999-a999-999999999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getNearbyVehicles', () => {
    it('queries nearby live vehicles based on geographic proximity', async () => {
      const res = await service.getNearbyVehicles({
        latitude: 28.6139,
        longitude: 77.209,
        radiusKm: 5,
        limit: 10,
      });

      expect(res).toHaveLength(1);
      expect(res[0].distance_km).toBe(1.25);
      expect(repo.findNearbyVehicles).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 28.6139,
          longitude: 77.209,
          radiusKm: 5,
        }),
      );
    });
  });
});
