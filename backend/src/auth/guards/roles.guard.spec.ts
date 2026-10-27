import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard (Unit Tests)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access when no roles are required on route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ roles: ['PASSENGER'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has matching role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'OPERATOR']);

    const context = createMockContext({ roles: ['OPERATOR'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user is ADMIN (bypass)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['FLEET_MANAGER']);

    const context = createMockContext({ roles: ['ADMIN'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    const context = createMockContext({ roles: ['PASSENGER'] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no roles assigned', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['PASSENGER']);

    const context = createMockContext(null);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
