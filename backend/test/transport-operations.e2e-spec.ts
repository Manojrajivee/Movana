import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { DriversRepository } from '../src/drivers/repositories/drivers.repository';
import { FleetRepository } from '../src/fleet/repositories/fleet.repository';
import { RedisService } from '../src/redis/redis.service';
import { TransportOperationsRepository } from '../src/transport-operations/repositories/transport-operations.repository';

describe('Transport Operations (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let driverToken: string;
  let passengerToken: string;
  let fleetManagerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const driverUserId = '22222222-2222-4222-a222-222222222222';
  const driverRecordId = '33333333-3333-4333-a333-333333333333';
  const passengerUserId = '44444444-4444-4444-a444-444444444444';
  const fleetManagerUserId = '55555555-5555-4555-a555-555555555555';

  const routeId = '66666666-6666-4666-a666-666666666666';
  const vehicleId = '77777777-7777-4777-a777-777777777777';
  const tripId = '88888888-8888-4888-a888-888888888888';
  const eventId = '99999999-9999-4999-a999-999999999999';
  const assignmentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockRoute = {
    id: routeId,
    route_code: 'RT-500',
    name: 'Kempegowda to Whitefield Express',
    status: 'ACTIVE',
  };

  const mockVehicle: any = {
    id: vehicleId,
    registration_number: 'KA-01-EQ-7777',
    vehicle_code: 'BUS-777',
    status: 'ACTIVE',
  };

  const mockDriver: any = {
    id: driverRecordId,
    userId: driverUserId,
    employeeCode: 'DRV-777',
    badgeNumber: 'BDG-777',
    employmentStatus: 'ACTIVE',
  };

  const mockTrip: any = {
    id: tripId,
    trip_number: 'TRIP-EXP-777',
    route_id: routeId,
    schedule_id: null,
    vehicle_id: vehicleId,
    primary_driver_id: driverRecordId,
    secondary_driver_id: null,
    scheduled_departure_at: '2026-11-01T06:00:00Z',
    scheduled_arrival_at: '2026-11-01T08:00:00Z',
    actual_departure_at: null,
    actual_arrival_at: null,
    status: 'SCHEDULED',
    current_stop_id: null,
    current_latitude: null,
    current_longitude: null,
    delay_minutes: 0,
    created_at: new Date(),
    updated_at: new Date(),
    route_code: 'RT-500',
    route_name: 'Kempegowda to Whitefield Express',
    vehicle_registration_number: 'KA-01-EQ-7777',
    vehicle_code: 'BUS-777',
    primary_driver_badge: 'BDG-777',
  };

  const mockEvent: any = {
    id: eventId,
    trip_id: tripId,
    vehicle_id: vehicleId,
    driver_id: driverRecordId,
    event_type: 'BOARDING_STARTED',
    event_data: { platform: 'Platform 4' },
    occurred_at: new Date(),
    created_at: new Date(),
  };

  const mockAssignment: any = {
    id: assignmentId,
    trip_id: tripId,
    driver_id: driverRecordId,
    vehicle_id: vehicleId,
    assignment_type: 'PRIMARY_DRIVER',
    assigned_at: new Date(),
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
    driver_badge: 'BDG-777',
    vehicle_registration_number: 'KA-01-EQ-7777',
  };

  const mockStatusHistory: any = {
    id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
    trip_id: tripId,
    old_status: 'SCHEDULED',
    new_status: 'BOARDING',
    reason: 'Passengers boarding platform 4',
    changed_by: operatorUserId,
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
    withTransaction: jest.fn().mockImplementation(async (callback) => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      return callback(client);
    }),
  };

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 1,
      ping: 'PONG',
    }),
  };

  const mockTransportOpsRepo = {
    createTrip: jest.fn().mockResolvedValue(mockTrip),
    findTripById: jest.fn().mockImplementation((id: string) => {
      if (id === tripId) return Promise.resolve(mockTrip);
      return Promise.resolve(null);
    }),
    findTripByNumber: jest.fn().mockResolvedValue(null),
    findRouteById: jest.fn().mockImplementation((id: string) => {
      if (id === routeId) return Promise.resolve(mockRoute);
      return Promise.resolve(null);
    }),
    findTrips: jest.fn().mockResolvedValue({
      trips: [mockTrip],
      total: 1,
    }),
    updateTripStatus: jest.fn().mockImplementation((id: string, data: any) => {
      if (id === tripId) {
        return Promise.resolve({ ...mockTrip, status: data.status });
      }
      return Promise.resolve(null);
    }),
    updateTripCrew: jest.fn().mockResolvedValue(mockTrip),
    recordStatusHistory: jest.fn().mockResolvedValue(mockStatusHistory),
    findStatusHistoryByTripId: jest.fn().mockResolvedValue([mockStatusHistory]),
    createTripAssignment: jest.fn().mockResolvedValue(mockAssignment),
    findTripAssignments: jest.fn().mockResolvedValue([mockAssignment]),
    createTripEvent: jest.fn().mockResolvedValue(mockEvent),
    findTripEvents: jest.fn().mockResolvedValue([mockEvent]),
    getDispatchSummary: jest.fn().mockResolvedValue({
      totalTrips: 12,
      scheduledTrips: 5,
      inTransitTrips: 4,
      completedTrips: 2,
      delayedTrips: 1,
      cancelledTrips: 0,
      activeVehicles: 4,
      activeDrivers: 4,
    }),
  };

  const mockFleetRepo = {
    findVehicleById: jest.fn().mockImplementation((id: string) => {
      if (id === vehicleId) return Promise.resolve(mockVehicle);
      return Promise.resolve(null);
    }),
    findVehicleTypeById: jest.fn().mockResolvedValue(null),
    updateVehicleStatus: jest.fn().mockResolvedValue(mockVehicle),
    recordStatusHistory: jest.fn().mockResolvedValue(undefined),
  };

  const mockDriversRepo = {
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === driverRecordId) return Promise.resolve(mockDriver);
      return Promise.resolve(null);
    }),
    findByUserId: jest.fn().mockImplementation((uid: string) => {
      if (uid === driverUserId) return Promise.resolve(mockDriver);
      return Promise.resolve(null);
    }),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3000';
    process.env.DATABASE_NAME = 'movana';
    process.env.DATABASE_USER = 'movana_app';
    process.env.DATABASE_PASSWORD = 'MockTestPasswordSecret123!';
    process.env.REDIS_REQUIRED_FOR_READY = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(TransportOperationsRepository)
      .useValue(mockTransportOpsRepo)
      .overrideProvider(FleetRepository)
      .useValue(mockFleetRepo)
      .overrideProvider(DriversRepository)
      .useValue(mockDriversRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
      permissions: ['*'],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
      permissions: ['drivers:read'],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@example.com',
      roles: ['PASSENGER'],
      permissions: [],
    });

    fleetManagerToken = jwtService.sign({
      sub: fleetManagerUserId,
      email: 'fleet@movana.internal',
      roles: ['FLEET_MANAGER'],
      permissions: ['fleet:manage'],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Security & Access Controls', () => {
    it('should return 401 Unauthorized without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transport-operations/dispatch/summary')
        .expect(401);
    });

    it('should return 403 Forbidden when passenger attempts to create trip', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transport-operations/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripNumber: 'TRIP-EXP-777',
          routeId,
          scheduledDepartureAt: '2026-11-01T06:00:00Z',
          scheduledArrivalAt: '2026-11-01T08:00:00Z',
        })
        .expect(403);
    });

    it('should return 403 Forbidden when passenger attempts to view summary', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transport-operations/dispatch/summary')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });
  });

  describe('Operational Trip Dispatching', () => {
    it('should create trip with 201 Created for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transport-operations/trips')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          tripNumber: 'TRIP-EXP-777',
          routeId,
          vehicleId,
          primaryDriverId: driverRecordId,
          scheduledDepartureAt: '2026-11-01T06:00:00Z',
          scheduledArrivalAt: '2026-11-01T08:00:00Z',
        })
        .expect(201);

      expect(res.body.trip_number).toBe('TRIP-EXP-777');
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('should retrieve list of trips with 200 OK for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transport-operations/trips')
        .set('Authorization', `Bearer ${operatorToken}`)
        .query({ status: 'SCHEDULED' })
        .expect(200);

      expect(res.body.trips).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should retrieve trip by ID with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-operations/trips/${tripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(tripId);
      expect(res.body.route_code).toBe('RT-500');
    });

    it('should update trip status to BOARDING with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/transport-operations/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          status: 'BOARDING',
          reason: 'Gate opened for passengers',
        })
        .expect(200);

      expect(res.body.status).toBe('BOARDING');
    });

    it('should retrieve trip status transition history with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-operations/trips/${tripId}/status-history`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].new_status).toBe('BOARDING');
    });
  });

  describe('Crew Assignment & Milestone Events', () => {
    it('should assign crew to trip with 201 Created for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/transport-operations/trips/${tripId}/assignments`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          driverId: driverRecordId,
          vehicleId,
          assignmentType: 'PRIMARY_DRIVER',
        })
        .expect(201);

      expect(res.body.id).toBe(assignmentId);
      expect(res.body.assignment_type).toBe('PRIMARY_DRIVER');
    });

    it('should retrieve trip crew assignments with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-operations/trips/${tripId}/assignments`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].driver_badge).toBe('BDG-777');
    });

    it('should record operational milestone event with 201 Created for DRIVER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/transport-operations/trips/${tripId}/events`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          eventType: 'BOARDING_STARTED',
          eventData: { platform: 'Platform 4' },
        })
        .expect(201);

      expect(res.body.event_type).toBe('BOARDING_STARTED');
    });

    it('should retrieve milestone events with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-operations/trips/${tripId}/events`)
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].event_type).toBe('BOARDING_STARTED');
    });
  });

  describe('Dispatch Operational Dashboard', () => {
    it('should retrieve dispatch dashboard metrics with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transport-operations/dispatch/summary')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.totalTrips).toBe(12);
      expect(res.body.scheduledTrips).toBe(5);
      expect(res.body.inTransitTrips).toBe(4);
      expect(res.body.activeVehicles).toBe(4);
    });
  });
});
