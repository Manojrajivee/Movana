import { Test, TestingModule } from '@nestjs/testing';
import { SafetyZonesController } from './safety-zones.controller';
import { SafetyZonesService } from '../services/safety-zones.service';

describe('SafetyZonesController', () => {
  let controller: SafetyZonesController;
  let service: jest.Mocked<SafetyZonesService>;

  const geofenceId = '11111111-1111-4111-a111-111111111111';
  const vehicleId = '22222222-2222-4222-a222-222222222222';

  const mockUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'safety@example.com',
    roles: ['SAFETY_OFFICER'],
  };

  const mockSafetyZone = {
    geofenceId,
    speedLimitKmh: 30,
    riskLevel: 'HIGH' as const,
    zoneCategory: 'SCHOOL_ZONE' as const,
    cooldownMinutes: 15,
    autoReportIncident: true,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    geofence: {
      id: geofenceId,
      name: 'St. Mary School Zone',
      description: 'Pedestrian heavy zone',
      latitude: 13.0827,
      longitude: 80.2707,
      radius_meters: 250,
      type: 'SAFETY_ZONE',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  beforeEach(async () => {
    const mockService = {
      createSafetyZone: jest.fn().mockResolvedValue(mockSafetyZone),
      getSafetyZones: jest.fn().mockResolvedValue({ items: [mockSafetyZone], total: 1 }),
      getRecentAlerts: jest.fn().mockResolvedValue([]),
      evaluatePosition: jest.fn().mockResolvedValue({
        vehicleId,
        actualSpeedKmh: 45,
        evaluatedCount: 1,
        insideZoneCount: 1,
        violations: [],
      }),
      getSafetyZoneById: jest.fn().mockResolvedValue(mockSafetyZone),
      updateSafetyZone: jest.fn().mockResolvedValue(mockSafetyZone),
      deleteSafetyZone: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SafetyZonesController],
      providers: [{ provide: SafetyZonesService, useValue: mockService }],
    }).compile();

    controller = module.get<SafetyZonesController>(SafetyZonesController);
    service = module.get(SafetyZonesService);
  });

  describe('createSafetyZone', () => {
    it('should validate DTO and delegate to service.createSafetyZone', async () => {
      const dto = {
        geofenceId,
        speedLimitKmh: 30,
        riskLevel: 'HIGH',
        zoneCategory: 'SCHOOL_ZONE',
      };

      const result = await controller.createSafetyZone(dto, mockUser);
      expect(result).toEqual(mockSafetyZone);
      expect(service.createSafetyZone).toHaveBeenCalledWith(
        expect.objectContaining({ geofenceId, speedLimitKmh: 30 }),
        mockUser,
      );
    });
  });

  describe('getSafetyZones', () => {
    it('should parse query parameters and return safety zones list', async () => {
      const result = await controller.getSafetyZones({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(service.getSafetyZones).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });
  });

  describe('getRecentAlerts', () => {
    it('should return recent alerts with default or parsed limit', async () => {
      await controller.getRecentAlerts('20');
      expect(service.getRecentAlerts).toHaveBeenCalledWith(20);
    });
  });

  describe('evaluatePosition', () => {
    it('should validate evaluation payload and delegate to service', async () => {
      const dto = {
        vehicleId,
        latitude: 13.0827,
        longitude: 80.2707,
        speedKmh: 45,
      };

      const result = await controller.evaluatePosition(dto, mockUser);
      expect(result.vehicleId).toBe(vehicleId);
      expect(service.evaluatePosition).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleId, speedKmh: 45 }),
        mockUser,
      );
    });
  });

  describe('getSafetyZoneById', () => {
    it('should retrieve single safety zone by geofence ID', async () => {
      const result = await controller.getSafetyZoneById(geofenceId);
      expect(result.geofenceId).toBe(geofenceId);
      expect(service.getSafetyZoneById).toHaveBeenCalledWith(geofenceId);
    });
  });

  describe('updateSafetyZone', () => {
    it('should validate update payload and call service.updateSafetyZone', async () => {
      const dto = { speedLimitKmh: 25 };
      const result = await controller.updateSafetyZone(geofenceId, dto, mockUser);
      expect(result).toEqual(mockSafetyZone);
      expect(service.updateSafetyZone).toHaveBeenCalledWith(
        geofenceId,
        expect.objectContaining({ speedLimitKmh: 25 }),
        mockUser,
      );
    });
  });

  describe('deleteSafetyZone', () => {
    it('should call service.deleteSafetyZone and return success', async () => {
      const result = await controller.deleteSafetyZone(geofenceId, mockUser);
      expect(result).toEqual({ success: true });
      expect(service.deleteSafetyZone).toHaveBeenCalledWith(geofenceId, mockUser);
    });
  });
});
