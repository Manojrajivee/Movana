import { ValidatedEnvironment } from './env.validation';

export interface AppConfig {
  env: string;
  port: number;
  host: string;
  logLevel: string;
  corsOrigin: string;
  swaggerEnabled: boolean;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    poolMin: number;
    poolMax: number;
    connectionTimeoutMs: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    tls: boolean;
    requiredForReady: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshTokenExpiresInDays: number;
  };
}

export function configuration(validatedEnv?: ValidatedEnvironment): AppConfig {
  const env = validatedEnv || (process.env as unknown as ValidatedEnvironment);

  return {
    env: env.NODE_ENV,
    port: env.APP_PORT,
    host: env.APP_HOST,
    logLevel: env.LOG_LEVEL,
    corsOrigin: env.CORS_ORIGIN,
    swaggerEnabled: env.SWAGGER_ENABLED,
    database: {
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      name: env.DATABASE_NAME,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      ssl: String(env.DATABASE_SSL).toLowerCase() === 'true',
      poolMin: env.DATABASE_POOL_MIN,
      poolMax: env.DATABASE_POOL_MAX,
      connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      tls: String(env.REDIS_TLS).toLowerCase() === 'true',
      requiredForReady: env.REDIS_REQUIRED_FOR_READY,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshTokenExpiresInDays: env.REFRESH_TOKEN_EXPIRES_IN_DAYS,
    },
  };
}
