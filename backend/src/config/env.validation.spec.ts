import { validateEnvironment } from './env.validation';

describe('Environment Validation', () => {
  const validBaseEnv = {
    NODE_ENV: 'development',
    APP_PORT: '3000',
    APP_HOST: 'localhost',
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '5432',
    DATABASE_NAME: 'movana',
    DATABASE_USER: 'movana_app',
    DATABASE_PASSWORD: 'ValidSecureSecretPassword99!',
    DATABASE_SSL: 'false',
    DATABASE_POOL_MIN: '2',
    DATABASE_POOL_MAX: '10',
    DATABASE_CONNECTION_TIMEOUT_MS: '5000',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_REQUIRED_FOR_READY: 'false',
  };

  it('1. should accept a valid environment configuration', () => {
    const validated = validateEnvironment(validBaseEnv);
    expect(validated.DATABASE_NAME).toBe('movana');
    expect(validated.DATABASE_USER).toBe('movana_app');
    expect(validated.APP_PORT).toBe(3000);
    expect(validated.DATABASE_PORT).toBe(5432);
    expect(validated.DATABASE_POOL_MAX).toBe(10);
  });

  it('2. should reject a database name other than movana', () => {
    const invalidEnv = { ...validBaseEnv, DATABASE_NAME: 'other_db' };
    expect(() => validateEnvironment(invalidEnv)).toThrowError(
      /DATABASE_NAME must strictly be 'movana'/i,
    );
  });

  it('3. should reject a database user other than movana_app (e.g. postgres, movana_owner)', () => {
    const invalidPostgres = { ...validBaseEnv, DATABASE_USER: 'postgres' };
    expect(() => validateEnvironment(invalidPostgres)).toThrowError(
      /DATABASE_USER must strictly be 'movana_app'/i,
    );

    const invalidOwner = { ...validBaseEnv, DATABASE_USER: 'movana_owner' };
    expect(() => validateEnvironment(invalidOwner)).toThrowError(
      /DATABASE_USER must strictly be 'movana_app'/i,
    );
  });

  it('4. should reject missing required database credentials or placeholder passwords', () => {
    const missingPassword = { ...validBaseEnv, DATABASE_PASSWORD: '' };
    expect(() => validateEnvironment(missingPassword)).toThrowError(
      /DATABASE_PASSWORD is required/i,
    );

    const placeholderPassword = {
      ...validBaseEnv,
      DATABASE_PASSWORD: 'your_secure_password_here',
    };
    expect(() => validateEnvironment(placeholderPassword)).toThrowError(
      /DATABASE_PASSWORD cannot be a known template placeholder/i,
    );
  });

  it('5. should reject invalid ports and invalid pool settings', () => {
    const invalidPort = { ...validBaseEnv, APP_PORT: '99999' };
    expect(() => validateEnvironment(invalidPort)).toThrowError(/APP_PORT/i);

    const invalidPool = { ...validBaseEnv, DATABASE_POOL_MAX: '0' };
    expect(() => validateEnvironment(invalidPool)).toThrowError(/DATABASE_POOL_MAX/i);
  });

  it('should support alternative DB_* variable naming conventions seamlessly', () => {
    const alternativeEnv = {
      NODE_ENV: 'test',
      APP_PORT: 4000,
      DB_HOST: '127.0.0.1',
      DB_PORT: 5433,
      DB_NAME: 'movana',
      DB_USER: 'movana_app',
      DB_PASSWORD: 'AlternativeValidPassword123!',
      DB_TIMEOUT_MS: 3000,
    };
    const validated = validateEnvironment(alternativeEnv);
    expect(validated.DATABASE_NAME).toBe('movana');
    expect(validated.DATABASE_USER).toBe('movana_app');
    expect(validated.DATABASE_HOST).toBe('127.0.0.1');
    expect(validated.DATABASE_PORT).toBe(5433);
    expect(validated.DATABASE_CONNECTION_TIMEOUT_MS).toBe(3000);
  });
});
