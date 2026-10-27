import { Test, TestingModule } from '@nestjs/testing';
import { GeofencingController } from './geofencing.controller';
import { GeofencingService } from '../services/geofencing.service';

describe('GeofencingController', () => {
  let controller: GeofencingController;
  let service: jest.Mocked<GeofencingService>;

  const geofenceId = '11111111-1111-4111-a111-111111111111';
  const vehicleId = '22222222-2222-4222-a222-222222222222';

  const mockGeofence: any = {
    id: geofenceId,
    name: 'ISBT Kashmiri Gate Terminal',
    latitude: 28.6675,
    longitude: 77.2285,
    radius_meters: 500,
    type: 'TERMINAL',
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const mockService = {
      createGeofence: jest.fn().mockResolvedValue(mockGeofence),
      getGeofences: jest.fn().mockResolvedValue({ items: [mockGeofence], total: 1 }),
      getGeofenceEvents: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      recordGeofenceEvent: jest.fn().mockResolvedValue({
        id: '33333333-3333-4333-a333-333333333333',
        geofence_id: geofenceId,
        vehicle_id: vehicleId,
        event_type: 'ENTER',
      }),
      evaluateVehiclePosition: jest.fn().mockResolvedValue({
        vehicleId,
        evaluatedCount: 1,
        insideGeofenceIds: [geofenceId],
        transitionEvents: [],
      }),
      getGeofenceById: jest.fn().mockResolvedValue(mockGeofence),
      updateGeofence: jest.fn().mockResolvedValue({ ...mockGeofence, radius_meters: 600 }),
      deleteGeofence: jest.fn().mockResolvedValue({ ...mockGeofence, status: 'INACTIVE' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeofencingController],
      providers: [{ provide: GeofencingService, useValue: mockService }],
    }).compile();

    controller = module.get<GeofencingController>(GeofencingController);
    service = module.get(GeofencingService);
  });

  it('creates geofence', async () => {
    const body = {
      name: 'ISBT Kashmiri Gate Terminal',
      latitude: 28.6675,
      longitude: 77.2285,
      radiusMeters: 500,
    };
    const res = await controller.createGeofence(body);
    expect(res.id).toBe(geofenceId);
    expect(service.createGeofence).toHaveBeenCalledWith(body);
  });

  it('queries geofences', async () => {
    const res = await controller.getGeofences({ limit: 10, offset: 0 });
    expect(res.items).toHaveLength(1);
    expect(service.getGeofences).toHaveBeenCalled();
  });

  it('queries transition events', async () => {
    const res = await controller.getGeofenceEvents({ limit: 10, offset: 0 });
    expect(res.items).toHaveLength(0);
    expect(service.getGeofenceEvents).toHaveBeenCalled();
  });

  it('records geofence transition event', async () => {
    const body = {
      geofenceId,
      vehicleId,
      eventType: 'ENTER' as const,
      latitude: 28.6675,
      longitude: 77.2285,
    };
    const res = await controller.recordGeofenceEvent(body);
    expect(res.event_type).toBe('ENTER');
    expect(service.recordGeofenceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ENTER' }),
    );
  });

  it('evaluates vehicle position', async () => {
    const body = {
      vehicleId,
      latitude: 28.6675,
      longitude: 77.2285,
    };
    const res = await controller.evaluateVehiclePosition(body);
    expect(res.insideGeofenceIds).toContain(geofenceId);
    expect(service.evaluateVehiclePosition).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId }),
    );
  });

  it('gets geofence by ID', async () => {
    const res = await controller.getGeofenceById(geofenceId);
    expect(res.id).toBe(geofenceId);
    expect(service.getGeofenceById).toHaveBeenCalledWith(geofenceId);
  });

  it('updates geofence', async () => {
    const body = { radiusMeters: 600 };
    const res = await controller.updateGeofence(geofenceId, body);
    expect(res.radius_meters).toBe(600);
    expect(service.updateGeofence).toHaveBeenCalledWith(geofenceId, body);
  });

  it('deactivates geofence', async () => {
    const res = await controller.deleteGeofence(geofenceId);
    expect(res.status).toBe('INACTIVE');
    expect(service.deleteGeofence).toHaveBeenCalledWith(geofenceId);
  });
});
