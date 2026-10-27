import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import {
  UsersRepository,
  UserProfileResponse,
  PaginatedUsersResult,
} from '../repositories/users.repository';
import { UpdateProfileDto, UpdateProfileSchema } from '../dto/update-profile.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { QueryUsersDto } from '../dto/query-users.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepo: UsersRepository) {}

  /**
   * Retrieves profile of current user.
   */
  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  /**
   * Updates profile information for a user.
   */
  async updateProfile(userId: string, data: UpdateProfileDto): Promise<UserProfileResponse> {
    const validated = UpdateProfileSchema.parse(data);
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw new NotFoundException('User profile not found');
    }

    const updated = await this.usersRepo.updateProfile(userId, validated);
    if (!updated) {
      throw new NotFoundException('Failed to update user profile');
    }
    return updated;
  }

  /**
   * Retrieves user details with ownership / administrative authorization check.
   */
  async getUserById(
    targetId: string,
    currentUser: AuthenticatedUser,
  ): Promise<UserProfileResponse> {
    const isSelf = currentUser.id === targetId;
    const isAdminOrOperator =
      currentUser.roles.includes('ADMIN') || currentUser.roles.includes('OPERATOR');

    if (!isSelf && !isAdminOrOperator) {
      throw new ForbiddenException('Access denied: insufficient privileges to view user profile');
    }

    const user = await this.usersRepo.findById(targetId);
    if (!user) {
      throw new NotFoundException(`User with ID [${targetId}] not found`);
    }

    return user;
  }

  /**
   * Administratively updates user account status (ACTIVE, SUSPENDED, DEACTIVATED).
   */
  async updateUserStatus(
    targetId: string,
    status: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.usersRepo.findById(targetId);
    if (!existing) {
      throw new NotFoundException(`User with ID [${targetId}] not found`);
    }

    const updated = await this.usersRepo.updateStatus(targetId, status);
    if (!updated) {
      throw new NotFoundException('User could not be updated');
    }

    this.logger.log(`User [${targetId}] status updated to [${status}]`);
    return {
      success: true,
      message: `User status successfully updated to ${status}`,
    };
  }

  /**
   * Soft-deletes a user account and revokes active sessions.
   */
  async deleteUser(
    targetId: string,
    currentUser: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const isSelf = currentUser.id === targetId;
    const isAdmin = currentUser.roles.includes('ADMIN');

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('Access denied: insufficient privileges to delete this account');
    }

    const existing = await this.usersRepo.findById(targetId);
    if (!existing) {
      throw new NotFoundException(`User with ID [${targetId}] not found`);
    }

    const deleted = await this.usersRepo.softDelete(targetId);
    if (!deleted) {
      throw new NotFoundException('Failed to deactivate user');
    }

    this.logger.log(`User [${targetId}] deactivated by [${currentUser.id}]`);
    return {
      success: true,
      message: 'User account has been successfully deactivated',
    };
  }

  /**
   * Administratively lists users with search, role filtering, and pagination.
   */
  async listUsers(query: QueryUsersDto): Promise<PaginatedUsersResult> {
    return this.usersRepo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      status: query.status,
      role: query.role,
    });
  }
}
