import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { ServiceDisruptionsRepository } from '../src/service-disruptions/repositories/service-disruptions.repository';

describe('Service Disruptions (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let safetyOfficerToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const safetyUserId = '22222222-2222-4222-a222-222222222222';
  const passengerUserId = '33333333-3333-4333-a333-333333333333';

  const testDisruptionId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const testRouteId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

  const mockDisruptionData = {
    id: testDisruptionId,
    title: 'NH-48 Highway Landslide Detour',
    description:
      'Heavy rains caused partial highway blockage; buses rerouted via Western Peripheral.',
    disruptionType: 'ROUTE_DETOUR',
    severity: 'WARNING' as const,
    status: 'ACTIVE' as const,
    routeId: testRouteId,
    routeCode: 'DEL-JPR',
    routeName: 'Delhi to Jaipur',
    tripId: null,
    tripNumber: null,
    affectedStops: [],
    startsAt: new Date(),
    endsAt: null,
    resolvedAt: null,
    resolutionNotes: null,
    createdBy: safetyUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
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

  const mockServiceDisruptionsRepository = {
    findRouteById: jest.fn().mockResolvedValue({
      id: testRouteId,
      route_code: 'DEL-JPR',
      name: 'Delhi to Jaipur',
    }),
    findTripById: jest.fn().mockResolvedValue(null),
    findStopById: jest.fn().mockResolvedValue({ id: 'stop-1' }),
    saveDisruption: jest.fn().mockResolvedValue(undefined),
    findDisruptionById: jest.fn().mockResolvedValue(mockDisruptionData),
    findActiveDisruptions: jest.fn().mockResolvedValue([mockDisruptionData]),
    findAllDisruptions: jest.fn().mockResolvedValue([mockDisruptionData]),
    deleteDisruption: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(ServiceDisruptionsRepository)
      .useValue(mockServiceDisruptionsRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
    });

    safetyOfficerToken = jwtService.sign({
      sub: safetyUserId,
      email: 'safety@movana.internal',
      roles: ['SAFETY_OFFICER'],
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

  describe('POST /api/v1/service-disruptions', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/service-disruptions')
        .send({
          title: 'NH-48 Landslide',
          description: 'Road blocked',
          disruptionType: 'ROAD_CLOSURE',
        })
        .expect(401);
    });

    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/service-disruptions')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          title: 'NH-48 Landslide',
          description: 'Road blocked',
          disruptionType: 'ROAD_CLOSURE',
        })
        .expect(403);
    });

    it('should reject malformed disruptionType with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/service-disruptions')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          title: 'NH-48 Landslide',
          description: 'Road blocked',
          disruptionType: 'INVALID_TYPE',
        })
        .expect(400);
    });

    it('should create disruption successfully by safety officer with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/service-disruptions')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          title: 'NH-48 Highway Landslide Detour',
          description:
            'Heavy rains caused partial highway blockage; buses rerouted via Western Peripheral.',
          disruptionType: 'ROUTE_DETOUR',
          severity: 'WARNING',
          routeId: testRouteId,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('ACTIVE');
    });
  });

  describe('GET /api/v1/service-disruptions/active', () => {
    it('should allow passenger to retrieve active network disruptions with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/service-disruptions/active')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(testDisruptionId);
    });
  });

  describe('GET /api/v1/service-disruptions', () => {
    it('should return filtered disruptions list with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/service-disruptions')
        .set('Authorization', `Bearer ${passengerToken}`)
        .query({ status: 'ACTIVE', routeId: testRouteId, severity: 'WARNING' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/service-disruptions/:id', () => {
    it('should return 404 if disruption not found', async () => {
      mockServiceDisruptionsRepository.findDisruptionById.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/api/v1/service-disruptions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return disruption details with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/service-disruptions/${testDisruptionId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(testDisruptionId);
    });
  });

  describe('PATCH /api/v1/service-disruptions/:id', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/service-disruptions/${testDisruptionId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ severity: 'CRITICAL' })
        .expect(403);
    });

    it('should update disruption successfully by operator with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/service-disruptions/${testDisruptionId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ severity: 'CRITICAL' })
        .expect(200);

      expect(res.body.severity).toBe('CRITICAL');
    });
  });

  describe('POST /api/v1/service-disruptions/:id/resolve', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/service-disruptions/${testDisruptionId}/resolve`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ resolutionNotes: 'Road reopened' })
        .expect(403);
    });

    it('should resolve disruption successfully with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/service-disruptions/${testDisruptionId}/resolve`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ resolutionNotes: 'Highway cleared of debris, normal routing resumed' })
        .expect(200);

      expect(res.body.status).toBe('RESOLVED');
    });
  });

  describe('DELETE /api/v1/service-disruptions/:id', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/service-disruptions/${testDisruptionId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should delete disruption successfully by operator with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/service-disruptions/${testDisruptionId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
