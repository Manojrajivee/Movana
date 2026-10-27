import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { TripProgressRepository } from '../src/trip-progress/repositories/trip-progress.repository';

describe('Trip Progress (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let driverToken: string;
  let passengerToken: string;

  const driverUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';

  const testTripId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockTripDetail = {
    id: testTripId,
    trip_number: 'TRIP-DEL-JPR-201',
    route_id: 'route-1',
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur High Speed',
    distance_km: 260.0,
    estimated_duration_minutes: 240,
    vehicle_id: 'veh-1',
    vehicle_code: 'BUS-DEL-101',
    registration_number: 'DL-01-A-1000',
    primary_driver_id: 'driver-1',
    driver_name: 'Rajesh Sharma',
    status: 'IN_TRANSIT',
    current_stop_id: 'stop-1',
    current_stop_name: 'Kashmere Gate ISBT',
    current_latitude: 28.6675,
    current_longitude: 77.2285,
    delay_minutes: 2,
    scheduled_departure_at: new Date('2026-10-28T08:00:00Z'),
    scheduled_arrival_at: new Date('2026-10-28T12:00:00Z'),
    actual_departure_at: new Date('2026-10-28T08:02:00Z'),
    actual_arrival_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockStops = [
    {
      id: 'ts-1',
      trip_id: testTripId,
      stop_id: 'stop-1',
      sequence_number: 1,
      scheduled_arrival_at: new Date('2026-10-28T08:00:00Z'),
      scheduled_departure_at: new Date('2026-10-28T08:10:00Z'),
      actual_arrival_at: new Date('2026-10-28T08:00:00Z'),
      actual_departure_at: new Date('2026-10-28T08:05:00Z'),
      delay_minutes: 0,
      status: 'DEPARTED',
      stop_code: 'ISBT-KASHMERE',
      stop_name: 'Kashmere Gate ISBT',
      latitude: 28.6675,
      longitude: 77.2285,
    },
    {
      id: 'ts-2',
      trip_id: testTripId,
      stop_id: 'stop-2',
      sequence_number: 2,
      scheduled_arrival_at: new Date('2026-10-28T12:00:00Z'),
      scheduled_departure_at: new Date('2026-10-28T12:00:00Z'),
      actual_arrival_at: null,
      actual_departure_at: null,
      delay_minutes: 0,
      status: 'PENDING',
      stop_code: 'JPR-SINDHI',
      stop_name: 'Sindhi Camp ISBT',
      latitude: 26.9239,
      longitude: 75.8016,
    },
  ];

  const mockMilestone = {
    id: 'milestone-1',
    trip_id: testTripId,
    vehicle_id: 'veh-1',
    driver_id: 'driver-1',
    event_type: 'DEPARTED_TERMINAL',
    event_data: { passengerCount: 42 },
    occurred_at: new Date(),
    created_at: new Date(),
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

  const mockTripProgressRepository = {
    findTripProgressDetail: jest.fn().mockResolvedValue(mockTripDetail),
    findTripStops: jest.fn().mockResolvedValue(mockStops),
    recordMilestoneEvent: jest.fn().mockResolvedValue(mockMilestone),
    findTripMilestones: jest.fn().mockResolvedValue([mockMilestone]),
    countTripMilestones: jest.fn().mockResolvedValue(1),
    getActiveLiveBoard: jest.fn().mockResolvedValue([
      {
        trip_id: testTripId,
        trip_number: 'TRIP-DEL-JPR-201',
        route_code: 'DEL-JPR',
        route_name: 'Delhi to Jaipur',
        origin_stop: 'Delhi',
        destination_stop: 'Jaipur',
        vehicle_code: 'BUS-DEL-101',
        registration_number: 'DL-01-A-1000',
        primary_driver_name: 'Rajesh Sharma',
        trip_status: 'IN_TRANSIT',
        current_stop: 'Delhi',
        delay_minutes: 2,
        current_latitude: 28.6675,
        current_longitude: 77.2285,
        last_telemetry_at: new Date(),
        total_stops: 2,
        completed_stops: 1,
      },
    ]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(TripProgressRepository)
      .useValue(mockTripProgressRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/trip-progress/active/live-board', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/trip-progress/active/live-board').expect(401);
    });

    it('should return active trips live board with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trip-progress/active/live-board')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].trip_id).toBe(testTripId);
      expect(res.body[0].progressPercentage).toBe(50.0);
    });
  });

  describe('GET /api/v1/trip-progress/:tripId', () => {
    it('should return 404 if trip not found', async () => {
      mockTripProgressRepository.findTripProgressDetail.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/api/v1/trip-progress/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return trip progress calculation with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trip-progress/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.tripId).toBe(testTripId);
      expect(res.body.progressPercentage).toBe(50.0);
      expect(res.body.stopsSummary.total).toBe(2);
      expect(res.body.stopsSummary.completed).toBe(1);
      expect(res.body.stopsSummary.remaining).toBe(1);
      expect(res.body.distanceSummary.totalDistanceKm).toBe(260.0);
    });
  });

  describe('POST /api/v1/trip-progress/:tripId/milestones', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/trip-progress/${testTripId}/milestones`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ eventType: 'DEPARTED_TERMINAL' })
        .expect(403);
    });

    it('should reject invalid eventType with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/trip-progress/${testTripId}/milestones`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ eventType: 'invalid event with spaces' })
        .expect(400);
    });

    it('should allow driver to record milestone with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trip-progress/${testTripId}/milestones`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          eventType: 'DEPARTED_TERMINAL',
          eventData: { passengerCount: 42 },
        })
        .expect(201);

      expect(res.body.event_type).toBe('DEPARTED_TERMINAL');
    });
  });

  describe('GET /api/v1/trip-progress/:tripId/milestones', () => {
    it('should return milestones list with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trip-progress/${testTripId}/milestones`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .query({ limit: 10 })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].event_type).toBe('DEPARTED_TERMINAL');
    });
  });
});
