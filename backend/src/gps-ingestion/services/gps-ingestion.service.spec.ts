import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { GpsIngestionRepository } from '../repositories/gps-ingestion.repository';
import { GpsIngestionService } from './gps-ingestion.service';

describe('GpsIngestionService', () => {
  let service: GpsIngestionService;
  let repo: jest.Mocked<GpsIngestionRepository>;
  let redis: jest.Mocked<RedisService>;

  const vehicleId = '11111111-1111-4111-a111-111111111111';
  const deviceId = '22222222-2222-4222-a222-222222222222';
  const tripId = '33333333-3333-4333-a333-333333333333';
  const pointId = '44444444-4444-4444-a444-444444444444';
  const deviceImei = '862000000000001';

  const mockDevice: any = {
    id: deviceId,
    device_imei: deviceImei,
    vehicle_id: vehicleId,
    is_active: true,
  };

  const mockPoint: any = {
    id: pointId,
    vehicle_id: vehicleId,
    trip_id: tripId,
    driver_id: null,
    latitude: 28.6139,
    longitude: 77.209,
    accuracy_meters: 5.0,
    speed_kmh: 42.5,
    heading_degrees: 180.0,
    altitude_meters: 216.0,
    odometer: 14500.5,
    recorded_at: new Date(),
    received_at: new Date(),
    source: 'GPS_DEVICE',
  };

  const mockEvent: any = {
    id: '55555555-5555-4555-a555-555555555555',
    device_id: deviceId,
    vehicle_id: vehicleId,
    event_type: 'OVERSPEED',
    payload: { speedKmh: 85, limit: 60 },
    recorded_at: new Date(),
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findDeviceByImei: jest.fn().mockImplementation((imei: string) => {
        if (imei === deviceImei) return Promise.resolve(mockDevice);
        return Promise.resolve(null);
      }),
      insertLocationPoint: jest.fn().mockResolvedValue(mockPoint),
      updateVehicleTelemetry: jest.fn().mockResolvedValue(undefined),
      updateTripTelemetry: jest.fn().mockResolvedValue(undefined),
      insertTrackingEvent: jest.fn().mockResolvedValue(mockEvent),
      findLocationHistory: jest.fn().mockResolvedValue({
        items: [mockPoint],
        total: 1,
      }),
    };

    const mockDb = {
      withTransaction: jest.fn().mockImplementation(async (callback) => {
        return callback({});
      }),
    };

    const mockRedis = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GpsIngestionService,
        { provide: GpsIngestionRepository, useValue: mockRepo },
        { provide: DatabaseService, useValue: mockDb },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<GpsIngestionService>(GpsIngestionService);
    repo = module.get(GpsIngestionRepository);
    redis = module.get(RedisService);
  });

  describe('ingestGpsPoint', () => {
    it('ingests single GPS fix and updates vehicle telemetry and Redis cache', async () => {
      const res = await service.ingestGpsPoint({
        deviceImei,
        latitude: 28.6139,
        longitude: 77.209,
        speedKmh: 42.5,
        tripId,
        recordedAt: new Date(),
      });

      expect(res.success).toBe(true);
      expect(res.id).toBe(pointId);
      expect(res.vehicleId).toBe(vehicleId);
      expect(repo.insertLocationPoint).toHaveBeenCalled();
      expect(repo.updateVehicleTelemetry).toHaveBeenCalled();
      expect(repo.updateTripTelemetry).toHaveBeenCalledWith(
        tripId,
        28.6139,
        77.209,
        expect.anything(),
      );
      expect(redis.set).toHaveBeenCalledWith(
        `tracking:vehicle:${vehicleId}`,
        expect.any(String),
        60,
      );
    });

    it('throws NotFoundException if device IMEI is not registered', async () => {
      await expect(
        service.ingestGpsPoint({
          deviceImei: '999999999999999',
          latitude: 28.6139,
          longitude: 77.209,
          speedKmh: 40,
          recordedAt: new Date(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if device has no assigned vehicle and vehicleId was omitted', async () => {
      (repo.findDeviceByImei as jest.Mock).mockResolvedValueOnce({
        id: deviceId,
        device_imei: '862000000000002',
        vehicle_id: null,
        is_active: true,
      });

      await expect(
        service.ingestGpsPoint({
          deviceImei: '862000000000002',
          latitude: 28.6139,
          longitude: 77.209,
          speedKmh: 40,
          recordedAt: new Date(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('batchIngestGps', () => {
    it('ingests batch of GPS points within single transaction', async () => {
      const res = await service.batchIngestGps({
        points: [
          {
            deviceImei,
            latitude: 28.6139,
            longitude: 77.209,
            speedKmh: 42.5,
            recordedAt: new Date(),
          },
          {
            deviceImei,
            latitude: 28.6145,
            longitude: 77.21,
            speedKmh: 45.0,
            recordedAt: new Date(),
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.processedCount).toBe(2);
      expect(repo.insertLocationPoint).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordTrackingEvent', () => {
    it('records telematics diagnostic event', async () => {
      const res = await service.recordTrackingEvent({
        deviceImei,
        eventType: 'OVERSPEED',
        payload: { speedKmh: 85 },
        recordedAt: new Date(),
      });

      expect(res.id).toBe(mockEvent.id);
      expect(res.event_type).toBe('OVERSPEED');
      expect(repo.insertTrackingEvent).toHaveBeenCalled();
    });

    it('throws NotFoundException if device does not exist', async () => {
      await expect(
        service.recordTrackingEvent({
          deviceImei: '999999999999999',
          eventType: 'OVERSPEED',
          recordedAt: new Date(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLocationHistory', () => {
    it('queries historical breadcrumbs for a vehicle', async () => {
      const res = await service.getLocationHistory(vehicleId, {
        limit: 10,
        offset: 0,
      });

      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(repo.findLocationHistory).toHaveBeenCalledWith(vehicleId, {
        limit: 10,
        offset: 0,
      });
    });
  });
});
