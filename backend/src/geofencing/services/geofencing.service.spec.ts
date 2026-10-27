import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeofencingRepository } from '../repositories/geofencing.repository';
import { GeofencingService } from './geofencing.service';

describe('GeofencingService', () => {
  let service: GeofencingService;
  let repo: jest.Mocked<GeofencingRepository>;

  const geofenceId = '11111111-1111-4111-a111-111111111111';
  const vehicleId = '22222222-2222-4222-a222-222222222222';
  const tripId = '33333333-3333-4333-a333-333333333333';

  const mockGeofence: any = {
    id: geofenceId,
    name: 'ISBT Kashmiri Gate Terminal',
    description: 'Central transit terminal and depot',
    latitude: 28.6675,
    longitude: 77.2285,
    radius_meters: 500,
    type: 'TERMINAL',
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockGeofenceEvent: any = {
    id: '44444444-4444-4444-a444-444444444444',
    geofence_id: geofenceId,
    vehicle_id: vehicleId,
    trip_id: tripId,
    event_type: 'ENTER',
    latitude: 28.6675,
    longitude: 77.2285,
    occurred_at: new Date(),
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      createGeofence: jest.fn().mockResolvedValue(mockGeofence),
      findByName: jest.fn().mockImplementation((name: string) => {
        if (name === mockGeofence.name) return Promise.resolve(mockGeofence);
        return Promise.resolve(null);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === geofenceId) return Promise.resolve(mockGeofence);
        return Promise.resolve(null);
      }),
      findAll: jest.fn().mockResolvedValue({
        items: [mockGeofence],
        total: 1,
      }),
      findActiveGeofences: jest.fn().mockResolvedValue([mockGeofence]),
      updateGeofence: jest.fn().mockResolvedValue({
        ...mockGeofence,
        radius_meters: 600,
      }),
      deactivateGeofence: jest.fn().mockResolvedValue({
        ...mockGeofence,
        status: 'INACTIVE',
      }),
      insertGeofenceEvent: jest.fn().mockResolvedValue(mockGeofenceEvent),
      findLatestEventForVehicleAndGeofence: jest.fn().mockResolvedValue(null),
      findGeofenceEvents: jest.fn().mockResolvedValue({
        items: [mockGeofenceEvent],
        total: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeofencingService, { provide: GeofencingRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<GeofencingService>(GeofencingService);
    repo = module.get(GeofencingRepository);
  });

  describe('createGeofence', () => {
    it('creates geofence perimeter', async () => {
      const res = await service.createGeofence({
        name: 'New Anand Vihar Terminal',
        latitude: 28.6469,
        longitude: 77.316,
        radiusMeters: 400,
      });

      expect(res).toBeDefined();
      expect(repo.createGeofence).toHaveBeenCalled();
    });

    it('throws ConflictException if geofence name already exists', async () => {
      await expect(
        service.createGeofence({
          name: mockGeofence.name,
          latitude: 28.6675,
          longitude: 77.2285,
          radiusMeters: 500,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getGeofences', () => {
    it('queries geofences with filters', async () => {
      const res = await service.getGeofences({ limit: 10, offset: 0 });
      expect(res.items).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalled();
    });
  });

  describe('getGeofenceById', () => {
    it('returns geofence details by ID', async () => {
      const res = await service.getGeofenceById(geofenceId);
      expect(res.id).toBe(geofenceId);
      expect(repo.findById).toHaveBeenCalledWith(geofenceId);
    });

    it('throws NotFoundException if geofence does not exist', async () => {
      await expect(service.getGeofenceById('99999999-9999-4999-a999-999999999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateGeofence', () => {
    it('updates geofence radius', async () => {
      const res = await service.updateGeofence(geofenceId, { radiusMeters: 600 });
      expect(res.radius_meters).toBe(600);
      expect(repo.updateGeofence).toHaveBeenCalled();
    });

    it('throws ConflictException if updated name collides with another geofence', async () => {
      (repo.findByName as jest.Mock).mockResolvedValueOnce({
        id: '99999999-9999-4999-a999-999999999999',
        name: 'Existing Terminal Name',
      });

      await expect(
        service.updateGeofence(geofenceId, { name: 'Existing Terminal Name' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteGeofence', () => {
    it('deactivates geofence perimeter', async () => {
      const res = await service.deleteGeofence(geofenceId);
      expect(res.status).toBe('INACTIVE');
      expect(repo.deactivateGeofence).toHaveBeenCalledWith(geofenceId);
    });
  });

  describe('evaluateVehiclePosition', () => {
    it('detects and emits ENTER transition when vehicle enters perimeter', async () => {
      // Vehicle is at exact geofence center (distance 0m <= 500m)
      const res = await service.evaluateVehiclePosition({
        vehicleId,
        latitude: mockGeofence.latitude,
        longitude: mockGeofence.longitude,
        tripId,
      });

      expect(res.evaluatedCount).toBe(1);
      expect(res.insideGeofenceIds).toContain(geofenceId);
      expect(res.transitionEvents).toHaveLength(1);
      expect(res.transitionEvents[0].event_type).toBe('ENTER');
      expect(repo.insertGeofenceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          geofenceId,
          vehicleId,
          eventType: 'ENTER',
        }),
      );
    });

    it('detects and emits EXIT transition when vehicle leaves perimeter', async () => {
      // Last event was ENTER
      (repo.findLatestEventForVehicleAndGeofence as jest.Mock).mockResolvedValueOnce({
        ...mockGeofenceEvent,
        event_type: 'ENTER',
      });

      (repo.insertGeofenceEvent as jest.Mock).mockResolvedValueOnce({
        ...mockGeofenceEvent,
        event_type: 'EXIT',
      });

      // Vehicle is 10 km away (outside 500m radius)
      const res = await service.evaluateVehiclePosition({
        vehicleId,
        latitude: 28.75, // Far away
        longitude: 77.35,
        tripId,
      });

      expect(res.insideGeofenceIds).not.toContain(geofenceId);
      expect(res.transitionEvents).toHaveLength(1);
      expect(res.transitionEvents[0].event_type).toBe('EXIT');
      expect(repo.insertGeofenceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          geofenceId,
          vehicleId,
          eventType: 'EXIT',
        }),
      );
    });
  });

  describe('recordGeofenceEvent', () => {
    it('records explicit transition event', async () => {
      const res = await service.recordGeofenceEvent({
        geofenceId,
        vehicleId,
        eventType: 'ENTER',
        latitude: 28.6675,
        longitude: 77.2285,
      });

      expect(res).toBeDefined();
      expect(res.event_type).toBe('ENTER');
      expect(repo.insertGeofenceEvent).toHaveBeenCalled();
    });

    it('throws NotFoundException if geofence does not exist', async () => {
      await expect(
        service.recordGeofenceEvent({
          geofenceId: '99999999-9999-4999-a999-999999999999',
          vehicleId,
          eventType: 'ENTER',
          latitude: 28.6675,
          longitude: 77.2285,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getGeofenceEvents', () => {
    it('queries transition events history', async () => {
      const res = await service.getGeofenceEvents({ limit: 10, offset: 0 });
      expect(res.items).toHaveLength(1);
      expect(repo.findGeofenceEvents).toHaveBeenCalled();
    });
  });
});
