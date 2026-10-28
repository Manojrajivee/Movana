import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { RealTimeService } from '../../real-time/services/real-time.service';
import { RedisService } from '../../redis/redis.service';
import {
  EmergencyContactEntity,
  EmergencyEventEntity,
  SosRepository,
} from '../repositories/sos.repository';
import { SosService } from './sos.service';

describe('SosService', () => {
  let service: SosService;
  let repository: jest.Mocked<SosRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let realTimeService: jest.Mocked<RealTimeService>;
  let redisService: jest.Mocked<RedisService>;

  const passengerUser = {
    id: 'user-1111-1111-1111-111111111111',
    roles: ['PASSENGER'],
  };
  const otherPassenger = {
    id: 'user-2222-2222-2222-222222222222',
    roles: ['PASSENGER'],
  };
  const safetyOfficerUser = {
    id: 'user-3333-3333-3333-333333333333',
    roles: ['SAFETY_OFFICER'],
  };
  const operatorUser = {
    id: 'user-4444-4444-4444-444444444444',
    roles: ['OPERATOR'],
  };

  const tripId = 'trip-1111-1111-1111-111111111111';
  const vehicleId = 'veh-1111-1111-1111-111111111111';
  const driverId = 'drv-1111-1111-1111-111111111111';
  const eventId = 'sos-1111-1111-1111-111111111111';

  const mockEmergencyEvent: EmergencyEventEntity = {
    id: eventId,
    trip_id: tripId,
    vehicle_id: vehicleId,
    driver_id: driverId,
    user_id: passengerUser.id,
    emergency_type: 'SOS_BUTTON',
    latitude: 13.0827,
    longitude: 80.2707,
    status: 'TRIGGERED',
    triggered_at: '2026-10-28T10:00:00.000Z',
    resolved_at: null,
    created_at: '2026-10-28T10:00:00.000Z',
  };

  const mockContact: EmergencyContactEntity = {
    id: 'contact-1111-1111-1111-111111111111',
    user_id: passengerUser.id,
    name: 'Jane Doe',
    relationship: 'Spouse',
    phone: '+919876543210',
    email: 'jane@example.com',
    is_primary: true,
    created_at: '2026-10-28T09:00:00.000Z',
    updated_at: '2026-10-28T09:00:00.000Z',
  };

  beforeEach(async () => {
    const mockRepo = {
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
        if (id === mockContact.id) return Promise.resolve(mockContact);
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
      publishToRoom: jest.fn().mockResolvedValue({
        deliveredLocally: true,
        room: 'operations',
        event: 'emergency_alert',
      }),
    };

    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SosService,
        { provide: SosRepository, useValue: mockRepo },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: RealTimeService, useValue: mockRealTime },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SosService>(SosService);
    repository = module.get(SosRepository);
    notificationsService = module.get(NotificationsService);
    realTimeService = module.get(RealTimeService);
    redisService = module.get(RedisService);
  });

  describe('triggerSos', () => {
    it('should throw NotFoundException if trip does not exist', async () => {
      repository.validateTripExists.mockResolvedValueOnce(false);
      await expect(
        service.triggerSos(
          {
            tripId: 'nonexistent-trip',
            vehicleId,
            latitude: 13.0827,
            longitude: 80.2707,
          },
          passengerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      repository.validateVehicleExists.mockResolvedValueOnce(false);
      await expect(
        service.triggerSos(
          {
            tripId,
            vehicleId: 'nonexistent-vehicle',
            latitude: 13.0827,
            longitude: 80.2707,
          },
          passengerUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should successfully trigger SOS, broadcast real-time alert, and dispatch notifications to contacts', async () => {
      const result = await service.triggerSos(
        {
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
          emergencyType: 'SOS_BUTTON',
        },
        passengerUser,
      );

      expect(result.event).toBeDefined();
      expect(result.event.status).toBe('TRIGGERED');
      expect(result.contactsNotified).toBe(1);
      expect(result.duplicateSuppressed).toBe(false);

      expect(realTimeService.publishToRoom).toHaveBeenCalledWith(
        'operations',
        'emergency_alert',
        expect.objectContaining({ eventId, userId: passengerUser.id }),
      );
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'SECURITY_ALERT',
          recipientAddress: mockContact.phone,
        }),
        passengerUser,
      );
    });

    it('should resolve driverId from trip if not explicitly provided in DTO', async () => {
      await service.triggerSos(
        {
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
        },
        passengerUser,
      );

      expect(repository.resolveDriverIdForTrip).toHaveBeenCalledWith(tripId);
      expect(repository.createEmergencyEvent).toHaveBeenCalledWith(
        expect.anything(),
        passengerUser.id,
        driverId,
      );
    });

    it('should suppress duplicate trigger if within Redis throttle window and return active event', async () => {
      redisService.get.mockResolvedValueOnce(eventId);

      const result = await service.triggerSos(
        {
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
        },
        passengerUser,
      );

      expect(result.duplicateSuppressed).toBe(true);
      expect(result.event.id).toBe(eventId);
      expect(repository.createEmergencyEvent).not.toHaveBeenCalled();
    });

    it('should handle Redis outage gracefully (fail-open) and still create the emergency event', async () => {
      redisService.get.mockRejectedValueOnce(new Error('Redis connection timeout'));

      const result = await service.triggerSos(
        {
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
        },
        passengerUser,
      );

      expect(result.event).toBeDefined();
      expect(result.duplicateSuppressed).toBe(false);
      expect(repository.createEmergencyEvent).toHaveBeenCalled();
    });

    it('should handle notification failure gracefully without failing the SOS trigger', async () => {
      notificationsService.dispatch.mockRejectedValueOnce(new Error('SMS provider failure'));

      const result = await service.triggerSos(
        {
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
        },
        passengerUser,
      );

      expect(result.event).toBeDefined();
      expect(result.contactsNotified).toBe(0);
    });

    it('should skip contact notification if notifyContacts is false', async () => {
      const result = await service.triggerSos(
        {
          tripId,
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
          notifyContacts: false,
        },
        passengerUser,
      );

      expect(result.event).toBeDefined();
      expect(result.contactsNotified).toBe(0);
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('getActiveEmergencies', () => {
    it('should throw ForbiddenException if caller is not staff', async () => {
      await expect(service.getActiveEmergencies(passengerUser)).rejects.toThrow(ForbiddenException);
    });

    it('should return active emergency events for SAFETY_OFFICER', async () => {
      const events = await service.getActiveEmergencies(safetyOfficerUser);
      expect(events).toHaveLength(1);
      expect(repository.findActiveEmergencyEvents).toHaveBeenCalled();
    });
  });

  describe('getEmergencyById', () => {
    it('should throw NotFoundException if event does not exist', async () => {
      await expect(service.getEmergencyById('missing-id', passengerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if non-owner passenger views emergency', async () => {
      await expect(service.getEmergencyById(eventId, otherPassenger)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow owner passenger to view their emergency', async () => {
      const event = await service.getEmergencyById(eventId, passengerUser);
      expect(event.id).toBe(eventId);
    });

    it('should allow OPERATOR to view any emergency', async () => {
      const event = await service.getEmergencyById(eventId, operatorUser);
      expect(event.id).toBe(eventId);
    });
  });

  describe('updateEmergencyStatus', () => {
    it('should throw ForbiddenException if caller is not staff', async () => {
      await expect(
        service.updateEmergencyStatus(eventId, { status: 'DISPATCHED' }, passengerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if event does not exist', async () => {
      await expect(
        service.updateEmergencyStatus('missing-id', { status: 'DISPATCHED' }, safetyOfficerUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should transition status from TRIGGERED to DISPATCHED', async () => {
      const updated = await service.updateEmergencyStatus(
        eventId,
        { status: 'DISPATCHED' },
        safetyOfficerUser,
      );
      expect(updated.status).toBe('DISPATCHED');
      expect(repository.updateEmergencyStatus).toHaveBeenCalledWith(eventId, 'DISPATCHED', null);
    });

    it('should transition status to RESOLVED and set resolvedAt', async () => {
      const updated = await service.updateEmergencyStatus(
        eventId,
        { status: 'RESOLVED' },
        safetyOfficerUser,
      );
      expect(updated.status).toBe('RESOLVED');
      expect(repository.updateEmergencyStatus).toHaveBeenCalledWith(
        eventId,
        'RESOLVED',
        expect.any(String),
      );
    });

    it('should transition status to FALSE_ALARM and set resolvedAt', async () => {
      const updated = await service.updateEmergencyStatus(
        eventId,
        { status: 'FALSE_ALARM' },
        safetyOfficerUser,
      );
      expect(updated.status).toBe('FALSE_ALARM');
      expect(repository.updateEmergencyStatus).toHaveBeenCalledWith(
        eventId,
        'FALSE_ALARM',
        expect.any(String),
      );
    });

    it('should throw ConflictException if event is already in terminal state RESOLVED', async () => {
      repository.findEmergencyEventById.mockResolvedValueOnce({
        ...mockEmergencyEvent,
        status: 'RESOLVED',
        resolved_at: '2026-10-28T10:15:00.000Z',
      });

      await expect(
        service.updateEmergencyStatus(eventId, { status: 'DISPATCHED' }, safetyOfficerUser),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Emergency Contacts', () => {
    it('should add emergency contact for passenger', async () => {
      const contact = await service.addEmergencyContact(
        {
          name: 'Jane Doe',
          relationship: 'Spouse',
          phone: '+919876543210',
          isPrimary: true,
        },
        passengerUser,
      );
      expect(contact).toBeDefined();
      expect(repository.createEmergencyContact).toHaveBeenCalledWith(
        passengerUser.id,
        expect.anything(),
      );
    });

    it('should list emergency contacts for passenger', async () => {
      const contacts = await service.getEmergencyContacts(passengerUser);
      expect(contacts).toHaveLength(1);
      expect(repository.findContactsByUserId).toHaveBeenCalledWith(passengerUser.id);
    });

    it('should throw NotFoundException if contact to delete is not found', async () => {
      repository.findContactById.mockResolvedValueOnce(null);
      await expect(
        service.deleteEmergencyContact('missing-contact', passengerUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-owner passenger attempts to delete contact', async () => {
      await expect(service.deleteEmergencyContact(mockContact.id, otherPassenger)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow owner to delete emergency contact', async () => {
      const result = await service.deleteEmergencyContact(mockContact.id, passengerUser);
      expect(result.success).toBe(true);
      expect(repository.deleteContact).toHaveBeenCalledWith(mockContact.id, passengerUser.id);
    });
  });
});
