import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';

describe('AuthController (Unit Tests)', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;

  const mockAuthResponse = {
    success: true,
    user: {
      id: '11111111-1111-4111-a111-111111111111',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: null,
      status: 'ACTIVE',
      roles: ['PASSENGER'],
    },
    tokens: {
      accessToken: 'access.jwt.token',
      refreshToken: 'refresh.token.123',
      expiresIn: 900,
    },
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue(mockAuthResponse),
      login: jest.fn().mockResolvedValue(mockAuthResponse),
      refresh: jest.fn().mockResolvedValue(mockAuthResponse.tokens),
      logout: jest.fn().mockResolvedValue({ success: true, message: 'Session revoked' }),
      forgotPassword: jest.fn().mockResolvedValue({
        success: true,
        message: 'Password reset instructions dispatched',
      }),
      resetPassword: jest.fn().mockResolvedValue({
        success: true,
        message: 'Password updated',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should delegate register to authService.register', async () => {
    const dto = {
      email: 'user@example.com',
      password: 'ValidPassword!123',
      firstName: 'John',
      lastName: 'Doe',
    };

    const res = await controller.register(dto);
    expect(res).toEqual(mockAuthResponse);
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('should delegate login with client IP and user agent', async () => {
    const dto = {
      email: 'user@example.com',
      password: 'ValidPassword!123',
    };
    const mockReq = {
      headers: {
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Chrome/120',
      },
      ip: '127.0.0.1',
    } as any;

    const res = await controller.login(dto, mockReq);
    expect(res).toEqual(mockAuthResponse);
    expect(authService.login).toHaveBeenCalledWith(dto, '192.168.1.100', 'Chrome/120');
  });

  it('should delegate refresh to authService.refresh', async () => {
    const dto = { refreshToken: 'valid-refresh-token' };
    const mockReq = { headers: {}, ip: '127.0.0.1' } as any;

    const res = await controller.refresh(dto, mockReq);
    expect(res).toEqual(mockAuthResponse.tokens);
    expect(authService.refresh).toHaveBeenCalledWith('valid-refresh-token', '127.0.0.1', undefined);
  });

  it('should delegate logout to authService.logout', async () => {
    const dto = { refreshToken: 'valid-refresh-token' };
    const res = await controller.logout(dto);
    expect(res.success).toBe(true);
    expect(authService.logout).toHaveBeenCalledWith('valid-refresh-token');
  });

  it('should delegate forgotPassword to authService.forgotPassword', async () => {
    const dto = { email: 'user@example.com' };
    const res = await controller.forgotPassword(dto);
    expect(res.success).toBe(true);
    expect(authService.forgotPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('should delegate resetPassword to authService.resetPassword', async () => {
    const dto = { token: 'reset-token-xyz', newPassword: 'NewPassword!123' };
    const res = await controller.resetPassword(dto);
    expect(res.success).toBe(true);
    expect(authService.resetPassword).toHaveBeenCalledWith('reset-token-xyz', 'NewPassword!123');
  });
});
