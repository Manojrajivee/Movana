import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard (Unit Tests)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
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

  it('should allow access when no permissions are required on route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ permissions: ['booking:read'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has all required permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['route:create', 'route:update']);

    const context = createMockContext({
      permissions: ['route:create', 'route:update', 'route:delete'],
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has ADMIN role (bypass)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['finance:audit']);

    const context = createMockContext({
      roles: ['ADMIN'],
      permissions: [],
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks one of the required permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['route:create', 'route:delete']);

    const context = createMockContext({
      roles: ['OPERATOR'],
      permissions: ['route:create'],
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user object is missing or has no permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['route:create']);

    const context = createMockContext(null);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
