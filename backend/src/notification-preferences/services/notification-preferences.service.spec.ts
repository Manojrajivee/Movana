import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service';
import { NotificationPreferencesRepository } from '../repositories/notification-preferences.repository';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repository: jest.Mocked<NotificationPreferencesRepository>;
  let redisService: jest.Mocked<RedisService>;

  const userId = '11111111-1111-4111-a111-111111111111';

  const mockChannelRow = {
    id: 'chan-1',
    user_id: userId,
    sms_enabled: true,
    email_enabled: true,
    push_enabled: true,
    marketing_enabled: false,
    trip_updates_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockPrefRow = {
    id: 'pref-1',
    user_id: userId,
    channel: 'SMS' as const,
    notification_category: 'PROMOTION',
    is_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findPreferencesByUserId: jest.fn(),
      upsertPreference: jest.fn(),
      findUserPreferencesRow: jest.fn(),
      upsertUserPreferencesRow: jest.fn(),
      deleteUserPreferences: jest.fn(),
    };

    const mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: NotificationPreferencesRepository, useValue: mockRepo },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
    repository = module.get(NotificationPreferencesRepository);
    redisService = module.get(RedisService);
  });

  describe('getUserPreferences', () => {
    it('should return user preferences profile with defaults', async () => {
      repository.findPreferencesByUserId.mockResolvedValue([mockPrefRow]);
      repository.findUserPreferencesRow.mockResolvedValue(mockChannelRow);
      redisService.get.mockResolvedValue(null);

      const result = await service.getUserPreferences(userId);

      expect(result.userId).toBe(userId);
      expect(result.channelSwitches.email).toBe(true);
      expect(result.channelSwitches.marketing).toBe(false);
      expect(result.categories).toHaveLength(1);
      expect(result.quietHours.enabled).toBe(false);
    });
  });

  describe('updateSinglePreference', () => {
    it('should successfully update preference', async () => {
      repository.upsertPreference.mockResolvedValue(mockPrefRow);

      const result = await service.updateSinglePreference(userId, {
        channel: 'SMS',
        category: 'PROMOTION',
        isEnabled: false,
      });

      expect(result.is_enabled).toBe(false);
      expect(repository.upsertPreference).toHaveBeenCalledWith(userId, 'SMS', 'PROMOTION', false);
    });

    it('should reject disabling SECURITY_ALERT for IN_APP channel', async () => {
      await expect(
        service.updateSinglePreference(userId, {
          channel: 'IN_APP',
          category: 'SECURITY_ALERT',
          isEnabled: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updatePreferencesMatrix', () => {
    it('should update matrix, master switches, and quiet hours in Redis', async () => {
      repository.findPreferencesByUserId.mockResolvedValue([]);
      repository.findUserPreferencesRow.mockResolvedValue(mockChannelRow);
      repository.upsertPreference.mockResolvedValue(mockPrefRow);
      repository.upsertUserPreferencesRow.mockResolvedValue(mockChannelRow);
      redisService.get.mockResolvedValue(null);

      const result = await service.updatePreferencesMatrix(userId, {
        preferences: [
          {
            channel: 'SMS',
            category: 'PROMOTION',
            isEnabled: false,
          },
        ],
        channelDefaults: {
          marketingEnabled: false,
        },
        quietHours: {
          enabled: true,
          start: '23:00',
          end: '06:00',
          timezone: 'Asia/Kolkata',
        },
      });

      expect(result.userId).toBe(userId);
      expect(redisService.set).toHaveBeenCalledWith(
        `movana:user_quiet_hours:${userId}`,
        expect.stringContaining('Asia/Kolkata'),
        expect.any(Number),
      );
    });

    it('should reject invalid IANA timezone', async () => {
      await expect(
        service.updatePreferencesMatrix(userId, {
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '07:00',
            timezone: 'Invalid/Non_Existent_Timezone',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetToDefaults', () => {
    it('should clear custom settings and reset to defaults', async () => {
      repository.deleteUserPreferences.mockResolvedValue(2);
      repository.upsertUserPreferencesRow.mockResolvedValue(mockChannelRow);
      repository.findPreferencesByUserId.mockResolvedValue([]);
      repository.findUserPreferencesRow.mockResolvedValue(mockChannelRow);
      redisService.get.mockResolvedValue(null);

      const result = await service.resetToDefaults(userId);

      expect(repository.deleteUserPreferences).toHaveBeenCalledWith(userId);
      expect(redisService.del).toHaveBeenCalledWith(`movana:user_quiet_hours:${userId}`);
      expect(result.channelSwitches.marketing).toBe(false);
    });
  });

  describe('isDeliveryPermitted', () => {
    it('should always permit SECURITY_ALERT regardless of quiet hours or channel switch', async () => {
      const result = await service.isDeliveryPermitted(userId, 'EMAIL', 'SECURITY_ALERT', true);
      expect(result.allowed).toBe(true);
    });

    it('should deny delivery if user disabled the channel master switch', async () => {
      repository.findUserPreferencesRow.mockResolvedValue({
        ...mockChannelRow,
        email_enabled: false,
      });

      const result = await service.isDeliveryPermitted(userId, 'EMAIL', 'TRIP_UPDATE', false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Email channel is disabled');
    });

    it('should deny delivery if category is explicitly disabled in matrix', async () => {
      repository.findUserPreferencesRow.mockResolvedValue({
        ...mockChannelRow,
        marketing_enabled: true,
      });
      repository.findPreferencesByUserId.mockResolvedValue([mockPrefRow]);

      const result = await service.isDeliveryPermitted(userId, 'SMS', 'PROMOTION', false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('User explicitly disabled');
    });
  });
});
