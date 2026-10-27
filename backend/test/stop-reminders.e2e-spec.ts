import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { StopRemindersRepository } from '../src/stop-reminders/repositories/stop-reminders.repository';

describe('Stop Reminders (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let driverToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const driverUserId = '22222222-2222-4222-a222-222222222222';
  const passengerUserId = '33333333-3333-4333-a333-333333333333';

  const testTripId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const testStopId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const testReminderId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

  const mockReminderData = {
    id: testReminderId,
    userId: passengerUserId,
    tripId: testTripId,
    tripNumber: 'TRIP-DEL-JPR-201',
    targetStopId: testStopId,
    targetStopName: 'Gurgaon Cyber Hub',
    targetSequenceNumber: 2,
    reminderType: 'STOPS_BEFORE' as const,
    reminderValue: 1,
    notifyChannel: 'IN_APP' as const,
    isTriggered: false,
    triggeredAt: null,
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

  const mockStopRemindersRepository = {
    findTripInfo: jest.fn().mockResolvedValue({
      id: testTripId,
      trip_number: 'TRIP-DEL-JPR-201',
      status: 'IN_TRANSIT',
      current_stop_id: 'stop-1',
    }),
    findTripStop: jest.fn().mockResolvedValue({
      id: 'ts-2',
      trip_id: testTripId,
      stop_id: testStopId,
      sequence_number: 2,
      stop_name: 'Gurgaon Cyber Hub',
      status: 'PENDING',
      scheduled_arrival_at: new Date(Date.now() + 15 * 60000),
    }),
    findAllTripStops: jest.fn().mockResolvedValue([
      { stop_id: 'stop-1', sequence_number: 1, status: 'ARRIVED' },
      { stop_id: testStopId, sequence_number: 2, status: 'PENDING' },
    ]),
    saveReminder: jest.fn().mockResolvedValue(undefined),
    findReminderById: jest.fn().mockResolvedValue(mockReminderData),
    findUserReminders: jest.fn().mockResolvedValue([mockReminderData]),
    findTripReminders: jest.fn().mockResolvedValue([mockReminderData]),
    deleteReminder: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(StopRemindersRepository)
      .useValue(mockStopRemindersRepository)
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

  describe('POST /api/v1/stop-reminders', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stop-reminders')
        .send({
          tripId: testTripId,
          targetStopId: testStopId,
          reminderType: 'STOPS_BEFORE',
        })
        .expect(401);
    });

    it('should reject invalid reminderType with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stop-reminders')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId: testTripId,
          targetStopId: testStopId,
          reminderType: 'INVALID_TYPE',
        })
        .expect(400);
    });

    it('should create stop reminder for passenger with 201 Created', async () => {
      mockStopRemindersRepository.findUserReminders.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/stop-reminders')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId: testTripId,
          targetStopId: testStopId,
          reminderType: 'STOPS_BEFORE',
          reminderValue: 1,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.targetStopName).toBe('Gurgaon Cyber Hub');
    });
  });

  describe('GET /api/v1/stop-reminders/me', () => {
    it('should return list of user stop reminders with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stop-reminders/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(testReminderId);
    });
  });

  describe('GET /api/v1/stop-reminders/:id', () => {
    it('should return 404 if reminder not found', async () => {
      mockStopRemindersRepository.findReminderById.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/api/v1/stop-reminders/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return reminder details with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stop-reminders/${testReminderId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(testReminderId);
    });
  });

  describe('DELETE /api/v1/stop-reminders/:id', () => {
    it('should delete reminder with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/stop-reminders/${testReminderId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/stop-reminders/evaluate/:tripId', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/stop-reminders/evaluate/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow driver or operator to evaluate alarms with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/stop-reminders/evaluate/${testTripId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.evaluatedCount).toBeDefined();
      expect(Array.isArray(res.body.alarms)).toBe(true);
    });

    it('should allow operator to evaluate alarms with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/stop-reminders/evaluate/${testTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.evaluatedCount).toBeDefined();
    });
  });
});
