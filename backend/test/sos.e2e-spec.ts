import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { NotificationsService } from '../src/notifications/services/notifications.service';
import { RealTimeService } from '../src/real-time/services/real-time.service';
import { RedisService } from '../src/redis/redis.service';
import { SosRepository } from '../src/sos/repositories/sos.repository';

describe('SOS / Emergency (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let otherPassengerToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  const passengerId = '11111111-1111-4111-a111-111111111111';
  const otherPassengerId = '22222222-2222-4222-a222-222222222222';
  const safetyOfficerId = '33333333-3333-4333-a333-333333333333';
  const adminId = '44444444-4444-4444-a444-444444444444';

  const tripId = '55555555-5555-4555-a555-555555555555';
  const vehicleId = '66666666-6666-4666-a666-666666666666';
  const driverId = '77777777-7777-4777-a777-777777777777';
  const eventId = '88888888-8888-4888-a888-888888888888';
  const contactId = '99999999-9999-4999-a999-999999999999';

  const mockEmergencyEvent = {
    id: eventId,
    trip_id: tripId,
    vehicle_id: vehicleId,
    driver_id: driverId,
    user_id: passengerId,
    emergency_type: 'SOS_BUTTON',
    latitude: 13.0827,
    longitude: 80.2707,
    status: 'TRIGGERED' as const,
    triggered_at: new Date().toISOString(),
    resolved_at: null,
    created_at: new Date().toISOString(),
  };

  const mockContact = {
    id: contactId,
    user_id: passengerId,
    name: 'Jane Doe',
    relationship: 'Sister',
    phone: '+919876543210',
    email: 'jane@example.com',
    is_primary: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

  const mockSosRepo = {
    createEmergencyEvent: jest.fn().mockResolvedValue(mockEmergencyEvent),
    findEmergencyEventById: jest.fn().mockImplementation((id: string) => {
      if (id === eventId) return Promise.resolve(mockEmergencyEvent);
      return Promise.resolve(null);
    }),
    findActiveEmergencyEvents: jest.fn().mockResolvedValue([mockEmergencyEvent]),
    findLatestActiveEventForUser: jest.fn().mockResolvedValue(mockEmergencyEvent),
    updateEmergencyStatus: jest
      .fn()
      .mockImplementation((id: string, status: string, resolvedAt?: string | null) => {
        return Promise.resolve({
          ...mockEmergencyEvent,
          status,
          resolved_at: resolvedAt || null,
        });
      }),
    createEmergencyContact: jest.fn().mockResolvedValue(mockContact),
    findContactsByUserId: jest.fn().mockResolvedValue([mockContact]),
    findContactById: jest.fn().mockImplementation((id: string) => {
      if (id === contactId) return Promise.resolve(mockContact);
      return Promise.resolve(null);
    }),
    deleteContact: jest.fn().mockResolvedValue(true),
    validateTripExists: jest.fn().mockResolvedValue(true),
    validateVehicleExists: jest.fn().mockResolvedValue(true),
    resolveDriverIdForTrip: jest.fn().mockResolvedValue(driverId),
  };

  const mockNotifications = {
    dispatch: jest.fn().mockResolvedValue({ success: true }),
  };

  const mockRealTime = {
    setServer: jest.fn(),
    onClientConnected: jest.fn(),
    onClientDisconnected: jest.fn(),
    publishToRoom: jest
      .fn()
      .mockResolvedValue({ deliveredLocally: true, room: 'operations', event: 'emergency_alert' }),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(SosRepository)
      .useValue(mockSosRepo)
      .overrideProvider(NotificationsService)
      .useValue(mockNotifications)
      .overrideProvider(RealTimeService)
      .useValue(mockRealTime)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = app.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: passengerId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });

    otherPassengerToken = jwtService.sign({
      sub: otherPassengerId,
      email: 'other@movana.internal',
      roles: ['PASSENGER'],
    });

    safetyOfficerToken = jwtService.sign({
      sub: safetyOfficerId,
      email: 'safety@movana.internal',
      roles: ['SAFETY_OFFICER'],
    });

    adminToken = jwtService.sign({
      sub: adminId,
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/sos/trigger', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sos/trigger')
        .send({
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
        })
        .expect(401);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sos/trigger')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId: 'invalid-uuid',
          vehicleId,
          latitude: 200, // Invalid latitude
          longitude: 80.2707,
        })
        .expect(400);
    });

    it('should allow PASSENGER to trigger SOS with 201 Created', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sos/trigger')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
          emergencyType: 'SOS_BUTTON',
        })
        .expect(201);

      expect(response.body.event).toBeDefined();
      expect(response.body.event.status).toBe('TRIGGERED');
      expect(response.body.duplicateSuppressed).toBe(false);
    });

    it('should return duplicateSuppressed: true on throttled duplicate trigger', async () => {
      mockRedis.get.mockResolvedValueOnce(eventId);

      const response = await request(app.getHttpServer())
        .post('/api/v1/sos/trigger')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
        })
        .expect(201);

      expect(response.body.duplicateSuppressed).toBe(true);
      expect(response.body.event.id).toBe(eventId);
    });
  });

  describe('GET /api/v1/sos/active', () => {
    it('should reject PASSENGER access with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/sos/active')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow SAFETY_OFFICER to view active emergencies with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sos/active')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
    });

    it('should allow ADMIN to view active emergencies with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sos/active')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/v1/sos/:id', () => {
    it('should return 404 for non-existent emergency', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/sos/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should reject non-owner passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sos/${eventId}`)
        .set('Authorization', `Bearer ${otherPassengerToken}`)
        .expect(403);
    });

    it('should return emergency details for owner passenger with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/sos/${eventId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(response.body.id).toBe(eventId);
    });

    it('should return emergency details for SAFETY_OFFICER with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/sos/${eventId}`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      expect(response.body.id).toBe(eventId);
    });
  });

  describe('PATCH /api/v1/sos/:id/status', () => {
    it('should reject PASSENGER status update with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/sos/${eventId}/status`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ status: 'DISPATCHED' })
        .expect(403);
    });

    it('should allow SAFETY_OFFICER to transition status to DISPATCHED with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/sos/${eventId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'DISPATCHED' })
        .expect(200);

      expect(response.body.status).toBe('DISPATCHED');
    });

    it('should allow SAFETY_OFFICER to transition status to RESOLVED with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/sos/${eventId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'RESOLVED' })
        .expect(200);

      expect(response.body.status).toBe('RESOLVED');
    });

    it('should reject transition if event is already in terminal state with 409 Conflict', async () => {
      mockSosRepo.findEmergencyEventById.mockResolvedValueOnce({
        ...mockEmergencyEvent,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/sos/${eventId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'DISPATCHED' })
        .expect(409);
    });
  });

  describe('Emergency Contacts', () => {
    it('should allow PASSENGER to create emergency contact with 201 Created', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sos/contacts')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          name: 'Jane Doe',
          relationship: 'Sister',
          phone: '+919876543210',
          isPrimary: true,
        })
        .expect(201);

      expect(response.body.name).toBe('Jane Doe');
      expect(response.body.relationship).toBe('Sister');
    });

    it('should list emergency contacts for PASSENGER with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sos/contacts')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
    });

    it('should allow owner PASSENGER to delete contact with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/sos/contacts/${contactId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 when deleting non-existent contact', async () => {
      mockSosRepo.findContactById.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .delete('/api/v1/sos/contacts/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });
});
