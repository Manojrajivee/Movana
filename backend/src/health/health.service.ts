import { Injectable, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

export interface LivenessResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'down';
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
      latencyMs: number;
    };
    redis: {
      status: 'up' | 'down';
      latencyMs: number;
      required: boolean;
    };
  };
}

export interface ReadinessCheckResult {
  statusCode: number;
  response: ReadinessResponse;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessCheckResult> {
    const timestamp = new Date().toISOString();

    // Check PostgreSQL
    const dbHealth = await this.databaseService.checkHealth();

    // Check Redis
    const redisHealth = await this.redisService.checkHealth();

    const isDbReady = dbHealth.status === 'up';
    const isRedisRequired = redisHealth.required;
    const isRedisReady = !isRedisRequired || redisHealth.status === 'up';

    const overallReady = isDbReady && isRedisReady;

    const response: ReadinessResponse = {
      status: overallReady ? 'ok' : 'down',
      timestamp,
      checks: {
        database: {
          status: dbHealth.status,
          latencyMs: dbHealth.latencyMs,
        },
        redis: {
          status: redisHealth.status,
          latencyMs: redisHealth.latencyMs,
          required: redisHealth.required,
        },
      },
    };

    return {
      statusCode: overallReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      response,
    };
  }
}
