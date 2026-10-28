import { Test, TestingModule } from '@nestjs/testing';
import { SosService } from '../services/sos.service';
import { SosController } from './sos.controller';

describe('SosController', () => {
  let controller: SosController;
  let service: jest.Mocked<SosService>;

  const mockUser = {
    id: 'user-1111-1111-1111-111111111111',
    roles: ['PASSENGER'],
  };

  const tripId = '11111111-1111-4111-a111-111111111111';
  const vehicleId = '22222222-2222-4222-a222-222222222222';
  const eventId = '33333333-3333-4333-a333-333333333333';

  const mockEmergencyEvent = {
    id: eventId,
    trip_id: tripId,
    vehicle_id: vehicleId,
    driver_id: null,
    user_id: mockUser.id,
    emergency_type: 'SOS_BUTTON',
    latitude: 13.0827,
    longitude: 80.2707,
    status: 'TRIGGERED' as const,
    triggered_at: '2026-10-28T10:00:00.000Z',
    resolved_at: null,
    created_at: '2026-10-28T10:00:00.000Z',
  };

  const mockContact = {
    id: '44444444-4444-4444-a444-444444444444',
    user_id: mockUser.id,
    name: 'Jane Doe',
    relationship: 'Spouse',
    phone: '+919876543210',
    email: 'jane@example.com',
    is_primary: true,
    created_at: '2026-10-28T09:00:00.000Z',
    updated_at: '2026-10-28T09:00:00.000Z',
  };

  beforeEach(async () => {
    const mockSosService = {
      triggerSos: jest.fn().mockResolvedValue({
        event: mockEmergencyEvent,
        contactsNotified: 1,
        duplicateSuppressed: false,
      }),
      getActiveEmergencies: jest.fn().mockResolvedValue([mockEmergencyEvent]),
      getEmergencyById: jest.fn().mockResolvedValue(mockEmergencyEvent),
      updateEmergencyStatus: jest.fn().mockResolvedValue({
        ...mockEmergencyEvent,
        status: 'DISPATCHED',
      }),
      addEmergencyContact: jest.fn().mockResolvedValue(mockContact),
      getEmergencyContacts: jest.fn().mockResolvedValue([mockContact]),
      deleteEmergencyContact: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SosController],
      providers: [{ provide: SosService, useValue: mockSosService }],
    }).compile();

    controller = module.get<SosController>(SosController);
    service = module.get(SosService);
  });

  describe('triggerSos', () => {
    it('should parse body and call service.triggerSos', async () => {
      const payload = {
        tripId,
        vehicleId,
        latitude: 13.0827,
        longitude: 80.2707,
      };
      const result = await controller.triggerSos(payload, mockUser);
      expect(result.event).toBeDefined();
      expect(service.triggerSos).toHaveBeenCalledWith(expect.objectContaining(payload), mockUser);
    });
  });

  describe('getActiveEmergencies', () => {
    it('should call service.getActiveEmergencies', async () => {
      const result = await controller.getActiveEmergencies(mockUser);
      expect(result).toHaveLength(1);
      expect(service.getActiveEmergencies).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('getEmergencyById', () => {
    it('should call service.getEmergencyById', async () => {
      const result = await controller.getEmergencyById(eventId, mockUser);
      expect(result.id).toBe(eventId);
      expect(service.getEmergencyById).toHaveBeenCalledWith(eventId, mockUser);
    });
  });

  describe('updateEmergencyStatus', () => {
    it('should parse status and call service.updateEmergencyStatus', async () => {
      const result = await controller.updateEmergencyStatus(
        eventId,
        { status: 'DISPATCHED' },
        mockUser,
      );
      expect(result.status).toBe('DISPATCHED');
      expect(service.updateEmergencyStatus).toHaveBeenCalledWith(
        eventId,
        { status: 'DISPATCHED' },
        mockUser,
      );
    });
  });

  describe('Contacts', () => {
    it('should call service.getEmergencyContacts', async () => {
      const result = await controller.getEmergencyContacts(mockUser);
      expect(result).toHaveLength(1);
      expect(service.getEmergencyContacts).toHaveBeenCalledWith(mockUser);
    });

    it('should parse and call service.addEmergencyContact', async () => {
      const payload = {
        name: 'Jane Doe',
        relationship: 'Spouse',
        phone: '+919876543210',
      };
      const result = await controller.addEmergencyContact(payload, mockUser);
      expect(result.name).toBe('Jane Doe');
      expect(service.addEmergencyContact).toHaveBeenCalledWith(
        expect.objectContaining(payload),
        mockUser,
      );
    });

    it('should call service.deleteEmergencyContact', async () => {
      const result = await controller.deleteEmergencyContact(mockContact.id, mockUser);
      expect(result.success).toBe(true);
      expect(service.deleteEmergencyContact).toHaveBeenCalledWith(mockContact.id, mockUser);
    });
  });
});
