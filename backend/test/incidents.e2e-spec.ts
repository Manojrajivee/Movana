import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { IncidentsRepository } from '../src/incidents/repositories/incidents.repository';
import { RedisService } from '../src/redis/redis.service';

describe('Incidents (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let unauthorizedPassengerToken: string;
  let driverToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  const passengerId = '11111111-1111-4111-a111-111111111111';
  const unauthorizedPassengerId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';
  const safetyOfficerId = '44444444-4444-4444-a444-444444444444';
  const adminId = '55555555-5555-4555-a555-555555555555';

  const tripId = '66666666-6666-4666-a666-666666666666';
  const vehicleId = '77777777-7777-4777-a777-777777777777';
  const driverId = '88888888-8888-4888-a888-888888888888';
  const incidentTypeId = '99999999-9999-4999-a999-999999999999';
  const incidentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockIncidentType = {
    id: incidentTypeId,
    code: 'MECHANICAL_BREAKDOWN',
    name: 'Mechanical Breakdown',
    category: 'FLEET',
    description: 'Vehicle breakdown or technical failure',
    created_at: new Date().toISOString(),
  };

  const mockSeverity = {
    id: 'sev-1',
    code: 'HIGH',
    name: 'High Severity',
    level_rank: 3,
    created_at: new Date().toISOString(),
  };

  const mockIncident = {
    id: incidentId,
    incident_number: 'INC-20261028-TEST01',
    trip_id: tripId,
    vehicle_id: vehicleId,
    driver_id: driverId,
    reported_by: passengerId,
    incident_type_id: incidentTypeId,
    severity: 'HIGH',
    title: 'Engine overheating on highway',
    description: 'Bus engine started emitting severe smoke and vibrations on the ring road.',
    latitude: 13.0827,
    longitude: 80.2707,
    occurred_at: new Date().toISOString(),
    reported_at: new Date().toISOString(),
    status: 'OPEN',
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    incident_type_name: 'Mechanical Breakdown',
    incident_type_code: 'MECHANICAL_BREAKDOWN',
    reports: [],
  };

  const mockReport = {
    id: 'rep-11111111-1111-4111-a111-111111111111',
    incident_id: incidentId,
    submitted_by: passengerId,
    report_details: 'Eyewitness statement from front row passenger',
    witnesses: [
      {
        name: 'Sarah Connor',
        contact: '+919988776655',
        statement: 'The warning lights were flashing before the engine stopped.',
      },
    ],
    created_at: new Date().toISOString(),
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

  const mockIncidentsRepo = {
    findIncidentTypes: jest.fn().mockResolvedValue([mockIncidentType]),
    findSeverityLevels: jest.fn().mockResolvedValue([mockSeverity]),
    findIncidentTypeByIdOrCode: jest.fn().mockImplementation((id: string) => {
      if (id === incidentTypeId || id === 'MECHANICAL_BREAKDOWN') {
        return Promise.resolve(mockIncidentType);
      }
      return Promise.resolve(null);
    }),
    validateTripExists: jest.fn().mockImplementation((id: string) => {
      if (id === tripId) {
        return Promise.resolve({
          exists: true,
          vehicleId,
          driverId,
        });
      }
      return Promise.resolve({ exists: false, vehicleId: null, driverId: null });
    }),
    validateVehicleExists: jest.fn().mockResolvedValue(true),
    validateDriverExists: jest.fn().mockResolvedValue(true),
    validateReporterTripAuthorization: jest
      .fn()
      .mockImplementation((userId: string, targetTripId: string, roles: string[] = []) => {
        if (roles.includes('ADMIN') || roles.includes('SAFETY_OFFICER'))
          return Promise.resolve(true);
        if (targetTripId === tripId && (userId === passengerId || userId === driverUserId)) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      }),
    createIncident: jest.fn().mockImplementation((data: any) => {
      return Promise.resolve({
        id: incidentId,
        incident_number: data.incidentNumber,
        trip_id: data.tripId,
        vehicle_id: data.vehicleId,
        driver_id: data.driverId,
        reported_by: data.reportedBy,
        incident_type_id: data.incidentTypeId,
        severity: data.severity,
        title: data.title,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        occurred_at: data.occurredAt || new Date().toISOString(),
        reported_at: new Date().toISOString(),
        status: 'OPEN',
        resolved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }),
    createIncidentReport: jest.fn().mockResolvedValue(mockReport),
    findIncidentById: jest.fn().mockImplementation((id: string) => {
      if (id === incidentId) {
        return Promise.resolve({ ...mockIncident, reports: [mockReport] });
      }
      return Promise.resolve(null);
    }),
    findIncidentsByReporter: jest.fn().mockImplementation((userId: string) => {
      if (userId === passengerId) return Promise.resolve([mockIncident]);
      return Promise.resolve([]);
    }),
    findIncidents: jest.fn().mockResolvedValue({ items: [mockIncident], total: 1 }),
  };

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
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
      .overrideProvider(IncidentsRepository)
      .useValue(mockIncidentsRepo)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
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

    unauthorizedPassengerToken = jwtService.sign({
      sub: unauthorizedPassengerId,
      email: 'unauthorized@movana.internal',
      roles: ['PASSENGER'],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
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
    await app.close();
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/incidents/types').expect(401);
      await request(app.getHttpServer()).post('/api/v1/incidents').send({}).expect(401);
      await request(app.getHttpServer()).get('/api/v1/incidents/my').expect(401);
    });

    it('should reject non-staff users from accessing GET /api/v1/incidents with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow safety officers and admins to access GET /api/v1/incidents', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/incidents')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/incidents')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Catalog Endpoints', () => {
    it('GET /api/v1/incidents/types should return list of incident types', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/incidents/types')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].code).toBe('MECHANICAL_BREAKDOWN');
    });

    it('GET /api/v1/incidents/severities should return list of severity levels', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/incidents/severities')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].code).toBe('HIGH');
    });
  });

  describe('POST /api/v1/incidents (Report Incident)', () => {
    it('should reject invalid payloads with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          title: 'Hi', // too short (< 3)
          description: 'Short', // too short (< 10)
        })
        .expect(400);
    });

    it('should reject invalid incident type with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          incidentTypeId: 'UNKNOWN_TYPE_XYZ',
          title: 'Engine Failure',
          description: 'Bus engine stopped running completely on the road.',
        })
        .expect(400);
    });

    it('should reject non-existent trip with 404', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId: '00000000-0000-4000-a000-000000000000',
          incidentTypeId,
          title: 'Engine Failure',
          description: 'Bus engine stopped running completely on the road.',
        })
        .expect(404);
    });

    it('should reject reporting on a trip the passenger is not booked on with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${unauthorizedPassengerToken}`)
        .send({
          tripId,
          incidentTypeId,
          title: 'Engine Failure',
          description: 'Bus engine stopped running completely on the road.',
        })
        .expect(403);
    });

    it('should file incident successfully for passenger on booked trip with witnesses', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId,
          incidentTypeId,
          severity: 'HIGH',
          title: 'Engine overheating on highway',
          description: 'Bus engine started emitting severe smoke and vibrations on the ring road.',
          latitude: 13.0827,
          longitude: 80.2707,
          witnesses: [
            {
              name: 'Sarah Connor',
              contact: '+919988776655',
              statement: 'The warning lights were flashing before the engine stopped.',
            },
          ],
        })
        .expect(201);

      expect(res.body.id).toBe(incidentId);
      expect(res.body.severity).toBe('HIGH');
      expect(res.body.vehicle_id).toBe(vehicleId);
      expect(res.body.driver_id).toBe(driverId);
      expect(mockIncidentsRepo.createIncidentReport).toHaveBeenCalled();
    });

    it('should file incident successfully for assigned driver', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          tripId,
          incidentTypeId,
          severity: 'MEDIUM',
          title: 'Minor Flat Tire',
          description: 'Rear right tire pressure dropped suddenly during transit.',
        })
        .expect(201);

      expect(res.body.id).toBe(incidentId);
      expect(res.body.trip_id).toBe(tripId);
    });

    it('should file standalone incident without trip reference', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          incidentTypeId,
          severity: 'LOW',
          title: 'Broken Bench at Terminal',
          description: 'The waiting area bench at platform 4 has collapsed.',
        })
        .expect(201);

      expect(res.body.id).toBe(incidentId);
    });

    it('should ignore client spoofed vehicleId/driverId and enforce authoritative trip assignments', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId,
          vehicleId: '12345678-1234-4234-a234-123456789abc',
          driverId: '87654321-4321-4321-a321-cba987654321',
          incidentTypeId,
          severity: 'MEDIUM',
          title: 'Suspicious Noise from Wheel',
          description: 'Loud rattling noise near the front left tire axle.',
        })
        .expect(201);

      expect(res.body.id).toBe(incidentId);
      expect(res.body.vehicle_id).toBe(vehicleId);
      expect(res.body.driver_id).toBe(driverId);
    });

    it('should automatically retry and succeed if incident_number collides on unique constraint', async () => {
      const collisionErr = new Error('duplicate key') as any;
      collisionErr.code = '23505';

      mockIncidentsRepo.createIncident.mockRejectedValueOnce(collisionErr).mockResolvedValueOnce({
        ...mockIncident,
        incident_number: 'INC-20261028-RETRY1',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          incidentTypeId,
          severity: 'LOW',
          title: 'Graffiti on rear window',
          description: 'Graffiti markings found etched into the glass.',
        })
        .expect(201);

      expect(res.body.incident_number).toBe('INC-20261028-RETRY1');
    });
  });

  describe('GET /api/v1/incidents/my (Reporter History)', () => {
    it('should return incidents reported by current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/incidents/my')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].reported_by).toBe(passengerId);
    });
  });

  describe('GET /api/v1/incidents/:id (Incident Detail)', () => {
    it('should return 404 if incident does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/incidents/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return 403 if user is neither reporter nor staff', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${unauthorizedPassengerToken}`)
        .expect(403);
    });

    it('should return incident with reports if user is the reporter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(incidentId);
      expect(res.body.reports).toBeDefined();
    });

    it('should return incident if user is safety officer or admin', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /api/v1/incidents/:id/witnesses (Add Witness Statement)', () => {
    it('should return 400 for invalid witness statement payload', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/witnesses`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          reportDetails: 'Hi', // too short (< 5)
          witnesses: [], // empty (< 1)
        })
        .expect(400);
    });

    it('should return 404 if incident does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/incidents/00000000-0000-4000-a000-000000000000/witnesses')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          reportDetails: 'Additional passenger statement',
          witnesses: [
            {
              name: 'John Doe',
              statement: 'I saw everything clearly.',
            },
          ],
        })
        .expect(404);
    });

    it('should return 403 if user is not reporter or staff', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/witnesses`)
        .set('Authorization', `Bearer ${unauthorizedPassengerToken}`)
        .send({
          reportDetails: 'Additional passenger statement',
          witnesses: [
            {
              name: 'John Doe',
              statement: 'I saw everything clearly.',
            },
          ],
        })
        .expect(403);
    });

    it('should add witness report if user is the reporter', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/witnesses`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          reportDetails: 'Additional passenger statement gathered at stop',
          witnesses: [
            {
              name: 'John Doe',
              contact: '+919876543210',
              statement: 'I saw smoke emerging from underneath the chassis.',
            },
          ],
        })
        .expect(201);

      expect(res.body.incident_id).toBe(incidentId);
      expect(res.body.submitted_by).toBe(passengerId);
    });

    it('should add witness report if user is safety officer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/witnesses`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          reportDetails: 'Safety officer supplemental investigation interview',
          witnesses: [
            {
              name: 'Bus Conductor',
              statement: 'Conductor initiated emergency stop protocol.',
            },
          ],
        })
        .expect(201);

      expect(res.body.incident_id).toBe(incidentId);
    });
  });

  describe('GET /api/v1/incidents (Staff Search & Discovery)', () => {
    it('should support querying with filters and pagination for staff', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/incidents?status=OPEN&severity=HIGH&limit=10&offset=0')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBe(1);
      expect(mockIncidentsRepo.findIncidents).toHaveBeenCalledWith({
        status: 'OPEN',
        severity: 'HIGH',
        limit: 10,
        offset: 0,
      });
    });
  });
});
