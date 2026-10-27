import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRepository, UserEntity, UserSessionEntity } from '../repositories/auth.repository';
import { PasswordService } from './password.service';

describe('AuthService (Unit Tests)', () => {
  let service: AuthService;
  let authRepo: Record<keyof AuthRepository, jest.Mock>;
  let passwordService: Record<keyof PasswordService, jest.Mock>;
  let jwtService: { signAsync: jest.Mock };

  const mockUser: UserEntity = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'passenger@example.com',
    phone: '+919876543210',
    password_hash: '$2b$12$eX4mPl3H4shVaLuE...',
    first_name: 'Aarav',
    last_name: 'Sharma',
    status: 'ACTIVE',
    email_verified: false,
    phone_verified: false,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    roles: ['PASSENGER'],
  };

  beforeEach(async () => {
    authRepo = {
      findByEmail: jest.fn(),
      createUserWithDefaults: jest.fn(),
      getUserPermissions: jest.fn().mockResolvedValue(['booking:create', 'booking:read']),
      recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      createSession: jest.fn().mockResolvedValue({} as UserSessionEntity),
      findActiveSession: jest.fn(),
      revokeSession: jest.fn().mockResolvedValue(true),
      findByIdWithRoles: jest.fn(),
      createPasswordResetToken: jest.fn().mockResolvedValue(undefined),
      findPasswordResetToken: jest.fn(),
      consumePasswordReset: jest.fn().mockResolvedValue(undefined),
      revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
    };

    passwordService = {
      hashPassword: jest.fn().mockResolvedValue('hashed_secret_password'),
      comparePassword: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepo },
        { provide: PasswordService, useValue: passwordService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'jwt.refreshTokenExpiresInDays') return 30;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should successfully register a new user and return token pair', async () => {
      authRepo.findByEmail.mockResolvedValue(null);
      authRepo.createUserWithDefaults.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'passenger@example.com',
        password: 'ValidPassword!123',
        firstName: 'Aarav',
        lastName: 'Sharma',
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('passenger@example.com');
      expect(result.tokens.accessToken).toBe('signed.jwt.token');
      expect(result.tokens.refreshToken).toBeDefined();
      expect(authRepo.createUserWithDefaults).toHaveBeenCalledTimes(1);
    });

    it('should reject registration if email is already registered (409 Conflict)', async () => {
      authRepo.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'passenger@example.com',
          password: 'ValidPassword!123',
          firstName: 'Aarav',
          lastName: 'Sharma',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should authenticate user and return tokens when credentials are valid', async () => {
      authRepo.findByEmail.mockResolvedValue(mockUser);
      passwordService.comparePassword.mockResolvedValue(true);

      const result = await service.login(
        { email: 'passenger@example.com', password: 'ValidPassword!123' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(result.success).toBe(true);
      expect(result.user.id).toBe(mockUser.id);
      expect(authRepo.recordLoginAttempt).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email,
        '127.0.0.1',
        'SUCCESS',
        'Mozilla/5.0',
      );
    });

    it('should throw UnauthorizedException and record failure if email does not exist', async () => {
      authRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'ValidPassword!123' }, '10.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      expect(authRepo.recordLoginAttempt).toHaveBeenCalledWith(
        null,
        'unknown@example.com',
        '10.0.0.1',
        'INVALID_CREDENTIALS',
        undefined,
        'User not found',
      );
    });

    it('should throw UnauthorizedException and record failure if password does not match', async () => {
      authRepo.findByEmail.mockResolvedValue(mockUser);
      passwordService.comparePassword.mockResolvedValue(false);

      await expect(
        service.login(
          { email: 'passenger@example.com', password: 'WrongPassword!123' },
          '10.0.0.1',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(authRepo.recordLoginAttempt).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email,
        '10.0.0.1',
        'INVALID_CREDENTIALS',
        undefined,
        'Incorrect password',
      );
    });

    it('should throw ForbiddenException if account is SUSPENDED', async () => {
      const suspendedUser: UserEntity = { ...mockUser, status: 'SUSPENDED' };
      authRepo.findByEmail.mockResolvedValue(suspendedUser);
      passwordService.comparePassword.mockResolvedValue(true);

      await expect(
        service.login(
          { email: 'passenger@example.com', password: 'ValidPassword!123' },
          '10.0.0.1',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(authRepo.recordLoginAttempt).toHaveBeenCalledWith(
        suspendedUser.id,
        suspendedUser.email,
        '10.0.0.1',
        'SUSPENDED',
        undefined,
        'Account status: SUSPENDED',
      );
    });
  });

  describe('refresh', () => {
    it('should rotate token and return new tokens for valid active session', async () => {
      authRepo.findActiveSession.mockResolvedValue({
        id: 'session-123',
        user_id: mockUser.id,
        refresh_token_hash: 'hash',
        user_agent: null,
        ip_address: null,
        expires_at: new Date(Date.now() + 100000),
        is_revoked: false,
        created_at: new Date(),
      });
      authRepo.findByIdWithRoles.mockResolvedValue(mockUser);

      const tokens = await service.refresh('raw-refresh-token');

      expect(tokens.accessToken).toBe('signed.jwt.token');
      expect(tokens.refreshToken).toBeDefined();
      expect(authRepo.revokeSession).toHaveBeenCalledWith('session-123');
    });

    it('should throw UnauthorizedException if refresh token is invalid or expired', async () => {
      authRepo.findActiveSession.mockResolvedValue(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke active session', async () => {
      authRepo.findActiveSession.mockResolvedValue({
        id: 'session-456',
        user_id: mockUser.id,
        refresh_token_hash: 'hash',
        user_agent: null,
        ip_address: null,
        expires_at: new Date(Date.now() + 100000),
        is_revoked: false,
        created_at: new Date(),
      });

      const res = await service.logout('some-token');
      expect(res.success).toBe(true);
      expect(authRepo.revokeSession).toHaveBeenCalledWith('session-456');
    });
  });

  describe('forgotPassword and resetPassword', () => {
    it('should create password reset token for existing active user', async () => {
      authRepo.findByEmail.mockResolvedValue(mockUser);

      const res = await service.forgotPassword('passenger@example.com');
      expect(res.success).toBe(true);
      expect(authRepo.createPasswordResetToken).toHaveBeenCalled();
    });

    it('should reset password when valid token is provided', async () => {
      authRepo.findPasswordResetToken.mockResolvedValue({
        id: 'reset-id-1',
        user_id: mockUser.id,
        token_hash: 'hash',
        expires_at: new Date(Date.now() + 100000),
        used_at: null,
      });

      const res = await service.resetPassword('valid-token', 'NewStrongP@ss123');
      expect(res.success).toBe(true);
      expect(authRepo.consumePasswordReset).toHaveBeenCalledWith(
        'reset-id-1',
        mockUser.id,
        'hashed_secret_password',
      );
      expect(authRepo.revokeAllUserSessions).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw BadRequestException if token is invalid or expired', async () => {
      authRepo.findPasswordResetToken.mockResolvedValue(null);

      await expect(service.resetPassword('invalid-token', 'NewStrongP@ss123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
