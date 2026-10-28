import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AlertRulesRepository } from '../repositories/alert-rules.repository';
import { AlertRulesService } from './alert-rules.service';

describe('AlertRulesService', () => {
  let service: AlertRulesService;
  let repository: jest.Mocked<AlertRulesRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const routeId = '22222222-2222-4222-a222-222222222222';
  const tripId = '33333333-3333-4333-a333-333333333333';
  const ruleId = 'rule-1111-1111-1111-111111111111';

  const mockPassenger = {
    id: userId,
    roles: ['PASSENGER'],
  };

  const mockAdmin = {
    id: 'admin-id',
    roles: ['ADMIN'],
  };

  const mockRule = {
    id: ruleId,
    name: 'Major Delay Warning',
    eventType: 'TRIP_DELAY_DETECTED' as const,
    scope: 'PERSONAL' as const,
    conditions: {
      thresholdMinutes: 10,
      routeId,
    },
    channels: ['IN_APP' as const, 'SMS' as const],
    targetUserId: userId,
    isActive: true,
    cooldownMinutes: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      saveRule: jest.fn(),
      findRuleById: jest.fn(),
      findRulesByUserId: jest.fn(),
      findActiveRulesByEventType: jest.fn(),
      deleteRule: jest.fn(),
      isDeduplicated: jest.fn(),
      validateRouteExists: jest.fn(),
      validateStopExists: jest.fn(),
      validateGeofenceExists: jest.fn(),
      validateVehicleExists: jest.fn(),
      validateUserExists: jest.fn(),
    };

    const mockNotifService = {
      dispatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertRulesService,
        { provide: AlertRulesRepository, useValue: mockRepo },
        { provide: NotificationsService, useValue: mockNotifService },
      ],
    }).compile();

    service = module.get<AlertRulesService>(AlertRulesService);
    repository = module.get(AlertRulesRepository);
    notificationsService = module.get(NotificationsService);
  });

  describe('createRule', () => {
    it('should successfully create a personal alert rule', async () => {
      repository.validateRouteExists.mockResolvedValue(true);
      repository.saveRule.mockImplementation((r) => Promise.resolve(r));

      const result = await service.createRule(
        {
          name: 'Major Delay Warning',
          eventType: 'TRIP_DELAY_DETECTED',
          scope: 'PERSONAL',
          conditions: {
            thresholdMinutes: 10,
            routeId,
          },
          channels: ['IN_APP'],
        },
        mockPassenger,
      );

      expect(result.id).toBeDefined();
      expect(result.targetUserId).toBe(userId);
      expect(result.eventType).toBe('TRIP_DELAY_DETECTED');
      expect(repository.saveRule).toHaveBeenCalled();
    });

    it('should reject passenger creating SYSTEM rule with ForbiddenException', async () => {
      await expect(
        service.createRule(
          {
            name: 'System Fleet Warning',
            eventType: 'VEHICLE_SPEED_EXCEEDED',
            scope: 'SYSTEM',
            channels: ['IN_APP'],
          },
          mockPassenger,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if referenced route does not exist', async () => {
      repository.validateRouteExists.mockResolvedValue(false);

      await expect(
        service.createRule(
          {
            name: 'Invalid Route Rule',
            eventType: 'TRIP_DELAY_DETECTED',
            conditions: { routeId: '00000000-0000-4000-a000-000000000000' },
            channels: ['IN_APP'],
          },
          mockPassenger,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserRules and getRuleById', () => {
    it('should return list of user rules', async () => {
      repository.findRulesByUserId.mockResolvedValue([mockRule]);

      const result = await service.getUserRules(mockPassenger);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ruleId);
    });

    it('should prevent passenger from accessing another user rule by ID', async () => {
      repository.findRuleById.mockResolvedValue({
        ...mockRule,
        targetUserId: 'other-user',
      });

      await expect(service.getRuleById(ruleId, mockPassenger)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateRule and toggleRuleActive', () => {
    it('should update rule fields', async () => {
      repository.findRuleById.mockResolvedValue(mockRule);
      repository.saveRule.mockImplementation((r) => Promise.resolve(r));

      const result = await service.updateRule(ruleId, { name: 'Updated Rule Name' }, mockPassenger);

      expect(result.name).toBe('Updated Rule Name');
    });

    it('should toggle rule active status', async () => {
      repository.findRuleById.mockResolvedValue(mockRule);
      repository.saveRule.mockImplementation((r) => Promise.resolve(r));

      const result = await service.toggleRuleActive(ruleId, false, mockPassenger);
      expect(result.isActive).toBe(false);
    });
  });

  describe('deleteRule', () => {
    it('should delete rule', async () => {
      repository.findRuleById.mockResolvedValue(mockRule);
      repository.deleteRule.mockResolvedValue(true);

      const result = await service.deleteRule(ruleId, mockPassenger);
      expect(result.success).toBe(true);
      expect(repository.deleteRule).toHaveBeenCalledWith(mockRule);
    });
  });

  describe('evaluateEvent', () => {
    it('should evaluate matching event and dispatch notification', async () => {
      repository.findActiveRulesByEventType.mockResolvedValue([mockRule]);
      repository.isDeduplicated.mockResolvedValue(false);
      notificationsService.dispatch.mockResolvedValue({
        notification: {} as any,
        delivery: {} as any,
      });

      const result = await service.evaluateEvent(
        {
          eventType: 'TRIP_DELAY_DETECTED',
          eventPayload: {
            tripId,
            routeId,
            delayMinutes: 15,
            message: 'Bus #401 is delayed by 15 mins',
          },
        },
        mockAdmin,
      );

      expect(result.evaluatedRulesCount).toBe(1);
      expect(result.triggeredAlertsCount).toBe(2); // 2 channels (IN_APP, SMS)
      expect(notificationsService.dispatch).toHaveBeenCalledTimes(2);
    });

    it('should skip alert if event condition does not match threshold', async () => {
      repository.findActiveRulesByEventType.mockResolvedValue([mockRule]); // threshold is 10 mins

      const result = await service.evaluateEvent(
        {
          eventType: 'TRIP_DELAY_DETECTED',
          eventPayload: {
            tripId,
            routeId,
            delayMinutes: 5, // under threshold
          },
        },
        mockAdmin,
      );

      expect(result.triggeredAlertsCount).toBe(0);
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should suppress alert if deduplicated in cooldown window', async () => {
      repository.findActiveRulesByEventType.mockResolvedValue([mockRule]);
      repository.isDeduplicated.mockResolvedValue(true); // already sent recently

      const result = await service.evaluateEvent(
        {
          eventType: 'TRIP_DELAY_DETECTED',
          eventPayload: {
            tripId,
            routeId,
            delayMinutes: 20,
          },
        },
        mockAdmin,
      );

      expect(result.triggeredAlertsCount).toBe(0);
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should reject passenger from triggering event evaluation with ForbiddenException', async () => {
      await expect(
        service.evaluateEvent(
          {
            eventType: 'TRIP_DELAY_DETECTED',
            eventPayload: {},
          },
          mockPassenger,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
