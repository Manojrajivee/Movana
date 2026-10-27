import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { DriversRepository } from '../src/drivers/repositories/drivers.repository';
import { DriverDocumentsRepository } from '../src/drivers/repositories/driver-documents.repository';

describe('Driver Documents (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let driverToken: string;
  let otherDriverToken: string;
  let safetyOfficerToken: string;
  let passengerToken: string;

  const driverUserId = '11111111-1111-4111-a111-111111111111';
  const driverId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const otherDriverUserId = '22222222-2222-4222-a222-222222222222';
  const safetyOfficerId = '33333333-3333-4333-a333-333333333333';
  const passengerUserId = '44444444-4444-4444-a444-444444444444';

  const docTypeId = '77777777-7777-4777-a777-777777777777';
  const docId = 'ffffffff-ffff-4fff-afff-ffffffffffff';

  const mockDriver: any = {
    id: driverId,
    userId: driverUserId,
    employeeCode: 'EMP-001',
    licenseNumber: 'DL-001',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'PENDING',
  };

  const mockDocType: any = {
    id: docTypeId,
    code: 'COMMERCIAL_LICENSE',
    name: 'Commercial Driving License',
    isMandatory: true,
    expires: true,
  };

  const mockDocument: any = {
    id: docId,
    driverId,
    documentTypeId: docTypeId,
    documentNumber: 'DL-KA-001',
    documentUrl: 'https://storage.movana.local/licenses/dl.pdf',
    issuedDate: '2020-01-01',
    expiryDate: '2030-12-31',
    verificationStatus: 'PENDING',
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    documentType: mockDocType,
  };

  const mockDriversRepo = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
  };

  const mockDocsRepo = {
    getDocumentTypes: jest.fn(),
    findDocumentTypeById: jest.fn(),
    upsertDocument: jest.fn(),
    findDocumentsByDriverId: jest.fn(),
    findDocumentById: jest.fn(),
    recordVerification: jest.fn(),
  };

  const mockDatabaseService = {
    checkHealth: jest.fn().mockResolvedValue({ status: 'up' }),
    closePool: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedisService = {
    checkHealth: jest.fn().mockResolvedValue({ status: 'up' }),
    closeClient: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3005';
    process.env.DATABASE_NAME = 'movana';
    process.env.DATABASE_USER = 'movana_app';
    process.env.DATABASE_PASSWORD = 'TestIntegrationSecretPassword123!';
    process.env.REDIS_REQUIRED_FOR_READY = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(DriversRepository)
      .useValue(mockDriversRepo)
      .overrideProvider(DriverDocumentsRepository)
      .useValue(mockDocsRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    driverToken = await jwtService.signAsync({
      sub: driverUserId,
      email: 'driver@movana.test',
      roles: ['DRIVER'],
      permissions: [],
    });

    otherDriverToken = await jwtService.signAsync({
      sub: otherDriverUserId,
      email: 'otherdriver@movana.test',
      roles: ['DRIVER'],
      permissions: [],
    });

    safetyOfficerToken = await jwtService.signAsync({
      sub: safetyOfficerId,
      email: 'safety@movana.test',
      roles: ['SAFETY_OFFICER'],
      permissions: ['drivers.verify'],
    });

    passengerToken = await jwtService.signAsync({
      sub: passengerUserId,
      email: 'passenger@movana.test',
      roles: ['PASSENGER'],
      permissions: [],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/drivers/document-types', () => {
    it('should return list of document types for authenticated user (200 OK)', async () => {
      mockDocsRepo.getDocumentTypes.mockResolvedValue([mockDocType]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/document-types')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].code).toBe('COMMERCIAL_LICENSE');
    });
  });

  describe('POST /api/v1/drivers/:driverId/documents', () => {
    const validPayload = {
      documentTypeId: docTypeId,
      documentNumber: 'DL-KA-001',
      documentUrl: 'https://storage.movana.local/licenses/dl.pdf',
      issuedDate: '2020-01-01',
      expiryDate: '2030-12-31',
    };

    it('should allow driver to upload their own document (201 Created)', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockDocsRepo.findDocumentTypeById.mockResolvedValue(mockDocType);
      mockDocsRepo.upsertDocument.mockResolvedValue(mockDocument);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validPayload)
        .expect(201);

      expect(res.body.documentNumber).toBe('DL-KA-001');
    });

    it('should return 403 Forbidden when another driver tries to upload documents', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .send(validPayload)
        .expect(403);
    });

    it('should return 400 Bad Request on past expiry date', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockDocsRepo.findDocumentTypeById.mockResolvedValue(mockDocType);

      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/documents`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ ...validPayload, expiryDate: '2020-01-01' })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/drivers/documents/:documentId/verify (Separation of Duties)', () => {
    it('should allow SAFETY_OFFICER to verify document (200 OK)', async () => {
      mockDocsRepo.findDocumentById.mockResolvedValue(mockDocument);
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockDocsRepo.recordVerification.mockResolvedValue({
        ...mockDocument,
        verificationStatus: 'VERIFIED',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/documents/${docId}/verify`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'VERIFIED', notes: 'Legitimate document' })
        .expect(200);

      expect(res.body.verificationStatus).toBe('VERIFIED');
    });

    it('should return 403 Forbidden when driver attempts to verify their own document', async () => {
      mockDocsRepo.findDocumentById.mockResolvedValue(mockDocument);
      mockDriversRepo.findById.mockResolvedValue(mockDriver);

      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/documents/${docId}/verify`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'VERIFIED' })
        .expect(403);
    });

    it('should return 403 Forbidden when a passenger tries to verify a document', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/documents/${docId}/verify`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ status: 'VERIFIED' })
        .expect(403);
    });

    it('should return 400 Bad Request if status is REJECTED but no reason is given', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/documents/${docId}/verify`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ status: 'REJECTED' })
        .expect(400);
    });
  });
});
