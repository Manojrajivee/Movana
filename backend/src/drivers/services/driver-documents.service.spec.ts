import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DriverDocumentsService } from './driver-documents.service';
import {
  DriverDocumentsRepository,
  DriverDocumentEntity,
  DriverDocumentTypeEntity,
} from '../repositories/driver-documents.repository';
import { DriversRepository, DriverEntity } from '../repositories/drivers.repository';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriverDocumentsService (Unit Tests)', () => {
  let service: DriverDocumentsService;
  let docsRepo: Record<keyof DriverDocumentsRepository, jest.Mock>;
  let driversRepo: Record<keyof DriversRepository, jest.Mock>;

  const driverUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'driver@movana.com',
    roles: ['DRIVER'],
    permissions: [],
  };

  const otherDriverUser: AuthenticatedUser = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'otherdriver@movana.com',
    roles: ['DRIVER'],
    permissions: [],
  };

  const safetyOfficer: AuthenticatedUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'safety@movana.com',
    roles: ['SAFETY_OFFICER'],
    permissions: ['drivers.verify'],
  };

  const mockDriver: DriverEntity = {
    id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
    userId: driverUser.id,
    employeeCode: 'EMP-001',
    licenseNumber: 'DL-KA-2020-001',
    licenseCategory: 'HEAVY_PASSENGER',
    licenseExpiryDate: '2030-12-31',
    dateOfJoining: '2024-01-01',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'PENDING',
    ratingAverage: 5.0,
    totalTrips: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockDocType: DriverDocumentTypeEntity = {
    id: '77777777-7777-4777-a777-777777777777',
    code: 'COMMERCIAL_LICENSE',
    name: 'Commercial Driving License',
    description: null,
    isMandatory: true,
    expires: true,
    createdAt: new Date(),
  };

  const mockDoc: DriverDocumentEntity = {
    id: 'ffffffff-ffff-4fff-afff-ffffffffffff',
    driverId: mockDriver.id,
    documentTypeId: mockDocType.id,
    documentNumber: 'DL-KA-2020-001',
    documentUrl: 'https://storage.movana.local/docs/driver/license.pdf',
    issuedDate: '2020-01-01',
    expiryDate: '2030-12-31',
    verificationStatus: 'PENDING',
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    documentType: {
      code: mockDocType.code,
      name: mockDocType.name,
      isMandatory: true,
      expires: true,
    },
  };

  beforeEach(async () => {
    docsRepo = {
      getDocumentTypes: jest.fn(),
      findDocumentTypeById: jest.fn(),
      upsertDocument: jest.fn(),
      findDocumentsByDriverId: jest.fn(),
      findDocumentById: jest.fn(),
      recordVerification: jest.fn(),
    };

    driversRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByEmployeeCode: jest.fn(),
      findByLicenseNumber: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverDocumentsService,
        { provide: DriverDocumentsRepository, useValue: docsRepo },
        { provide: DriversRepository, useValue: driversRepo },
      ],
    }).compile();

    service = module.get<DriverDocumentsService>(DriverDocumentsService);
  });

  describe('getDocumentTypes', () => {
    it('should return all document types', async () => {
      docsRepo.getDocumentTypes.mockResolvedValue([mockDocType]);
      const res = await service.getDocumentTypes();
      expect(res).toEqual([mockDocType]);
    });
  });

  describe('registerDocument', () => {
    const validDto = {
      documentTypeId: mockDocType.id,
      documentNumber: 'DL-KA-2020-001',
      documentUrl: 'https://storage.movana.local/docs/driver/license.pdf',
      issuedDate: '2020-01-01',
      expiryDate: '2030-12-31',
    };

    it('should register document successfully when valid', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);
      docsRepo.findDocumentTypeById.mockResolvedValue(mockDocType);
      docsRepo.upsertDocument.mockResolvedValue(mockDoc);

      const res = await service.registerDocument(mockDriver.id, validDto, driverUser);
      expect(res).toEqual(mockDoc);
      expect(docsRepo.upsertDocument).toHaveBeenCalledWith(mockDriver.id, validDto);
    });

    it('should throw ForbiddenException if user is not driver owner and not staff', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);

      await expect(
        service.registerDocument(mockDriver.id, validDto, otherDriverUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if document type expires but expiry date is in past', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);
      docsRepo.findDocumentTypeById.mockResolvedValue(mockDocType);

      await expect(
        service.registerDocument(
          mockDriver.id,
          { ...validDto, expiryDate: '2020-01-01' },
          driverUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if driver does not exist', async () => {
      driversRepo.findById.mockResolvedValue(null);

      await expect(
        service.registerDocument('missing-driver-id', validDto, driverUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyDocument (Separation of Duties)', () => {
    it('should allow SAFETY_OFFICER to verify document', async () => {
      docsRepo.findDocumentById.mockResolvedValue(mockDoc);
      driversRepo.findById.mockResolvedValue(mockDriver);
      docsRepo.recordVerification.mockResolvedValue({
        ...mockDoc,
        verificationStatus: 'VERIFIED',
      });

      const res = await service.verifyDocument(
        mockDoc.id,
        { status: 'VERIFIED', notes: 'Clear scanned copy' },
        safetyOfficer,
      );

      expect(res.verificationStatus).toBe('VERIFIED');
      expect(docsRepo.recordVerification).toHaveBeenCalledWith(
        mockDoc.id,
        'VERIFIED',
        safetyOfficer.id,
        undefined,
        'Clear scanned copy',
      );
    });

    it('should strictly reject driver verifying their own document (separation of duties violation)', async () => {
      docsRepo.findDocumentById.mockResolvedValue(mockDoc);
      driversRepo.findById.mockResolvedValue(mockDriver);

      // Attempt by the driver himself to verify his document
      await expect(
        service.verifyDocument(mockDoc.id, { status: 'VERIFIED' }, driverUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
