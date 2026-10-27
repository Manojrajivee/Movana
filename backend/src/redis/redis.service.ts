import { Injectable, OnModuleDestroy, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { REDIS_DEFAULT_TIMEOUT_MS, REDIS_MAX_RETRIES } from './redis.constants';

export interface RedisHealthResult {
  status: 'up' | 'down';
  latencyMs: number;
  required: boolean;
  error?: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly isRequired: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isRequired = this.configService.get<boolean>('redis.requiredForReady', false);
    this.initializeClient();
  }

  private initializeClient(): void {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');
    const tls = this.configService.get<boolean>('redis.tls', false);

    const options: RedisOptions = {
      host,
      port,
      password: password || undefined,
      tls: tls ? {} : undefined,
      connectTimeout: REDIS_DEFAULT_TIMEOUT_MS,
      maxRetriesPerRequest: REDIS_MAX_RETRIES,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > REDIS_MAX_RETRIES) {
          return null; // Stop retrying to avoid connection spam
        }
        return Math.min(times * 500, 2000);
      },
    };

    try {
      this.client = new Redis(options);

      this.client.on('error', (err) => {
        // Redact connection details and passwords from logs
        this.logger.warn(`Redis connection notification: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis client: ${err.message}`);
    }
  }

  /**
   * Bounded ping check for readiness.
   * Does not throw; returns health status and latency.
   */
  async checkHealth(): Promise<RedisHealthResult> {
    const startTime = Date.now();

    if (!this.client) {
      return {
        status: 'down',
        latencyMs: 0,
        required: this.isRequired,
        error: 'Redis client not initialized',
      };
    }

    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
        await Promise.race([
          this.client.connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), REDIS_DEFAULT_TIMEOUT_MS),
          ),
        ]);
      }

      const pong = await Promise.race([
        this.client.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Ping timeout')), REDIS_DEFAULT_TIMEOUT_MS),
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      if (pong === 'PONG') {
        return {
          status: 'up',
          latencyMs,
          required: this.isRequired,
        };
      }

      return {
        status: 'down',
        latencyMs,
        required: this.isRequired,
        error: 'Unexpected ping response',
      };
    } catch (_err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        status: 'down',
        latencyMs,
        required: this.isRequired,
        error: 'Redis unreachable or connection timed out',
      };
    }
  }

  /**
   * Exposes whether Redis client is ready.
   */
  isAvailable(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * Safe key-value get.
   */
  async get(key: string): Promise<string | null> {
    if (!this.client || this.client.status !== 'ready') {
      return null;
    }
    try {
      return await this.client.get(key);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Safe key-value set with optional TTL in seconds.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || this.client.status !== 'ready') {
      return;
    }
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (_err) {
      // Non-fatal cache write failure
    }
  }

  /**
   * Safe key deletion.
   */
  async del(key: string): Promise<void> {
    if (!this.client || this.client.status !== 'ready') {
      return;
    }
    try {
      await this.client.del(key);
    } catch (_err) {
      // Non-fatal cache delete failure
    }
  }

  /**
   * Safe deletion by pattern.
   */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.client || this.client.status !== 'ready') {
      return;
    }
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (_err) {
      // Non-fatal cache pattern delete failure
    }
  }

  /**
   * Safe set addition.
   */
  async sadd(key: string, ...members: string[]): Promise<void> {
    if (!this.client || this.client.status !== 'ready' || members.length === 0) {
      return;
    }
    try {
      await this.client.sadd(key, ...members);
    } catch (_err) {
      // Non-fatal set add failure
    }
  }

  /**
   * Safe set removal.
   */
  async srem(key: string, ...members: string[]): Promise<void> {
    if (!this.client || this.client.status !== 'ready' || members.length === 0) {
      return;
    }
    try {
      await this.client.srem(key, ...members);
    } catch (_err) {
      // Non-fatal set rem failure
    }
  }

  /**
   * Safe set members retrieval.
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.client || this.client.status !== 'ready') {
      return [];
    }
    try {
      return await this.client.smembers(key);
    } catch (_err) {
      return [];
    }
  }

  /**
   * Safe key pattern search.
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client || this.client.status !== 'ready') {
      return [];
    }
    try {
      return await this.client.keys(pattern);
    } catch (_err) {
      return [];
    }
  }

  /**
   * Exposes whether Redis is mandatory for readiness.
   */
  isRedisRequiredForReady(): boolean {
    return this.isRequired;
  }

  /**
   * Gracefully disconnects Redis client.
   */
  async closeClient(): Promise<void> {
    if (this.client) {
      try {
        if (this.client.status === 'ready') {
          await this.client.quit();
        } else {
          this.client.disconnect();
        }
      } catch (_err) {
        // Ignore disconnect errors during shutdown
      } finally {
        this.client = null;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeClient();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.closeClient();
  }
}
