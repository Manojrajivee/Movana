import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RouteOptimizationRepository } from '../src/route-optimization/repositories/route-optimization.repository';

describe('Route Optimization (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;

  const testRouteId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockRoute = {
    id: testRouteId,
    route_code: 'DEL-JPR-101',
    name: 'Delhi to Jaipur High Speed',
    distance_km: 260.0,
    estimated_duration_minutes: 300,
    status: 'ACTIVE',
  };

  const mockStops = [
    {
      stop_id: 's1',
      stop_code: 'DEL-01',
      stop_name: 'Delhi Kashmiri Gate',
      sequence_number: 1,
      latitude: 28.6678,
      longitude: 77.2285,
    },
    {
      stop_id: 's2',
      stop_code: 'GGN-01',
      stop_name: 'Gurugram IFFCO Chowk',
      sequence_number: 2,
      latitude: 28.4721,
      longitude: 77.0725,
    },
  ];

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

  const mockRouteOptRepo = {
    findRouteById: jest.fn().mockImplementation((id: string) => {
      if (id === testRouteId) return Promise.resolve(mockRoute);
      return Promise.resolve(null);
    }),
    findRouteStops: jest.fn().mockResolvedValue(mockStops),
    getRouteHourlyDelay: jest.fn().mockResolvedValue([
      {
        hour_of_day: 10,
        trips_count: 15,
        avg_delay_minutes: 3.2,
        max_delay_minutes: 8,
        on_time_percentage: 93.3,
      },
    ]),
    getNetworkCongestionHotspots: jest.fn().mockResolvedValue([
      {
        route_id: testRouteId,
        route_code: 'DEL-JPR-101',
        from_stop_id: 's1',
        from_stop_name: 'Delhi Kashmiri Gate',
        to_stop_id: 's2',
        to_stop_name: 'Gurugram IFFCO Chowk',
        sample_size: 40,
        avg_delay_minutes: 14.5,
        congestion_level: 'HIGH',
      },
    ]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RouteOptimizationRepository)
      .useValue(mockRouteOptRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: '11111111-1111-4111-a111-111111111111',
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
    });

    passengerToken = jwtService.sign({
      sub: '22222222-2222-4222-a222-222222222222',
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/route-optimization/routes/:routeId/analytics', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/route-optimization/routes/${testRouteId}/analytics`,
      );

      expect(res.status).toBe(401);
    });

    it('should reject passenger with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/route-optimization/routes/${testRouteId}/analytics`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid routeId UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/route-optimization/routes/invalid-uuid/analytics')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(400);
    });

    it('should return route analytics for operator with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/route-optimization/routes/${testRouteId}/analytics`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.routeId).toBe(testRouteId);
      expect(res.body.segments).toHaveLength(1);
      expect(res.body.efficiencyScore).toBeDefined();
    });
  });

  describe('GET /api/v1/route-optimization/routes/:routeId/recommendations', () => {
    it('should return departure recommendations with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/route-optimization/routes/${testRouteId}/recommendations`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.routeId).toBe(testRouteId);
      expect(res.body.bestDepartureWindows).toHaveLength(1);
    });
  });

  describe('GET /api/v1/route-optimization/network/congestion-hotspots', () => {
    it('should return network-wide congestion hotspots with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/route-optimization/network/congestion-hotspots')
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].congestion_level).toBe('HIGH');
    });
  });
});
