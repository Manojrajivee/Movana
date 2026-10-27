import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthRepository, UserEntity } from '../repositories/auth.repository';
import { PasswordService } from './password.service';
import { RegisterDto, RegisterSchema } from '../dto/register.dto';
import { LoginDto, LoginSchema } from '../dto/login.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
    roles: string[];
  };
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshExpiresInDays: number;

  constructor(
    private readonly authRepo: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshExpiresInDays = this.configService.get<number>('jwt.refreshTokenExpiresInDays', 30);
  }

  /**
   * Registers a new passenger user account.
   */
  async register(data: RegisterDto): Promise<AuthResponse> {
    const validated = RegisterSchema.parse(data);

    // Check for existing account
    const existing = await this.authRepo.findByEmail(validated.email);
    if (existing) {
      throw new ConflictException('Email address is already registered');
    }

    const passwordHash = await this.passwordService.hashPassword(validated.password);

    const user = await this.authRepo.createUserWithDefaults({
      email: validated.email,
      phone: validated.phone,
      passwordHash,
      firstName: validated.firstName,
      lastName: validated.lastName,
    });

    const permissions = await this.authRepo.getUserPermissions(user.id);
    const tokens = await this.generateTokenPair(user, permissions);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        status: user.status,
        roles: user.roles || ['PASSENGER'],
      },
      tokens,
    };
  }

  /**
   * Authenticates user credentials and returns tokens.
   */
  async login(
    data: LoginDto,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ): Promise<AuthResponse> {
    const validated = LoginSchema.parse(data);

    const user = await this.authRepo.findByEmail(validated.email);
    if (!user) {
      await this.authRepo.recordLoginAttempt(
        null,
        validated.email,
        ipAddress,
        'INVALID_CREDENTIALS',
        userAgent,
        'User not found',
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.comparePassword(
      validated.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      await this.authRepo.recordLoginAttempt(
        user.id,
        user.email,
        ipAddress,
        'INVALID_CREDENTIALS',
        userAgent,
        'Incorrect password',
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      await this.authRepo.recordLoginAttempt(
        user.id,
        user.email,
        ipAddress,
        'SUSPENDED',
        userAgent,
        `Account status: ${user.status}`,
      );
      throw new ForbiddenException(
        `Account is currently ${user.status.toLowerCase()}. Please contact customer support.`,
      );
    }

    await this.authRepo.recordLoginAttempt(user.id, user.email, ipAddress, 'SUCCESS', userAgent);
    await this.authRepo.updateLastLogin(user.id, ipAddress);

    const permissions = await this.authRepo.getUserPermissions(user.id);
    const tokens = await this.generateTokenPair(user, permissions, userAgent, ipAddress);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        status: user.status,
        roles: user.roles || [],
      },
      tokens,
    };
  }

  /**
   * Rotates refresh tokens and issues a new access token.
   */
  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.authRepo.findActiveSession(tokenHash);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Token rotation: revoke old session immediately
    await this.authRepo.revokeSession(session.id);

    const user = await this.authRepo.findByIdWithRoles(session.user_id);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    const permissions = await this.authRepo.getUserPermissions(user.id);
    return this.generateTokenPair(user, permissions, userAgent, ipAddress);
  }

  /**
   * Revokes a session upon user logout.
   */
  async logout(refreshToken: string): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.authRepo.findActiveSession(tokenHash);
    if (session) {
      await this.authRepo.revokeSession(session.id);
    }
    return { success: true, message: 'Session successfully revoked' };
  }

  /**
   * Generates a single-use password reset token.
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.authRepo.findByEmail(email);
    if (user && user.status === 'ACTIVE') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.authRepo.createPasswordResetToken(user.id, tokenHash, expiresAt);
      this.logger.log(`Password reset token generated for user [${user.id}]`);
      // In production, dispatch email via Notification Module.
    }

    return {
      success: true,
      message: 'If the email is registered, password reset instructions have been dispatched.',
    };
  }

  /**
   * Validates reset token and sets new password.
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(token);
    const resetRecord = await this.authRepo.findPasswordResetToken(tokenHash);

    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const newPasswordHash = await this.passwordService.hashPassword(newPassword);

    await this.authRepo.consumePasswordReset(resetRecord.id, resetRecord.user_id, newPasswordHash);
    await this.authRepo.revokeAllUserSessions(resetRecord.user_id);

    return { success: true, message: 'Password has been successfully updated' };
  }

  /**
   * Generates access token and stores hashed refresh token in database.
   */
  private async generateTokenPair(
    user: UserEntity,
    permissions: string[] = [],
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles || [],
      permissions,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    // Cryptographically secure random 64-char hex refresh token
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = this.hashToken(rawRefreshToken);

    const expiresAt = new Date(Date.now() + this.refreshExpiresInDays * 24 * 60 * 60 * 1000);

    await this.authRepo.createSession(user.id, refreshTokenHash, expiresAt, userAgent, ipAddress);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 86400, // 24 hours in seconds
    };
  }

  /**
   * SHA-256 hash helper for session tokens.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }
}
