import { Injectable, OnModuleDestroy, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  EXPECTED_DATABASE_NAME,
  EXPECTED_DATABASE_USER,
  FORBIDDEN_DATABASE_USERS,
} from './database.constants';

export interface DatabaseHealthResult {
  status: 'up' | 'down';
  latencyMs: number;
  database?: string;
  user?: string;
  error?: string;
}

export interface DatabaseIdentity {
  database_name: string;
  database_user: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private isVerified = false;

  constructor(private readonly configService: ConfigService) {
    this.initializePool();
  }

  private initializePool(): void {
    const host = this.configService.get<string>('database.host', 'localhost');
    const port = this.configService.get<number>('database.port', 5432);
    const database = this.configService.get<string>('database.name', EXPECTED_DATABASE_NAME);
    const user = this.configService.get<string>('database.user', EXPECTED_DATABASE_USER);
    const password = this.configService.get<string>('database.password', '');
    const ssl = this.configService.get<boolean>('database.ssl', false);
    const poolMin = this.configService.get<number>('database.poolMin', 2);
    const poolMax = this.configService.get<number>('database.poolMax', 10);
    const connectionTimeoutMillis = this.configService.get<number>(
      'database.connectionTimeoutMs',
      5000,
    );

    // Fail immediately if database or user are not exact expected identities
    if (database !== EXPECTED_DATABASE_NAME) {
      throw new Error(
        `[DATABASE SAFETY ABORT] Target database must strictly be '${EXPECTED_DATABASE_NAME}', configured: '${database}'`,
      );
    }
    if (user !== EXPECTED_DATABASE_USER) {
      throw new Error(
        `[DATABASE SAFETY ABORT] Target database user must strictly be '${EXPECTED_DATABASE_USER}', configured: '${user}'`,
      );
    }

    this.pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: ssl ? { rejectUnauthorized: true } : false,
      min: poolMin,
      max: poolMax,
      connectionTimeoutMillis,
      idleTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      // Redact error messages to prevent credential leakage
      this.logger.error('Unexpected error on idle PostgreSQL client in pool', {
        name: err.name,
        message: err.message,
      });
    });
  }

  /**
   * Executes a read-only identity query asserting that the connected database is strictly
   * 'movana' and the authenticated user is strictly 'movana_app'.
   * Fails closed if any other user or database is returned.
   */
  async verifyIdentity(): Promise<DatabaseIdentity> {
    if (!this.pool) {
      throw new Error('Database connection pool is not initialized');
    }

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();

      // Read-only system query
      const result = await client.query<DatabaseIdentity>(
        'SELECT current_database() AS database_name, current_user AS database_user;',
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Database identity query returned zero rows');
      }

      const { database_name, database_user } = result.rows[0];

      if (FORBIDDEN_DATABASE_USERS.has(database_user)) {
        throw new Error(
          `[CRITICAL PRIVILEGE VIOLATION] Application runtime connected as forbidden privileged role '${database_user}'. ` +
            `Must connect strictly as '${EXPECTED_DATABASE_USER}'. Failing closed.`,
        );
      }

      if (database_name !== EXPECTED_DATABASE_NAME) {
        throw new Error(
          `[CRITICAL DATABASE ISOLATION VIOLATION] Connected to unexpected database '${database_name}'. ` +
            `Must connect strictly to '${EXPECTED_DATABASE_NAME}'. Failing closed.`,
        );
      }

      if (database_user !== EXPECTED_DATABASE_USER) {
        throw new Error(
          `[CRITICAL DATABASE ROLE VIOLATION] Connected as unexpected user '${database_user}'. ` +
            `Must connect strictly as '${EXPECTED_DATABASE_USER}'. Failing closed.`,
        );
      }

      this.isVerified = true;
      return { database_name, database_user };
    } catch (error: any) {
      this.isVerified = false;
      const sanitizedMessage = error?.message || 'Database identity verification failed';
      this.logger.error(`Database identity assertion failed: ${sanitizedMessage}`);
      throw new Error(sanitizedMessage);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Bounded read-only health check query for readiness.
   * Returns latency and verification status without leaking connection details or credentials.
   */
  async checkHealth(): Promise<DatabaseHealthResult> {
    const startTime = Date.now();
    try {
      const identity = await this.verifyIdentity();
      const latencyMs = Date.now() - startTime;

      return {
        status: 'up',
        latencyMs,
        database: identity.database_name,
        user: identity.database_user,
      };
    } catch (_err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        status: 'down',
        latencyMs,
        error: 'Database connection or identity verification failed',
      };
    }
  }

  /**
   * Safe parameterized query executor.
   * Asserts pool is available and releases client in finally block.
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params: any[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  /**
   * Executes a series of operations inside an isolated database transaction.
   * Begins transaction, commits on success, rolls back on error, and releases client.
   */
  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Checks whether the pool has successfully verified its identity.
   */
  isIdentityVerified(): boolean {
    return this.isVerified;
  }

  /**
   * Gracefully drains and closes the PostgreSQL pool.
   */
  async closePool(): Promise<void> {
    if (this.pool) {
      this.logger.log('Draining and closing PostgreSQL connection pool...');
      await this.pool.end();
      this.pool = null;
      this.isVerified = false;
      this.logger.log('PostgreSQL connection pool closed successfully.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closePool();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.closePool();
  }
}
