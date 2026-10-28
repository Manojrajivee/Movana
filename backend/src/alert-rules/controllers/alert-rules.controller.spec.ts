import { Test, TestingModule } from '@nestjs/testing';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from '../services/alert-rules.service';

describe('AlertRulesController', () => {
  let controller: AlertRulesController;
  let service: jest.Mocked<AlertRulesService>;

  const mockUser = {
    id: '11111111-1111-4111-a111-111111111111',
    roles: ['PASSENGER'],
  };

  const mockRule = {
    id: 'rule-1',
    name: 'Office Delay Alert',
    eventType: 'TRIP_DELAY_DETECTED' as const,
    scope: 'PERSONAL' as const,
    conditions: { thresholdMinutes: 10 },
    channels: ['IN_APP' as const],
    targetUserId: mockUser.id,
    isActive: true,
    cooldownMinutes: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockService = {
      createRule: jest.fn(),
      getUserRules: jest.fn(),
      getRuleById: jest.fn(),
      updateRule: jest.fn(),
      toggleRuleActive: jest.fn(),
      deleteRule: jest.fn(),
      evaluateEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertRulesController],
      providers: [{ provide: AlertRulesService, useValue: mockService }],
    }).compile();

    controller = module.get<AlertRulesController>(AlertRulesController);
    service = module.get(AlertRulesService);
  });

  it('should create alert rule', async () => {
    service.createRule.mockResolvedValue(mockRule);

    const result = await controller.createRule(mockUser, {
      name: 'Office Delay Alert',
      eventType: 'TRIP_DELAY_DETECTED',
      channels: ['IN_APP'],
    });

    expect(result.id).toBe('rule-1');
    expect(service.createRule).toHaveBeenCalled();
  });

  it('should get my rules', async () => {
    service.getUserRules.mockResolvedValue([mockRule]);

    const result = await controller.getMyRules(mockUser);
    expect(result).toHaveLength(1);
  });

  it('should get rule by id', async () => {
    service.getRuleById.mockResolvedValue(mockRule);

    const result = await controller.getRuleById('rule-1', mockUser);
    expect(result.id).toBe('rule-1');
  });

  it('should update rule', async () => {
    service.updateRule.mockResolvedValue({
      ...mockRule,
      name: 'Updated Name',
    });

    const result = await controller.updateRule('rule-1', mockUser, {
      name: 'Updated Name',
    });
    expect(result.name).toBe('Updated Name');
  });

  it('should toggle rule active state', async () => {
    service.toggleRuleActive.mockResolvedValue({
      ...mockRule,
      isActive: false,
    });

    const result = await controller.toggleRule('rule-1', mockUser, false);
    expect(result.isActive).toBe(false);
  });

  it('should delete rule', async () => {
    service.deleteRule.mockResolvedValue({ success: true });

    const result = await controller.deleteRule('rule-1', mockUser);
    expect(result.success).toBe(true);
  });

  it('should evaluate event against alert rules', async () => {
    service.evaluateEvent.mockResolvedValue({
      eventType: 'TRIP_DELAY_DETECTED',
      evaluatedRulesCount: 1,
      triggeredAlertsCount: 1,
      triggeredAlerts: [],
    });

    const result = await controller.evaluateEvent(mockUser, {
      eventType: 'TRIP_DELAY_DETECTED',
      eventPayload: { delayMinutes: 20 },
    });

    expect(result.evaluatedRulesCount).toBe(1);
  });
});
