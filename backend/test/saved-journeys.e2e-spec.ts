import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { SavedJourneysRepository } from '../src/saved-journeys/repositories/saved-journeys.repository';

describe('Saved Journeys (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  const userId = '11111111-1111-4111-a111-111111111111';

  const locId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const routeId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const originStopId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const destStopId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';

  const mockAddress = {
    id: locId,
    user_id: userId,
    address_type: 'HOME',
    street_address: '123 Station Road',
    city: 'Delhi',
    state: 'Delhi',
    postal_code: '110001',
    country: 'India',
    latitude: 28.6,
    longitude: 77.2,
    is_default: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSavedRoute = {
    id: routeId,
    userId,
    name: 'Daily Office Commute',
    originStopId,
    originStopName: 'Origin Terminal',
    destinationStopId: destStopId,
    destinationStopName: 'Dest Station',
    preferredDepartureTime: '08:30',
    daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    notifyDelayAlerts: true,
    createdAt: new Date(),
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

  const mockSavedRepo = {
    saveUserAddress: jest.fn().mockResolvedValue(mockAddress),
    findUserAddresses: jest.fn().mockResolvedValue([mockAddress]),
    findUserAddressById: jest.fn().mockImplementation((id: string) => {
      if (id === locId) return Promise.resolve(mockAddress);
      return Promise.resolve(null);
    }),
    deleteUserAddress: jest.fn().mockResolvedValue(true),
    findStopById: jest.fn().mockImplementation((id: string) => {
      if (id === originStopId)
        return Promise.resolve({ id: originStopId, name: 'Origin Terminal' });
      if (id === destStopId) return Promise.resolve({ id: destStopId, name: 'Dest Station' });
      return Promise.resolve(null);
    }),
    saveSavedRoute: jest.fn().mockResolvedValue(undefined),
    findSavedRouteById: jest.fn().mockImplementation((id: string) => {
      if (id === routeId) return Promise.resolve(mockSavedRoute);
      return Promise.resolve(null);
    }),
    findSavedRoutesByUserId: jest.fn().mockResolvedValue([mockSavedRoute]),
    deleteSavedRoute: jest.fn().mockResolvedValue(undefined),
    findNextTripBetweenStops: jest.fn().mockResolvedValue({
      trip_id: 'tr-1',
      trip_number: 'TRIP-101',
      route_code: 'DEL-101',
      route_name: 'Metro Direct',
      status: 'SCHEDULED',
      departure_time: new Date(),
      arrival_time: new Date(),
      delay_minutes: 0,
      vehicle_code: 'BUS-01',
      registration_number: 'DL-01-A-1000',
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(SavedJourneysRepository)
      .useValue(mockSavedRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: userId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/saved-journeys/locations', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/saved-journeys/locations');

      expect(res.status).toBe(401);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/saved-journeys/locations')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should save passenger location with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/saved-journeys/locations')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          addressType: 'HOME',
          streetAddress: '123 Station Road',
          city: 'Delhi',
          state: 'Delhi',
          postalCode: '110001',
        });

      expect(res.status).toBe(201);
      expect(res.body.address_type).toBe('HOME');
    });
  });

  describe('GET /api/v1/saved-journeys/locations', () => {
    it('should return user locations with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/saved-journeys/locations')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/saved-journeys/locations/:id', () => {
    it('should delete saved location with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/saved-journeys/locations/${locId}`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/saved-journeys/routes', () => {
    it('should save commute route with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/saved-journeys/routes')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          name: 'Daily Office Commute',
          originStopId,
          destinationStopId: destStopId,
          preferredDepartureTime: '08:30',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Daily Office Commute');
      expect(res.body.originStopName).toBe('Origin Terminal');
    });
  });

  describe('GET /api/v1/saved-journeys/routes', () => {
    it('should return user saved routes with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/saved-journeys/routes')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/saved-journeys/routes/:id', () => {
    it('should delete saved route with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/saved-journeys/routes/${routeId}`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/saved-journeys/routes/:id/next-trip', () => {
    it('should return next upcoming trip for saved commute with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/saved-journeys/routes/${routeId}/next-trip`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasActiveTrip).toBe(true);
      expect(res.body.nextTrip.trip_number).toBe('TRIP-101');
    });
  });
});
