import { Test, TestingModule } from '@nestjs/testing';
import { RouteVariantsController } from './route-variants.controller';
import { RouteVariantsService } from '../services/route-variants.service';

describe('RouteVariantsController', () => {
  let controller: RouteVariantsController;
  let service: jest.Mocked<RouteVariantsService>;

  const routeId = '11111111-1111-4111-a111-111111111111';
  const stopId = '22222222-2222-4222-a222-222222222222';

  const mockRouteStop: any = {
    id: '33333333-3333-4333-a333-333333333333',
    route_id: routeId,
    stop_id: stopId,
    sequence_number: 1,
    arrival_offset_minutes: 0,
    departure_offset_minutes: 5,
    distance_from_origin_km: 0,
    is_boarding_allowed: true,
    is_dropoff_allowed: true,
  };

  beforeEach(async () => {
    const mockService = {
      addRouteStop: jest.fn().mockResolvedValue(mockRouteStop),
      getStopsByRouteId: jest.fn().mockResolvedValue([mockRouteStop]),
      getAlignmentSummary: jest.fn().mockResolvedValue({
        routeId,
        totalStops: 1,
        maxDistanceFromOriginKm: 0,
        totalDurationOffsetMinutes: 5,
        boardingStopsCount: 1,
        dropoffStopsCount: 1,
        stops: [],
      }),
      reorderRouteStops: jest.fn().mockResolvedValue([mockRouteStop]),
      getRouteStop: jest.fn().mockResolvedValue(mockRouteStop),
      updateRouteStop: jest.fn().mockResolvedValue({
        ...mockRouteStop,
        departure_offset_minutes: 10,
      }),
      deleteRouteStop: jest.fn().mockResolvedValue(mockRouteStop),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RouteVariantsController],
      providers: [{ provide: RouteVariantsService, useValue: mockService }],
    }).compile();

    controller = module.get<RouteVariantsController>(RouteVariantsController);
    service = module.get(RouteVariantsService);
  });

  it('adds route stop', async () => {
    const body = {
      stopId,
      sequenceNumber: 1,
    };
    const result = await controller.addRouteStop(routeId, body);
    expect(result).toBeDefined();
    expect(service.addRouteStop).toHaveBeenCalledWith(routeId, expect.anything());
  });

  it('gets stops by routeId', async () => {
    const result = await controller.getStopsByRouteId(routeId);
    expect(result).toHaveLength(1);
    expect(service.getStopsByRouteId).toHaveBeenCalledWith(routeId);
  });

  it('gets alignment summary', async () => {
    const result = await controller.getAlignmentSummary(routeId);
    expect(result.totalStops).toBe(1);
    expect(service.getAlignmentSummary).toHaveBeenCalledWith(routeId);
  });

  it('reorders route stops', async () => {
    const body = {
      stops: [{ stopId, sequenceNumber: 1 }],
    };
    const result = await controller.reorderRouteStops(routeId, body);
    expect(result).toHaveLength(1);
    expect(service.reorderRouteStops).toHaveBeenCalledWith(routeId, expect.anything());
  });

  it('gets route stop by stopId', async () => {
    const result = await controller.getRouteStop(routeId, stopId);
    expect(result.stop_id).toBe(stopId);
    expect(service.getRouteStop).toHaveBeenCalledWith(routeId, stopId);
  });

  it('updates route stop', async () => {
    const body = { departureOffsetMinutes: 10 };
    const result = await controller.updateRouteStop(routeId, stopId, body);
    expect(result.departure_offset_minutes).toBe(10);
    expect(service.updateRouteStop).toHaveBeenCalledWith(routeId, stopId, expect.anything());
  });

  it('deletes route stop', async () => {
    const result = await controller.deleteRouteStop(routeId, stopId);
    expect(result.stop_id).toBe(stopId);
    expect(service.deleteRouteStop).toHaveBeenCalledWith(routeId, stopId);
  });
});
