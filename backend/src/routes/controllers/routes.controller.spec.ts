import { Test, TestingModule } from '@nestjs/testing';
import { RoutesController } from './routes.controller';
import { RoutesService } from '../services/routes.service';

describe('RoutesController', () => {
  let controller: RoutesController;
  let service: jest.Mocked<RoutesService>;

  const routeId = '33333333-3333-4333-a333-333333333333';
  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destinationStopId = '22222222-2222-4222-a222-222222222222';

  const mockRoute: any = {
    id: routeId,
    route_code: 'RT-101',
    name: 'Airport Express Corridor',
    description: 'High-speed corridor',
    origin_stop_id: originStopId,
    destination_stop_id: destinationStopId,
    distance_km: 24.5,
    estimated_duration_minutes: 45,
    status: 'ACTIVE',
  };

  const mockVersion: any = {
    id: '44444444-4444-4444-a444-444444444444',
    route_id: routeId,
    version_number: 1,
    is_current: true,
  };

  beforeEach(async () => {
    const mockService = {
      createRoute: jest.fn().mockResolvedValue(mockRoute),
      getRoutes: jest.fn().mockResolvedValue({ items: [mockRoute], total: 1 }),
      getRouteById: jest.fn().mockResolvedValue(mockRoute),
      updateRoute: jest.fn().mockResolvedValue({ ...mockRoute, name: 'Updated Route' }),
      updateRouteStatus: jest.fn().mockResolvedValue({ ...mockRoute, status: 'SUSPENDED' }),
      deleteRoute: jest.fn().mockResolvedValue({ ...mockRoute, status: 'INACTIVE' }),
      createRouteVersion: jest.fn().mockResolvedValue(mockVersion),
      getRouteVersions: jest.fn().mockResolvedValue([mockVersion]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoutesController],
      providers: [{ provide: RoutesService, useValue: mockService }],
    }).compile();

    controller = module.get<RoutesController>(RoutesController);
    service = module.get(RoutesService);
  });

  it('creates route', async () => {
    const body = {
      routeCode: 'RT-101',
      name: 'Airport Express Corridor',
      originStopId,
      destinationStopId,
      distanceKm: 24.5,
      estimatedDurationMinutes: 45,
    };
    const result = await controller.createRoute(body);
    expect(result).toBeDefined();
    expect(service.createRoute).toHaveBeenCalled();
  });

  it('lists routes', async () => {
    const result = await controller.getRoutes({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(service.getRoutes).toHaveBeenCalled();
  });

  it('gets route by ID', async () => {
    const result = await controller.getRouteById(routeId);
    expect(result.id).toBe(routeId);
    expect(service.getRouteById).toHaveBeenCalledWith(routeId);
  });

  it('updates route', async () => {
    const body = { name: 'Updated Route' };
    const result = await controller.updateRoute(routeId, body);
    expect(result.name).toBe('Updated Route');
    expect(service.updateRoute).toHaveBeenCalledWith(routeId, body);
  });

  it('updates route status', async () => {
    const body = { status: 'SUSPENDED' as const };
    const result = await controller.updateRouteStatus(routeId, body);
    expect(result.status).toBe('SUSPENDED');
    expect(service.updateRouteStatus).toHaveBeenCalledWith(routeId, body);
  });

  it('deletes route', async () => {
    const result = await controller.deleteRoute(routeId);
    expect(result.status).toBe('INACTIVE');
    expect(service.deleteRoute).toHaveBeenCalledWith(routeId);
  });

  it('creates route version', async () => {
    const body = { changeNotes: 'Geometry alignment revision' };
    const result = await controller.createRouteVersion(routeId, body);
    expect(result.version_number).toBe(1);
    expect(service.createRouteVersion).toHaveBeenCalledWith(routeId, body);
  });

  it('lists route versions', async () => {
    const result = await controller.getRouteVersions(routeId);
    expect(result).toHaveLength(1);
    expect(service.getRouteVersions).toHaveBeenCalledWith(routeId);
  });
});
