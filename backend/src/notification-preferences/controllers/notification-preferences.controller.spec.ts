import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from '../services/notification-preferences.service';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let service: jest.Mocked<NotificationPreferencesService>;

  const mockUser = {
    id: '11111111-1111-4111-a111-111111111111',
    roles: ['PASSENGER'],
  };

  const mockProfile = {
    userId: mockUser.id,
    channelSwitches: {
      email: true,
      sms: true,
      push: true,
      inApp: true,
      marketing: false,
      tripUpdates: true,
    },
    categories: [],
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'UTC',
    },
  };

  beforeEach(async () => {
    const mockService = {
      getUserPreferences: jest.fn(),
      updateSinglePreference: jest.fn(),
      updatePreferencesMatrix: jest.fn(),
      resetToDefaults: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [{ provide: NotificationPreferencesService, useValue: mockService }],
    }).compile();

    controller = module.get<NotificationPreferencesController>(NotificationPreferencesController);
    service = module.get(NotificationPreferencesService);
  });

  it('should get current user preferences', async () => {
    service.getUserPreferences.mockResolvedValue(mockProfile);

    const result = await controller.getMyPreferences(mockUser);
    expect(result.userId).toBe(mockUser.id);
    expect(service.getUserPreferences).toHaveBeenCalledWith(mockUser.id);
  });

  it('should update single preference', async () => {
    const mockPref = {
      id: 'p-1',
      user_id: mockUser.id,
      channel: 'SMS' as const,
      notification_category: 'PROMOTION',
      is_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    service.updateSinglePreference.mockResolvedValue(mockPref);

    const result = await controller.updateMySinglePreference(mockUser, {
      channel: 'SMS',
      category: 'PROMOTION',
      isEnabled: true,
    });

    expect(result.is_enabled).toBe(true);
    expect(service.updateSinglePreference).toHaveBeenCalledWith(mockUser.id, expect.anything());
  });

  it('should update matrix and quiet hours', async () => {
    service.updatePreferencesMatrix.mockResolvedValue(mockProfile);

    const result = await controller.updateMyPreferencesMatrix(mockUser, {
      channelDefaults: { marketingEnabled: false },
    });

    expect(result.userId).toBe(mockUser.id);
  });

  it('should reset preferences to defaults', async () => {
    service.resetToDefaults.mockResolvedValue(mockProfile);

    const result = await controller.resetMyPreferences(mockUser);
    expect(result.userId).toBe(mockUser.id);
  });

  it('should allow ADMIN to inspect another user preferences', async () => {
    service.getUserPreferences.mockResolvedValue(mockProfile);

    const result = await controller.getUserPreferencesAdmin(mockUser.id);
    expect(result.userId).toBe(mockUser.id);
  });
});
