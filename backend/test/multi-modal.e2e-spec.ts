import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { MultiModalRepository } from '../src/multi-modal/repositories/multi-modal.repository';

describe('Multi-Modal Transport (e2e)', () => {
  let app: INestApplication;

  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destStopId = '22222222-2222-4222-a222-222222222222';
  const hubStopId = '33333333-3333-4333-a333-333333333333';

  const mockOrigin = {
    id: originStopId,
    stop_code: 'ISBT-01',
    name: 'Kashmere Gate ISBT',
    city: 'Delhi',
    latitude: 28.6678,
    longitude: 77.2285,
    status: 'ACTIVE',
  };

  const mockDest = {
    id: destStopId,
    stop_code: 'CP-01',
    name: 'Connaught Place',
    city: 'Delhi',
    latitude: 28.6315,
    longitude: 77.2167,
    status: 'ACTIVE',
  };

  const mockHub = {
    id: hubStopId,
    stop_code: 'NDLS-01',
    name: 'New Delhi Railway Station Hub',
    city: 'Delhi',
    latitude: 28.6431,
    longitude: 77.2223,
    status: 'ACTIVE',
  };

  const mockDatabaseService = {
    verifyIdentity: jest.fn().mockResolvedValue({
      database_name: 'movana',
      database_user: 'movana_app',
    }),
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 1,
      database: 'movana',
      user: 'movana_app',
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  const mockMultiModalRepo = {
    findStopById: jest.fn().mockImplementation((id: string) => {
      if (id === originStopId) return Promise.resolve(mockOrigin);
      if (id === destStopId) return Promise.resolve(mockDest);
      if (id === hubStopId) return Promise.resolve(mockHub);
      return Promise.resolve(null);
    }),
    findInterchangeHubs: jest.fn().mockResolvedValue([
      {
        hub_stop_id: hubStopId,
        hub_stop_code: 'NDLS-01',
        hub_stop_name: 'New Delhi Railway Station Hub',
        city: 'Delhi',
        latitude: 28.6431,
        longitude: 77.2223,
        connected_routes_count: 4,
        connected_routes: ['101', '202'],
      },
    ]),
    findHubConnections: jest.fn().mockResolvedValue([
      {
        route_id: 'r1',
        route_code: '101',
        route_name: 'Airport Express',
        sequence_number: 1,
        origin_stop_name: 'New Delhi Railway Station Hub',
        destination_stop_name: 'IGI Airport T3',
        vehicle_type_name: 'Electric AC Express',
      },
    ]),
    findDirectRouteOption: jest.fn().mockResolvedValue({
      route_id: 'r1',
      route_code: '101',
      route_name: 'Direct BRT',
      orig_seq: 1,
      dest_seq: 5,
      stops_count: 4,
      distance_km: 10.5,
      duration_minutes: 25,
    }),
    findConnectingHub: jest.fn().mockResolvedValue(null),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(MultiModalRepository)
      .useValue(mockMultiModalRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/multi-modal/modes', () => {
    it('should return supported intermodal transit modes with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/multi-modal/modes');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
      expect(res.body[0].averageSpeedKmh).toBeDefined();
    });
  });

  describe('GET /api/v1/multi-modal/hubs', () => {
    it('should return interchange hubs list with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/multi-modal/hubs')
        .query({ limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].hub_stop_name).toBe('New Delhi Railway Station Hub');
    });
  });

  describe('POST /api/v1/multi-modal/plan', () => {
    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/multi-modal/plan').send({});

      expect(res.status).toBe(400);
    });

    it('should plan multi-modal journey with 200 OK', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/multi-modal/plan').send({
        originStopId,
        destinationStopId: destStopId,
        maxWalkingMeters: 600,
      });

      expect(res.status).toBe(200);
      expect(res.body.itineraries).toHaveLength(1);
      expect(res.body.itineraries[0].legs[0].mode).toBe('BUS_RAPID_TRANSIT');
    });
  });

  describe('GET /api/v1/multi-modal/hubs/:stopId/connections', () => {
    it('should reject invalid UUID with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/multi-modal/hubs/invalid-uuid/connections',
      );

      expect(res.status).toBe(400);
    });

    it('should return hub connections with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/multi-modal/hubs/${hubStopId}/connections`,
      );

      expect(res.status).toBe(200);
      expect(res.body.hub.name).toBe('New Delhi Railway Station Hub');
      expect(res.body.routes).toHaveLength(1);
    });
  });
});
