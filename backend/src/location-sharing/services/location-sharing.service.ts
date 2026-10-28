import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';
import {
  ActiveLocationShareSummary,
  CreateLocationShareDto,
  CreateLocationShareResponse,
  LocationShareSession,
} from '../dto/create-share.dto';
import { PublicLocationResponse } from '../dto/public-location.dto';
import { LocationSharingRepository } from '../repositories/location-sharing.repository';

@Injectable()
export class LocationSharingService {
  private readonly logger = new Logger(LocationSharingService.name);

  // Rate limits
  private readonly CREATE_LIMIT = 10; // max shares created per window
  private readonly CREATE_WINDOW_SECONDS = 60;
  private readonly PUBLIC_ACCESS_LIMIT = 60; // max public requests per token per window
  private readonly PUBLIC_ACCESS_WINDOW_SECONDS = 60;

  constructor(
    private readonly repository: LocationSharingRepository,
    private readonly redisService: RedisService,
  ) {}

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex'); // 64 hex characters (256 bits entropy)
  }

  private async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    try {
      const current = await this.redisService.get(key);
      const count = current ? parseInt(current, 10) : 0;
      if (count >= limit) {
        return false;
      }
      await this.redisService.set(key, String(count + 1), windowSeconds);
      return true;
    } catch (err: any) {
      this.logger.warn(`Rate limit check skipped due to Redis error: ${err.message}`);
      return true;
    }
  }

  async createShare(
    dto: CreateLocationShareDto,
    currentUser: any,
  ): Promise<CreateLocationShareResponse> {
    // 1. Redis Fail-Closed Availability Check
    if (!this.redisService.isAvailable()) {
      throw new ServiceUnavailableException(
        'Location sharing service temporarily unavailable. Please retry later.',
      );
    }

    // 2. Rate limiting per user
    const rateLimitKey = `movana:share:ratelimit:create:${currentUser.id}`;
    const allowed = await this.checkRateLimit(
      rateLimitKey,
      this.CREATE_LIMIT,
      this.CREATE_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new HttpException(
        'Too many location sharing sessions created. Please wait before creating another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Trip existence verification
    const tripExists = await this.repository.validateTripExists(dto.tripId);
    if (!tripExists) {
      throw new NotFoundException(`Trip '${dto.tripId}' not found`);
    }

    // 4. Trip ownership / authorization verification
    const roles: string[] = currentUser.roles || [];
    const isAuthorized = await this.repository.validateUserTripAuthorization(
      currentUser.id,
      dto.tripId,
      roles,
    );
    if (!isAuthorized) {
      throw new ForbiddenException(
        `Access denied: you do not have an active booking or authorization for trip '${dto.tripId}'`,
      );
    }

    // 5. Generate cryptographically strong random token
    const rawToken = this.generateSecureToken();
    const tokenHash = this.hashToken(rawToken);
    const id = crypto.randomUUID();
    const now = new Date();
    const durationMinutes = dto.durationMinutes || 60;
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    const ttlSeconds = durationMinutes * 60;

    const session: LocationShareSession = {
      id,
      tripId: dto.tripId,
      userId: currentUser.id,
      tokenHash,
      recipientLabel: dto.recipientLabel,
      createdAt: now.toISOString(),
      expiresAt,
      revoked: false,
    };

    // 6. Store ephemeral metadata in Redis using SHA-256 token hash as key
    try {
      await this.redisService.set(
        `movana:share:token:${tokenHash}`,
        JSON.stringify(session),
        ttlSeconds,
      );
      await this.redisService.set(`movana:share:id:${id}`, tokenHash, ttlSeconds);
      await this.redisService.sadd(`movana:share:user:${currentUser.id}`, id);
    } catch (err: any) {
      this.logger.error(`Failed to store location share session in Redis: ${err.message}`);
      throw new ServiceUnavailableException(
        'Failed to establish location sharing session. Please retry later.',
      );
    }

    // Redacted logging: raw token is NEVER logged
    this.logger.log(
      `Location sharing session ${id} created for trip ${dto.tripId} by user ${currentUser.id} (duration: ${durationMinutes}m)`,
    );

    return {
      id,
      tripId: dto.tripId,
      token: rawToken,
      shareUrl: `/api/v1/location-sharing/public/${rawToken}`,
      createdAt: now.toISOString(),
      expiresAt,
    };
  }

  async getPublicLocation(rawToken: string): Promise<PublicLocationResponse> {
    // 1. Validate token format (must be 64-character hex string)
    if (!rawToken || typeof rawToken !== 'string' || !/^[0-9a-f]{64}$/i.test(rawToken)) {
      throw new BadRequestException('Invalid token format');
    }

    const tokenHash = this.hashToken(rawToken);

    // 2. Fail-Closed Redis Check
    if (!this.redisService.isAvailable()) {
      throw new ServiceUnavailableException(
        'Location sharing service temporarily unavailable. Please retry later.',
      );
    }

    // 3. Rate limiting per token
    const rateLimitKey = `movana:share:ratelimit:public:${tokenHash}`;
    const allowed = await this.checkRateLimit(
      rateLimitKey,
      this.PUBLIC_ACCESS_LIMIT,
      this.PUBLIC_ACCESS_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new HttpException(
        'Rate limit exceeded for location sharing access. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Retrieve session metadata from Redis
    let sessionRaw: string | null = null;
    try {
      sessionRaw = await this.redisService.get(`movana:share:token:${tokenHash}`);
    } catch (err: any) {
      this.logger.error(`Redis error during token lookup: ${err.message}`);
      throw new ServiceUnavailableException(
        'Location sharing service temporarily unavailable. Please retry later.',
      );
    }

    if (!sessionRaw) {
      throw new NotFoundException('Location sharing link is invalid or has expired');
    }

    let session: LocationShareSession;
    try {
      session = JSON.parse(sessionRaw);
    } catch (_err) {
      throw new NotFoundException('Location sharing link is invalid or has expired');
    }

    // 5. Explicit revocation check
    if (session.revoked) {
      throw new NotFoundException('Location sharing link has been revoked');
    }

    // 6. Explicit expiration validation on every access
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new NotFoundException('Location sharing link has expired');
    }

    // 7. Authoritative Location Data Retrieval
    const location = await this.repository.findTripLocation(session.tripId);
    if (!location) {
      throw new NotFoundException('Live location for this trip is currently unavailable');
    }

    // 8. Strict Data Redaction: Return minimal DTO without passenger, driver phone, or credentials
    return {
      tripId: location.tripId,
      tripNumber: location.tripNumber,
      routeCode: location.routeCode,
      routeName: location.routeName,
      originStop: location.originStop,
      destinationStop: location.destinationStop,
      currentLatitude: location.currentLatitude,
      currentLongitude: location.currentLongitude,
      tripStatus: location.tripStatus,
      delayMinutes: location.delayMinutes,
      lastTelemetryAt: location.lastTelemetryAt,
      expiresAt: session.expiresAt,
    };
  }

  async revokeShare(
    shareId: string,
    currentUser: any,
  ): Promise<{ success: boolean; message: string }> {
    // 1. UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!shareId || !uuidRegex.test(shareId)) {
      throw new BadRequestException('Valid shareId UUID is required');
    }

    // 2. Fail-Closed Redis Check
    if (!this.redisService.isAvailable()) {
      throw new ServiceUnavailableException(
        'Location sharing service temporarily unavailable. Please retry later.',
      );
    }

    // 3. Find token hash for share ID
    const tokenHash = await this.redisService.get(`movana:share:id:${shareId}`);
    if (!tokenHash) {
      throw new NotFoundException('Location sharing session not found or already expired');
    }

    // 4. Retrieve session to check ownership
    const sessionRaw = await this.redisService.get(`movana:share:token:${tokenHash}`);
    if (!sessionRaw) {
      throw new NotFoundException('Location sharing session not found or already expired');
    }

    const session: LocationShareSession = JSON.parse(sessionRaw);

    // 5. Ownership verification
    const isOwner = session.userId === currentUser.id;
    const isStaff =
      currentUser.roles?.includes('ADMIN') ||
      currentUser.roles?.includes('OPERATOR') ||
      currentUser.roles?.includes('SAFETY_OFFICER');

    if (!isOwner && !isStaff) {
      throw new ForbiddenException(
        'Access denied: cannot revoke a sharing session belonging to another user',
      );
    }

    // 6. Explicit revocation tombstone (prevents access even if del partially fails or races)
    const revokedSession: LocationShareSession = {
      ...session,
      revoked: true,
    };
    try {
      await this.redisService.set(
        `movana:share:token:${tokenHash}`,
        JSON.stringify(revokedSession),
        300,
      );
    } catch (_err) {
      // Non-fatal if tombstone set fails; proceed with deletion
    }

    // 7. Delete tokens and remove from user index
    await this.redisService.del(`movana:share:token:${tokenHash}`);
    await this.redisService.del(`movana:share:id:${shareId}`);
    await this.redisService.srem(`movana:share:user:${session.userId}`, shareId);

    this.logger.log(`Location sharing session ${shareId} revoked by user ${currentUser.id}`);

    return {
      success: true,
      message: 'Location sharing session revoked successfully',
    };
  }

  async getActiveShares(currentUser: any): Promise<ActiveLocationShareSummary[]> {
    if (!this.redisService.isAvailable()) {
      return [];
    }

    const shareIds = await this.redisService.smembers(`movana:share:user:${currentUser.id}`);
    const results: ActiveLocationShareSummary[] = [];
    const now = Date.now();

    for (const shareId of shareIds) {
      const tokenHash = await this.redisService.get(`movana:share:id:${shareId}`);
      if (!tokenHash) {
        await this.redisService.srem(`movana:share:user:${currentUser.id}`, shareId);
        continue;
      }

      const sessionRaw = await this.redisService.get(`movana:share:token:${tokenHash}`);
      if (!sessionRaw) {
        await this.redisService.srem(`movana:share:user:${currentUser.id}`, shareId);
        continue;
      }

      const session: LocationShareSession = JSON.parse(sessionRaw);
      const isExpired = new Date(session.expiresAt).getTime() <= now;

      if (isExpired || session.revoked) {
        await this.redisService.srem(`movana:share:user:${currentUser.id}`, shareId);
        continue;
      }

      results.push({
        id: session.id,
        tripId: session.tripId,
        recipientLabel: session.recipientLabel,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        status: 'ACTIVE',
      });
    }

    return results;
  }
}
