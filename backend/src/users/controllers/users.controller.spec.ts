import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from '../services/users.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('UsersController (Unit Tests)', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<Partial<UsersService>>;

  const mockUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'user@example.com',
    roles: ['PASSENGER'],
    permissions: [],
  };

  const mockProfile: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'user@example.com',
    firstName: 'Priya',
    lastName: 'Patel',
  };

  beforeEach(async () => {
    usersService = {
      getProfile: jest.fn().mockResolvedValue(mockProfile),
      updateProfile: jest.fn().mockResolvedValue(mockProfile),
      getUserById: jest.fn().mockResolvedValue(mockProfile),
      updateUserStatus: jest.fn().mockResolvedValue({ success: true, message: 'Status updated' }),
      deleteUser: jest.fn().mockResolvedValue({ success: true, message: 'Account deactivated' }),
      listUsers: jest.fn().mockResolvedValue({ items: [mockProfile], total: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('getMyProfile should delegate to usersService.getProfile', async () => {
    const res = await controller.getMyProfile(mockUser);
    expect(res).toEqual(mockProfile);
    expect(usersService.getProfile).toHaveBeenCalledWith(mockUser.id);
  });

  it('updateMyProfile should delegate to usersService.updateProfile', async () => {
    const dto = { firstName: 'Priyanka' };
    const res = await controller.updateMyProfile(mockUser, dto);
    expect(res).toEqual(mockProfile);
    expect(usersService.updateProfile).toHaveBeenCalledWith(mockUser.id, dto);
  });

  it('listUsers should delegate to usersService.listUsers', async () => {
    const query = { page: 1, limit: 10 };
    const res = await controller.listUsers(query as any);
    expect(res).toBeDefined();
    expect(usersService.listUsers).toHaveBeenCalled();
  });

  it('getUserById should delegate to usersService.getUserById', async () => {
    const res = await controller.getUserById(mockUser.id, mockUser);
    expect(res).toEqual(mockProfile);
    expect(usersService.getUserById).toHaveBeenCalledWith(mockUser.id, mockUser);
  });

  it('updateUserStatus should delegate to usersService.updateUserStatus', async () => {
    const res = await controller.updateUserStatus(mockUser.id, { status: 'SUSPENDED' });
    expect(res.success).toBe(true);
    expect(usersService.updateUserStatus).toHaveBeenCalledWith(mockUser.id, 'SUSPENDED');
  });

  it('deleteUser should delegate to usersService.deleteUser', async () => {
    const res = await controller.deleteUser(mockUser.id, mockUser);
    expect(res.success).toBe(true);
    expect(usersService.deleteUser).toHaveBeenCalledWith(mockUser.id, mockUser);
  });
});
