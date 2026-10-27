import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { JourneyPlannerRepository } from '../src/journey-planner/repositories/journey-planner.repository';

describe('Journey Planner (e2e)', () => {
  let app: INestApplication;

  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destStopId = '22222222-2222-4222-a222-222222222222';
  const transferStopId = '33333333-3333-4333-a333-333333333333';

  const mockOriginStop = {
    id: originStopId,
    stop_code: 'ISBT-01',
    name: 'Kashmere Gate ISBT',
    city: 'Delhi',
    latitude: 28.6678,
    longitude: 77.2285,
  };

  const mockDestStop = {
    id: destStopId,
    stop_code: 'CP-01',
    name: 'Connaught Place',
    city: 'Delhi',
    latitude: 28.6315,
    longitude: 77.2167,
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

  const mockJourneyPlannerRepo = {
    findStopById: jest.fn().mockImplementation((id: string) => {
      if (id === originStopId) return Promise.resolve(mockOriginStop);
      if (id === destStopId) return Promise.resolve(mockDestStop);
      return Promise.resolve(null);
    }),
    findNearestStop: jest.fn().mockImplementation((lat: number) => {
      if (lat > 28.65) return Promise.resolve(mockOriginStop);
      return Promise.resolve(mockDestStop);
    }),
    findDirectRoutes: jest.fn().mockResolvedValue([
      {
        route_id: 'r-1',
        route_code: '101',
        route_name: 'ISBT to CP Express',
        origin_sequence: 1,
        destination_sequence: 5,
        intermediate_stops_count: 4,
        estimated_duration_minutes: 25,
        distance_km: 8.5,
      },
    ]),
    findTransferRoutes: jest.fn().mockResolvedValue([
      {
        leg1_route_id: 'r-2',
        leg1_route_code: '202',
        leg1_route_name: 'ISBT to NDLS',
        leg1_origin_seq: 1,
        leg1_dest_seq: 3,
        transfer_stop_id: transferStopId,
        transfer_stop_name: 'New Delhi Railway Station',
        transfer_stop_code: 'NDLS-01',
        transfer_latitude: 28.6431,
        transfer_longitude: 77.2223,
        leg2_route_id: 'r-3',
        leg2_route_code: '303',
        leg2_route_name: 'NDLS to CP',
        leg2_origin_seq: 1,
        leg2_dest_seq: 2,
      },
    ]),
    findUpcomingTripsForRoute: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(JourneyPlannerRepository)
      .useValue(mockJourneyPlannerRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/journey-planner/plan', () => {
    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/journey-planner/plan').send({});

      expect(res.status).toBe(400);
    });

    it('should plan journey between valid stop IDs with 200 OK', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/journey-planner/plan').send({
        originStopId,
        destinationStopId: destStopId,
        maxTransfers: 1,
      });

      expect(res.status).toBe(200);
      expect(res.body.origin.id).toBe(originStopId);
      expect(res.body.destination.id).toBe(destStopId);
      expect(res.body.itinerariesCount).toBeGreaterThanOrEqual(1);
      expect(res.body.itineraries[0].legs[0].routeCode).toBe('101');
    });

    it('should plan journey between GPS coordinates with 200 OK', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/journey-planner/plan').send({
        originLatitude: 28.6678,
        originLongitude: 77.2285,
        destinationLatitude: 28.6315,
        destinationLongitude: 77.2167,
      });

      expect(res.status).toBe(200);
      expect(res.body.itinerariesCount).toBeDefined();
    });
  });

  describe('GET /api/v1/journey-planner/direct', () => {
    it('should reject request missing query parameters with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/journey-planner/direct')
        .query({});

      expect(res.status).toBe(400);
    });

    it('should return direct route connections with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/journey-planner/direct').query({
        originStopId,
        destinationStopId: destStopId,
        limit: 10,
      });

      expect(res.status).toBe(200);
      expect(res.body.directRoutes).toHaveLength(1);
      expect(res.body.directRoutes[0].route_code).toBe('101');
    });
  });

  describe('GET /api/v1/journey-planner/transfers', () => {
    it('should reject invalid UUID query parameter with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/journey-planner/transfers')
        .query({
          originStopId: 'not-a-uuid',
          destinationStopId: destStopId,
        });

      expect(res.status).toBe(400);
    });

    it('should return transfer route connections with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/journey-planner/transfers')
        .query({
          originStopId,
          destinationStopId: destStopId,
          limit: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.transferRoutes).toHaveLength(1);
      expect(res.body.transferRoutes[0].transfer_stop_name).toBe('New Delhi Railway Station');
    });
  });
});
