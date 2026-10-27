import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository, UserProfileResponse } from '../repositories/users.repository';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('UsersService (Unit Tests)', () => {
  let service: UsersService;
  let usersRepo: Record<keyof UsersRepository, jest.Mock>;

  const mockProfile: UserProfileResponse = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'user@example.com',
    phone: '+919876543210',
    firstName: 'Priya',
    lastName: 'Patel',
    dateOfBirth: '1995-05-15',
    gender: 'FEMALE',
    profileImageUrl: null,
    status: 'ACTIVE',
    emailVerified: true,
    phoneVerified: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: ['PASSENGER'],
    passengerProfile: {
      preferredLanguage: 'en',
      preferredCurrency: 'INR',
      accessibilityRequirements: null,
      specialRequirements: null,
    },
    preferences: {
      smsEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      marketingEnabled: false,
      tripUpdatesEnabled: true,
    },
  };

  const passengerUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'user@example.com',
    roles: ['PASSENGER'],
    permissions: [],
  };

  const otherPassenger: AuthenticatedUser = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'other@example.com',
    roles: ['PASSENGER'],
    permissions: [],
  };

  const adminUser: AuthenticatedUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'admin@movana.com',
    roles: ['ADMIN'],
    permissions: [],
  };

  beforeEach(async () => {
    usersRepo = {
      findById: jest.fn(),
      updateProfile: jest.fn(),
      updateStatus: jest.fn(),
      softDelete: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: usersRepo }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getProfile', () => {
    it('should return profile if user exists', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);

      const res = await service.getProfile(mockProfile.id);
      expect(res).toEqual(mockProfile);
      expect(usersRepo.findById).toHaveBeenCalledWith(mockProfile.id);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      usersRepo.findById.mockResolvedValue(null);

      await expect(service.getProfile('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update profile and return updated data', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);
      usersRepo.updateProfile.mockResolvedValue({
        ...mockProfile,
        firstName: 'Priyanka',
      });

      const res = await service.updateProfile(mockProfile.id, { firstName: 'Priyanka' });
      expect(res.firstName).toBe('Priyanka');
      expect(usersRepo.updateProfile).toHaveBeenCalled();
    });

    it('should throw NotFoundException if updating non-existent user', async () => {
      usersRepo.findById.mockResolvedValue(null);

      await expect(service.updateProfile('missing-id', { firstName: 'Priyanka' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserById', () => {
    it('should allow self to view own profile', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);

      const res = await service.getUserById(mockProfile.id, passengerUser);
      expect(res).toEqual(mockProfile);
    });

    it('should allow ADMIN to view any profile', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);

      const res = await service.getUserById(mockProfile.id, adminUser);
      expect(res).toEqual(mockProfile);
    });

    it('should throw ForbiddenException if regular passenger attempts to view another user profile', async () => {
      await expect(service.getUserById(mockProfile.id, otherPassenger)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status successfully', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);
      usersRepo.updateStatus.mockResolvedValue(true);

      const res = await service.updateUserStatus(mockProfile.id, 'SUSPENDED');
      expect(res.success).toBe(true);
      expect(usersRepo.updateStatus).toHaveBeenCalledWith(mockProfile.id, 'SUSPENDED');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      usersRepo.findById.mockResolvedValue(null);

      await expect(service.updateUserStatus('unknown-id', 'SUSPENDED')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteUser', () => {
    it('should allow user to deactivate their own account', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);
      usersRepo.softDelete.mockResolvedValue(true);

      const res = await service.deleteUser(mockProfile.id, passengerUser);
      expect(res.success).toBe(true);
      expect(usersRepo.softDelete).toHaveBeenCalledWith(mockProfile.id);
    });

    it('should allow ADMIN to deactivate any account', async () => {
      usersRepo.findById.mockResolvedValue(mockProfile);
      usersRepo.softDelete.mockResolvedValue(true);

      const res = await service.deleteUser(mockProfile.id, adminUser);
      expect(res.success).toBe(true);
      expect(usersRepo.softDelete).toHaveBeenCalledWith(mockProfile.id);
    });

    it('should throw ForbiddenException if regular passenger attempts to deactivate another account', async () => {
      await expect(service.deleteUser(mockProfile.id, otherPassenger)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('listUsers', () => {
    it('should delegate query parameters to usersRepo.findAll', async () => {
      const mockResult = {
        items: [mockProfile],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      usersRepo.findAll.mockResolvedValue(mockResult);

      const res = await service.listUsers({ page: 1, limit: 20, search: 'Priya' });
      expect(res).toEqual(mockResult);
      expect(usersRepo.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        search: 'Priya',
        status: undefined,
        role: undefined,
      });
    });
  });
});
