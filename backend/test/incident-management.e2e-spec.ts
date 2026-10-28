import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { IncidentManagementRepository } from '../src/incident-management/repositories/incident-management.repository';
import { NotificationsService } from '../src/notifications/services/notifications.service';
import { RedisService } from '../src/redis/redis.service';

describe('Incident Management (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let otherPassengerToken: string;
  let driverToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  const passengerId = '11111111-1111-4111-a111-111111111111';
  const otherPassengerId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';
  const safetyOfficerId = '44444444-4444-4444-a444-444444444444';
  const adminId = '55555555-5555-4555-a555-555555555555';

  const testIncidentId = '88888888-8888-4888-a888-888888888888';
  const nonExistentIncidentId = '99999999-9999-4999-a999-999999999999';

  // In-memory state for mock repository
  let mockIncidentState: any;
  let mockActionsStore: any[] = [];
  let mockReportsStore: any[] = [];
  let mockAssignmentsStore: Map<string, any> = new Map();

  const resetMockState = () => {
    mockIncidentState = {
      id: testIncidentId,
      incident_number: 'INC-20261028-TEST01',
      trip_id: null,
      vehicle_id: null,
      driver_id: null,
      reported_by: passengerId,
      incident_type_id: 'type-111',
      incident_type_name: 'Harassment',
      incident_type_code: 'HARASSMENT',
      reporter_name: 'Passenger Alice',
      reporter_email: 'alice@example.com',
      severity: 'HIGH',
      title: 'Verbal altercation on bus',
      description: 'Passenger threatened another passenger',
      latitude: 13.0827,
      longitude: 80.2707,
      occurred_at: new Date().toISOString(),
      reported_at: new Date().toISOString(),
      status: 'OPEN',
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockActionsStore = [];
    mockReportsStore = [];
    mockAssignmentsStore.clear();
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

  const mockIncidentManagementRepo = {
    findIncidentById: jest.fn().mockImplementation((id: string) => {
      if (id === testIncidentId) {
        return Promise.resolve({ ...mockIncidentState });
      }
      return Promise.resolve(null);
    }),
    updateIncidentStatus: jest
      .fn()
      .mockImplementation((id: string, status: string, resolvedAt: Date | null) => {
        if (id === testIncidentId) {
          mockIncidentState.status = status;
          mockIncidentState.resolved_at = resolvedAt ? resolvedAt.toISOString() : null;
          mockIncidentState.updated_at = new Date().toISOString();
          return Promise.resolve({ ...mockIncidentState });
        }
        return Promise.resolve(null);
      }),
    createIncidentAction: jest
      .fn()
      .mockImplementation(
        (
          incidentId: string,
          actionTaken: string,
          takenBy: string,
          status: string = 'COMPLETED',
        ) => {
          const action = {
            id: `act-${mockActionsStore.length + 1}`,
            incident_id: incidentId,
            action_taken: actionTaken,
            taken_by: takenBy,
            action_date: new Date().toISOString(),
            status,
            created_at: new Date().toISOString(),
          };
          mockActionsStore.push(action);
          return Promise.resolve(action);
        },
      ),
    findActionsByIncidentId: jest.fn().mockImplementation((incidentId: string) => {
      return Promise.resolve(mockActionsStore.filter((a) => a.incident_id === incidentId));
    }),
    createIncidentReport: jest
      .fn()
      .mockImplementation(
        (incidentId: string, submittedBy: string, reportDetails: string, witnesses: any[] = []) => {
          const report = {
            id: `rep-${mockReportsStore.length + 1}`,
            incident_id: incidentId,
            submitted_by: submittedBy,
            report_details: reportDetails,
            witnesses,
            created_at: new Date().toISOString(),
          };
          mockReportsStore.push(report);
          return Promise.resolve(report);
        },
      ),
    findReportsByIncidentId: jest.fn().mockImplementation((incidentId: string) => {
      return Promise.resolve(mockReportsStore.filter((r) => r.incident_id === incidentId));
    }),
    validateUserExistsAndStaff: jest.fn().mockImplementation((userId: string) => {
      if (userId === safetyOfficerId) {
        return Promise.resolve({
          exists: true,
          isStaff: true,
          user: {
            id: safetyOfficerId,
            email: 'safety@movana.internal',
            fullName: 'Safety Officer Sam',
            roles: ['SAFETY_OFFICER'],
          },
        });
      }
      if (userId === adminId) {
        return Promise.resolve({
          exists: true,
          isStaff: true,
          user: {
            id: adminId,
            email: 'admin@movana.internal',
            fullName: 'Admin User',
            roles: ['ADMIN'],
          },
        });
      }
      if (userId === passengerId || userId === otherPassengerId) {
        return Promise.resolve({
          exists: true,
          isStaff: false,
          user: {
            id: userId,
            email: 'passenger@movana.internal',
            fullName: 'Passenger User',
            roles: ['PASSENGER'],
          },
        });
      }
      return Promise.resolve({ exists: false, isStaff: false });
    }),
    findIncidents: jest.fn().mockImplementation((filter: any) => {
      let filtered = [{ ...mockIncidentState }];
      if (filter.status) {
        filtered = filtered.filter((i) => i.status === filter.status);
      }
      return Promise.resolve({
        incidents: filtered,
        total: filtered.length,
      });
    }),
    getAssignment: jest.fn().mockImplementation((incidentId: string) => {
      return Promise.resolve(mockAssignmentsStore.get(incidentId) || null);
    }),
    saveAssignment: jest.fn().mockImplementation((assignment: any) => {
      mockAssignmentsStore.set(assignment.incidentId, assignment);
      return Promise.resolve();
    }),
  };

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockNotificationsService = {
    dispatch: jest.fn().mockResolvedValue({
      notification: { id: 'notif-1', status: 'QUEUED' },
      delivery: null,
    }),
  };

  beforeAll(async () => {
    resetMockState();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(IncidentManagementRepository)
      .useValue(mockIncidentManagementRepo)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(NotificationsService)
      .useValue(mockNotificationsService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = app.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: passengerId,
      email: 'alice@example.com',
      roles: ['PASSENGER'],
    });

    otherPassengerToken = jwtService.sign({
      sub: otherPassengerId,
      email: 'other@example.com',
      roles: ['PASSENGER'],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@example.com',
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

  beforeEach(() => {
    resetMockState();
  });

  describe('1. Authentication & Role-Based Access Control', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/incident-management').expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/incident-management/${testIncidentId}/lifecycle`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/assign`)
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/actions`)
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/resolve`)
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/close`)
        .send({})
        .expect(401);
    });

    it('should reject passenger from staff listing endpoint with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/incident-management')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should reject driver from staff listing endpoint with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/incident-management')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });

    it('should reject passenger from assigning investigator with 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/assign`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ assignedTo: safetyOfficerId })
        .expect(403);
    });

    it('should reject passenger from updating incident status with 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ status: 'INVESTIGATING' })
        .expect(403);
    });

    it('should reject passenger from recording actions with 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/actions`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ actionTaken: 'Arbitrary passenger note' })
        .expect(403);
    });

    it('should reject unrelated passenger from viewing incident lifecycle with 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/incident-management/${testIncidentId}/lifecycle`)
        .set('Authorization', `Bearer ${otherPassengerToken}`)
        .expect(403);
    });

    it('should allow the reporting passenger to view their incident lifecycle with 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/incident-management/${testIncidentId}/lifecycle`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.incident.id).toBe(testIncidentId);
      expect(res.body.timeline).toBeInstanceOf(Array);
      expect(res.body.timeline.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Investigator Assignment Workflow', () => {
    it('returns 404 if incident does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${nonExistentIncidentId}/assign`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ assignedTo: safetyOfficerId })
        .expect(404);
    });

    it('returns 400 when attempting to assign a non-staff user as investigator', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/assign`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ assignedTo: passengerId })
        .expect(400);
    });

    it('successfully assigns safety officer, auto-transitions OPEN to INVESTIGATING', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/assign`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          assignedTo: safetyOfficerId,
          assignmentNotes: 'Reviewing on-board camera records',
        })
        .expect(200);

      expect(res.body.incident.status).toBe('INVESTIGATING');
      expect(res.body.assignment.assignedTo).toBe(safetyOfficerId);
      expect(res.body.assignment.notes).toBe('Reviewing on-board camera records');
    });
  });

  describe('3. Legal State Machine Enforcement', () => {
    it('rejects illegal skip transition: OPEN -> RESOLVED with 400', async () => {
      mockIncidentState.status = 'OPEN';
      await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'RESOLVED' })
        .expect(400);
    });

    it('rejects illegal skip transition: OPEN -> CLOSED with 400', async () => {
      mockIncidentState.status = 'OPEN';
      await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'CLOSED' })
        .expect(400);
    });

    it('allows valid sequence: OPEN -> INVESTIGATING', async () => {
      mockIncidentState.status = 'OPEN';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'INVESTIGATING', notes: 'Safety officer initiated formal inquiry' })
        .expect(200);

      expect(res.body.status).toBe('INVESTIGATING');
    });

    it('allows valid sequence: INVESTIGATING -> ACTION_REQUIRED', async () => {
      mockIncidentState.status = 'INVESTIGATING';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'ACTION_REQUIRED', notes: 'Requires vehicle inspection before next trip' })
        .expect(200);

      expect(res.body.status).toBe('ACTION_REQUIRED');
    });

    it('rejects illegal transition: ACTION_REQUIRED -> CLOSED with 400', async () => {
      mockIncidentState.status = 'ACTION_REQUIRED';
      await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'CLOSED' })
        .expect(400);
    });

    it('allows valid transition: ACTION_REQUIRED -> RESOLVED', async () => {
      mockIncidentState.status = 'ACTION_REQUIRED';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'RESOLVED', notes: 'Vehicle inspected and repaired' })
        .expect(200);

      expect(res.body.status).toBe('RESOLVED');
      expect(res.body.resolved_at).toBeDefined();
    });

    it('allows valid transition: RESOLVED -> CLOSED', async () => {
      mockIncidentState.status = 'RESOLVED';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'CLOSED', notes: 'Operations audit sign-off' })
        .expect(200);

      expect(res.body.status).toBe('CLOSED');
    });

    it('forbids non-admin from reopening CLOSED -> INVESTIGATING with 403', async () => {
      mockIncidentState.status = 'CLOSED';
      await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'INVESTIGATING', notes: 'Attempt non-admin reopen' })
        .expect(403);
    });

    it('allows ADMIN to reopen CLOSED -> INVESTIGATING with 200', async () => {
      mockIncidentState.status = 'CLOSED';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/incident-management/${testIncidentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INVESTIGATING', notes: 'Reopened by executive audit' })
        .expect(200);

      expect(res.body.status).toBe('INVESTIGATING');
      expect(res.body.resolved_at).toBeNull();
    });
  });

  describe('4. Corrective Actions Recording', () => {
    it('creates corrective action for active incident with 201', async () => {
      mockIncidentState.status = 'ACTION_REQUIRED';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/actions`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          actionTaken: 'Driver suspended pending formal inquiry and safety refresher',
          status: 'COMPLETED',
        })
        .expect(201);

      expect(res.body.action_taken).toContain('Driver suspended');
      expect(res.body.status).toBe('COMPLETED');
    });

    it('rejects recording action on CLOSED incident with 400', async () => {
      mockIncidentState.status = 'CLOSED';
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/actions`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          actionTaken: 'Post-close attempt',
        })
        .expect(400);
    });
  });

  describe('5. Resolution & Closure Endpoints', () => {
    it('rejects resolve directly from OPEN status with 400', async () => {
      mockIncidentState.status = 'OPEN';
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/resolve`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          resolutionNotes: 'Premature resolution without investigation',
        })
        .expect(400);
    });

    it('resolves incident from INVESTIGATING with 200', async () => {
      mockIncidentState.status = 'INVESTIGATING';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/resolve`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          resolutionNotes: 'Full investigation complete: CCTV reviewed, conflict de-escalated',
          correctiveAction: 'Added security personnel to weekend evening shift',
        })
        .expect(200);

      expect(res.body.incident.status).toBe('RESOLVED');
      expect(res.body.incident.resolved_at).toBeDefined();
    });

    it('rejects close on non-RESOLVED incident with 400', async () => {
      mockIncidentState.status = 'INVESTIGATING';
      await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/close`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          notes: 'Closing directly from investigating',
        })
        .expect(400);
    });

    it('closes RESOLVED incident with 200', async () => {
      mockIncidentState.status = 'RESOLVED';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/incident-management/${testIncidentId}/close`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          notes: 'Case officially closed by safety supervisor',
        })
        .expect(200);

      expect(res.body.status).toBe('CLOSED');
    });
  });

  describe('6. Listing and Querying Incidents', () => {
    it('allows safety officer to query incidents with filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/incident-management')
        .query({ status: 'OPEN', limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      expect(res.body.incidents).toBeInstanceOf(Array);
      expect(res.body.total).toBeDefined();
      expect(res.body.limit).toBe(10);
      expect(res.body.offset).toBe(0);
    });
  });
});
