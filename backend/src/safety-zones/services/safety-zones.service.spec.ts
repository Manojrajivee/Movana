import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from '../../incidents/services/incidents.service';
import { RealTimeService } from '../../real-time/services/real-time.service';
import { SafetyZonesRepository } from '../repositories/safety-zones.repository';
import { SafetyZonesService } from './safety-zones.service';

describe('SafetyZonesService', () => {
  let service: SafetyZonesService;
  let repository: jest.Mocked<SafetyZonesRepository>;
  let incidentsService: jest.Mocked<IncidentsService>;
  let realTimeService: jest.Mocked<RealTimeService>;

  const geofenceId = '11111111-1111-4111-a111-111111111111';
  const vehicleId = '22222222-2222-4222-a222-222222222222';
  const tripId = '33333333-3333-4333-a333-333333333333';

  const mockGeofence = {
    id: geofenceId,
    name: 'Hospital Zone Alpha',
    description: 'Silence and low speed zone',
    latitude: 13.0827,
    longitude: 80.2707,
    radius_meters: 500,
    type: 'SAFETY_ZONE',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockConfig = {
    geofenceId,
    speedLimitKmh: 30,
    riskLevel: 'HIGH' as const,
    zoneCategory: 'HOSPITAL_ZONE' as const,
    cooldownMinutes: 15,
    autoReportIncident: true,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findGeofenceById: jest.fn().mockImplementation((id: string) => {
        if (id === geofenceId) return Promise.resolve(mockGeofence);
        return Promise.resolve(null);
      }),
      findActiveGeofences: jest.fn().mockResolvedValue([mockGeofence]),
      validateVehicleExists: jest.fn().mockResolvedValue(true),
      recordGeofenceEvent: jest.fn().mockResolvedValue(undefined),
      saveSafetyZoneConfig: jest.fn().mockImplementation((cfg) => Promise.resolve(cfg)),
      findSafetyZoneConfig: jest.fn().mockImplementation((id: string) => {
        if (id === geofenceId) return Promise.resolve(mockConfig);
        return Promise.resolve(null);
      }),
      findAllSafetyZoneConfigs: jest.fn().mockResolvedValue([mockConfig]),
      deleteSafetyZoneConfig: jest.fn().mockResolvedValue(true),
      checkAndSetAlertCooldown: jest.fn().mockResolvedValue({ isDuplicate: false }),
      recordRecentAlert: jest.fn().mockResolvedValue(undefined),
      getRecentAlerts: jest.fn().mockResolvedValue([]),
    };

    const mockIncidents = {
      reportIncident: jest.fn().mockResolvedValue({
        id: 'inc-999',
        incident_number: 'INC-20261028-TEST99',
      }),
    };

    const mockRealTime = {
      publishToRoom: jest.fn().mockResolvedValue({ deliveredLocally: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyZonesService,
        { provide: SafetyZonesRepository, useValue: mockRepo },
        { provide: IncidentsService, useValue: mockIncidents },
        { provide: RealTimeService, useValue: mockRealTime },
      ],
    }).compile();

    service = module.get<SafetyZonesService>(SafetyZonesService);
    repository = module.get(SafetyZonesRepository);
    incidentsService = module.get(IncidentsService);
    realTimeService = module.get(RealTimeService);
  });

  describe('createSafetyZone', () => {
    it('should throw NotFoundException if geofence does not exist in DB', async () => {
      repository.findGeofenceById.mockResolvedValueOnce(null);

      await expect(
        service.createSafetyZone({
          geofenceId: '00000000-0000-4000-a000-000000000000',
          speedLimitKmh: 30,
          riskLevel: 'HIGH',
          zoneCategory: 'SCHOOL_ZONE',
          cooldownMinutes: 15,
          autoReportIncident: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if policy is already configured for the geofence', async () => {
      await expect(
        service.createSafetyZone({
          geofenceId,
          speedLimitKmh: 30,
          riskLevel: 'HIGH',
          zoneCategory: 'HOSPITAL_ZONE',
          cooldownMinutes: 15,
          autoReportIncident: false,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if geofence is inactive in DB', async () => {
      repository.findGeofenceById.mockResolvedValueOnce({
        ...mockGeofence,
        status: 'INACTIVE',
      });

      await expect(
        service.createSafetyZone({
          geofenceId,
          speedLimitKmh: 30,
          riskLevel: 'HIGH',
          zoneCategory: 'SCHOOL_ZONE',
          cooldownMinutes: 15,
          autoReportIncident: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ServiceUnavailableException if Redis persistence fails', async () => {
      repository.findSafetyZoneConfig.mockResolvedValueOnce(null);
      repository.saveSafetyZoneConfig.mockRejectedValueOnce(new Error('Redis connection down'));

      await expect(
        service.createSafetyZone({
          geofenceId,
          speedLimitKmh: 30,
          riskLevel: 'HIGH',
          zoneCategory: 'SCHOOL_ZONE',
          cooldownMinutes: 15,
          autoReportIncident: false,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should create and persist safety zone policy when valid', async () => {
      repository.findSafetyZoneConfig.mockResolvedValueOnce(null);

      const result = await service.createSafetyZone({
        geofenceId,
        speedLimitKmh: 25,
        riskLevel: 'CRITICAL',
        zoneCategory: 'HOSPITAL_ZONE',
        cooldownMinutes: 10,
        autoReportIncident: true,
      });

      expect(result.geofenceId).toBe(geofenceId);
      expect(result.speedLimitKmh).toBe(25);
      expect(repository.saveSafetyZoneConfig).toHaveBeenCalled();
    });
  });

  describe('getSafetyZones', () => {
    it('should return merged safety zones and total count', async () => {
      const res = await service.getSafetyZones({ limit: 10, offset: 0 });
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.items[0].geofence?.name).toBe('Hospital Zone Alpha');
    });

    it('should filter by risk level', async () => {
      const res = await service.getSafetyZones({
        riskLevel: 'LOW',
        limit: 10,
        offset: 0,
      });
      expect(res.items).toHaveLength(0);
    });
  });

  describe('getSafetyZoneById', () => {
    it('should throw NotFoundException if geofence does not exist', async () => {
      repository.findGeofenceById.mockResolvedValueOnce(null);
      await expect(
        service.getSafetyZoneById('00000000-0000-4000-a000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return safety zone with geofence details', async () => {
      const zone = await service.getSafetyZoneById(geofenceId);
      expect(zone.geofenceId).toBe(geofenceId);
      expect(zone.speedLimitKmh).toBe(30);
      expect(zone.geofence).toBeDefined();
    });

    it('should return default fallback policy if no custom Redis config exists', async () => {
      repository.findSafetyZoneConfig.mockResolvedValueOnce(null);
      const zone = await service.getSafetyZoneById(geofenceId);
      expect(zone.geofenceId).toBe(geofenceId);
      expect(zone.speedLimitKmh).toBe(40); // default fallback
    });
  });

  describe('updateSafetyZone', () => {
    it('should update speed limit and persist in Redis', async () => {
      const updated = await service.updateSafetyZone(geofenceId, {
        speedLimitKmh: 20,
      });
      expect(updated.speedLimitKmh).toBe(20);
      expect(repository.saveSafetyZoneConfig).toHaveBeenCalledWith(
        expect.objectContaining({ speedLimitKmh: 20 }),
      );
    });
  });

  describe('deleteSafetyZone', () => {
    it('should throw NotFoundException if geofence does not exist', async () => {
      repository.findGeofenceById.mockResolvedValueOnce(null);
      await expect(
        service.deleteSafetyZone('00000000-0000-4000-a000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete configuration from Redis', async () => {
      const res = await service.deleteSafetyZone(geofenceId);
      expect(res).toBe(true);
      expect(repository.deleteSafetyZoneConfig).toHaveBeenCalledWith(geofenceId);
    });
  });

  describe('calculateDistanceMeters', () => {
    it('should return 0 for identical coordinates', () => {
      const dist = service.calculateDistanceMeters(13.0827, 80.2707, 13.0827, 80.2707);
      expect(dist).toBe(0);
    });

    it('should compute distance accurately within meters', () => {
      // Distance between Chennai Central (13.0827, 80.2707) and Egmore (13.0732, 80.2609) is ~1.46 km
      const dist = service.calculateDistanceMeters(13.0827, 80.2707, 13.0732, 80.2609);
      expect(dist).toBeGreaterThan(1400);
      expect(dist).toBeLessThan(1600);
    });
  });

  describe('evaluatePosition (Speed Restriction & Geofence Evaluation)', () => {
    it('should report no violations when vehicle is outside all safety zones', async () => {
      // 5 km away from mockGeofence
      const dto = {
        vehicleId,
        latitude: 13.15,
        longitude: 80.35,
        speedKmh: 80,
      };

      const result = await service.evaluatePosition(dto);
      expect(result.insideZoneCount).toBe(0);
      expect(result.violations).toHaveLength(0);
    });

    it('should report no violation when vehicle is inside zone but within speed limit', async () => {
      // Exact center of mockGeofence (speed limit is 30 km/h)
      const dto = {
        vehicleId,
        latitude: 13.0827,
        longitude: 80.2707,
        speedKmh: 25,
      };

      const result = await service.evaluatePosition(dto);
      expect(result.insideZoneCount).toBe(1);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect speed violation, calculate overspeed, and dispatch alert', async () => {
      // Inside zone at 55 km/h (limit is 30 km/h, overspeed = 25 km/h)
      const dto = {
        vehicleId,
        tripId,
        latitude: 13.0827,
        longitude: 80.2707,
        speedKmh: 55,
      };

      const result = await service.evaluatePosition(dto);
      expect(result.insideZoneCount).toBe(1);
      expect(result.violations).toHaveLength(1);

      const violation = result.violations[0];
      expect(violation.speedLimitKmh).toBe(30);
      expect(violation.actualSpeedKmh).toBe(55);
      expect(violation.overspeedKmh).toBe(25);
      expect(violation.alertDispatched).toBe(true);
      expect(violation.deduplicated).toBe(false);

      expect(realTimeService.publishToRoom).toHaveBeenCalledWith(
        'operations',
        'safety_zone_alert',
        expect.objectContaining({ vehicleId, overspeedKmh: 25 }),
      );
      expect(incidentsService.reportIncident).toHaveBeenCalled();
    });

    it('should suppress duplicate alert when Redis cooldown is active', async () => {
      repository.checkAndSetAlertCooldown.mockResolvedValueOnce({
        isDuplicate: true,
      });

      const dto = {
        vehicleId,
        latitude: 13.0827,
        longitude: 80.2707,
        speedKmh: 50,
      };

      const result = await service.evaluatePosition(dto);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].deduplicated).toBe(true);
      expect(result.violations[0].alertDispatched).toBe(false);

      // Should NOT dispatch real-time alert or create duplicate incident
      expect(realTimeService.publishToRoom).not.toHaveBeenCalled();
      expect(incidentsService.reportIncident).not.toHaveBeenCalled();
    });

    it('should gracefully degrade if Redis cooldown check fails', async () => {
      repository.checkAndSetAlertCooldown.mockRejectedValueOnce(
        new Error('Redis connection timed out'),
      );

      const dto = {
        vehicleId,
        latitude: 13.0827,
        longitude: 80.2707,
        speedKmh: 45,
      };

      const result = await service.evaluatePosition(dto);
      // Evaluates position and detects violation without crashing
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].actualSpeedKmh).toBe(45);
    });
  });
});
