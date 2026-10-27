import { z } from 'zod';

const FORBIDDEN_PLACEHOLDER_PASSWORDS = new Set([
  'your_secure_password_here',
  'replace_with_your_actual_movana_app_password',
  'replace_with_64_byte_cryptographic_secret',
  'password',
  'admin',
  'postgres',
  'changeme',
  'secret',
  '123456',
  '12345678',
]);

/**
 * Coerces string values to booleans safely.
 */
const booleanSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || lower === '') return false;
  }
  return val;
}, z.boolean());

/**
 * Coerces string values to numbers safely.
 */
const numberSchema = (defaultValue: number, min?: number, max?: number) =>
  z.preprocess(
    (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string' && val.trim() !== '') {
        const parsed = Number(val.trim());
        return Number.isNaN(parsed) ? undefined : parsed;
      }
      return defaultValue;
    },
    min !== undefined && max !== undefined ? z.number().int().min(min).max(max) : z.number(),
  );

export const EnvironmentSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: numberSchema(3000, 1, 65535),
  APP_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']).default('log'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: booleanSchema.default(true),

  // Database (Strict Movana Requirements)
  DATABASE_HOST: z.string().min(1, 'DATABASE_HOST must not be empty').default('localhost'),
  DATABASE_PORT: numberSchema(5432, 1, 65535),
  DATABASE_NAME: z.string().refine((val) => val === 'movana', {
    message:
      "DATABASE_NAME must strictly be 'movana'. Neighboring tenant databases are prohibited.",
  }),
  DATABASE_USER: z.string().refine((val) => val === 'movana_app', {
    message:
      "DATABASE_USER must strictly be 'movana_app'. Privileged roles ('postgres', 'movana_owner', 'movana_migration') are forbidden at runtime.",
  }),
  DATABASE_PASSWORD: z
    .string()
    .min(1, 'DATABASE_PASSWORD is required and must not be empty')
    .refine((val) => !FORBIDDEN_PLACEHOLDER_PASSWORDS.has(val.trim().toLowerCase()), {
      message: 'DATABASE_PASSWORD cannot be a known template placeholder or default value.',
    }),
  DATABASE_SSL: booleanSchema.default(false),
  DATABASE_POOL_MIN: numberSchema(2, 1, 50),
  DATABASE_POOL_MAX: numberSchema(10, 2, 100),
  DATABASE_CONNECTION_TIMEOUT_MS: numberSchema(5000, 500, 60000),

  // Redis
  REDIS_HOST: z.string().min(1, 'REDIS_HOST must not be empty').default('localhost'),
  REDIS_PORT: numberSchema(6379, 1, 65535),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_TLS: booleanSchema.default(false),
  REDIS_REQUIRED_FOR_READY: booleanSchema.default(false),

  // JWT & Security Secrets
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('movana_secure_jwt_access_token_secret_32chars_long_key_development')
    .refine((val) => !FORBIDDEN_PLACEHOLDER_PASSWORDS.has(val.trim().toLowerCase()), {
      message: 'JWT_SECRET cannot be a known template placeholder.',
    }),
  JWT_EXPIRES_IN: z.string().default('1d'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: numberSchema(30, 1, 365),

  // Optional integration tests
  RUN_DB_INTEGRATION_TESTS: booleanSchema.default(false),
});

export type ValidatedEnvironment = z.infer<typeof EnvironmentSchema>;

/**
 * Validates environment variables and throws sanitized, actionable errors on failure.
 * Secret values are NEVER leaked in error messages.
 */
export function validateEnvironment(config: Record<string, unknown>): ValidatedEnvironment {
  // Normalize alternative names (e.g., DB_HOST -> DATABASE_HOST) for developer convenience
  const normalized: Record<string, unknown> = { ...config };

  if (!normalized.DATABASE_HOST && normalized.DB_HOST) {
    normalized.DATABASE_HOST = normalized.DB_HOST;
  }
  if (!normalized.DATABASE_PORT && normalized.DB_PORT) {
    normalized.DATABASE_PORT = normalized.DB_PORT;
  }
  if (!normalized.DATABASE_NAME && normalized.DB_NAME) {
    normalized.DATABASE_NAME = normalized.DB_NAME;
  }
  if (!normalized.DATABASE_USER && normalized.DB_USER) {
    normalized.DATABASE_USER = normalized.DB_USER;
  }
  if (!normalized.DATABASE_PASSWORD && normalized.DB_PASSWORD) {
    normalized.DATABASE_PASSWORD = normalized.DB_PASSWORD;
  }
  if (!normalized.DATABASE_SSL && normalized.DB_SSL !== undefined) {
    normalized.DATABASE_SSL = normalized.DB_SSL;
  }
  if (!normalized.DATABASE_POOL_MIN && normalized.DB_POOL_MIN) {
    normalized.DATABASE_POOL_MIN = normalized.DB_POOL_MIN;
  }
  if (!normalized.DATABASE_POOL_MAX && normalized.DB_POOL_MAX) {
    normalized.DATABASE_POOL_MAX = normalized.DB_POOL_MAX;
  }
  if (!normalized.DATABASE_CONNECTION_TIMEOUT_MS && normalized.DB_TIMEOUT_MS) {
    normalized.DATABASE_CONNECTION_TIMEOUT_MS = normalized.DB_TIMEOUT_MS;
  }

  const result = EnvironmentSchema.safeParse(normalized);

  if (!result.success) {
    const errorMessages = result.error.errors.map((err) => {
      const field = err.path.join('.');
      return `  - Variable [${field}]: ${err.message}`;
    });

    throw new Error(
      `[FATAL CONFIGURATION ERROR] Environment validation failed before startup:\n` +
        errorMessages.join('\n') +
        `\nCheck your .env configuration against .env.example. Secrets have been redacted.`,
    );
  }

  return result.data;
}
