import { Test, TestingModule } from '@nestjs/testing';
import { DriverDocumentsController } from './driver-documents.controller';
import { DriverDocumentsService } from '../services/driver-documents.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriverDocumentsController (Unit Tests)', () => {
  let controller: DriverDocumentsController;
  let service: jest.Mocked<Partial<DriverDocumentsService>>;

  const mockUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'safety@movana.com',
    roles: ['SAFETY_OFFICER'],
    permissions: [],
  };

  const mockDoc: any = {
    id: 'ffffffff-ffff-4fff-afff-ffffffffffff',
    driverId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
    documentTypeId: '77777777-7777-4777-a777-777777777777',
    documentNumber: 'DL-001',
    verificationStatus: 'PENDING',
  };

  beforeEach(async () => {
    service = {
      getDocumentTypes: jest.fn().mockResolvedValue([]),
      registerDocument: jest.fn().mockResolvedValue(mockDoc),
      getDocumentsForDriver: jest.fn().mockResolvedValue([mockDoc]),
      getDocumentById: jest.fn().mockResolvedValue(mockDoc),
      verifyDocument: jest.fn().mockResolvedValue({ ...mockDoc, verificationStatus: 'VERIFIED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverDocumentsController],
      providers: [{ provide: DriverDocumentsService, useValue: service }],
    }).compile();

    controller = module.get<DriverDocumentsController>(DriverDocumentsController);
  });

  it('getDocumentTypes should delegate to service', async () => {
    await controller.getDocumentTypes();
    expect(service.getDocumentTypes).toHaveBeenCalled();
  });

  it('registerDocument should delegate to service', async () => {
    const dto = {
      documentTypeId: '77777777-7777-4777-a777-777777777777',
      documentNumber: 'DL-001',
      documentUrl: 'https://example.com/doc.pdf',
    };
    const res = await controller.registerDocument(mockDoc.driverId, dto, mockUser);
    expect(res).toEqual(mockDoc);
    expect(service.registerDocument).toHaveBeenCalledWith(mockDoc.driverId, dto, mockUser);
  });

  it('getDocumentsForDriver should delegate to service', async () => {
    const res = await controller.getDocumentsForDriver(mockDoc.driverId, mockUser);
    expect(res).toEqual([mockDoc]);
    expect(service.getDocumentsForDriver).toHaveBeenCalledWith(mockDoc.driverId, mockUser);
  });

  it('getDocumentById should delegate to service', async () => {
    const res = await controller.getDocumentById(mockDoc.id, mockUser);
    expect(res).toEqual(mockDoc);
    expect(service.getDocumentById).toHaveBeenCalledWith(mockDoc.id, mockUser);
  });

  it('verifyDocument should delegate to service', async () => {
    const dto = { status: 'VERIFIED' as const, notes: 'Verified' };
    const res = await controller.verifyDocument(mockDoc.id, dto, mockUser);
    expect(res.verificationStatus).toBe('VERIFIED');
    expect(service.verifyDocument).toHaveBeenCalledWith(mockDoc.id, dto, mockUser);
  });
});
