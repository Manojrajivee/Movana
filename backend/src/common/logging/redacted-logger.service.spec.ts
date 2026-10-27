import { RedactedLoggerService } from './redacted-logger.service';

describe('RedactedLoggerService (Unit Tests)', () => {
  let logger: RedactedLoggerService;

  beforeEach(() => {
    logger = new RedactedLoggerService('TestContext');
  });

  it('should redact sensitive keys in objects', () => {
    const sensitivePayload = {
      user: 'alice',
      password: 'SuperSecretPassword123!',
      jwt_token: 'eyJhbGciOi...',
      api_secret: 'sec_98765',
      authorization: 'Bearer token-xyz',
      nested: {
        refreshToken: 'rf_12345',
        safeProperty: 'hello world',
      },
    };

    const redacted = logger.redact(sensitivePayload);

    expect(redacted.user).toBe('alice');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.jwt_token).toBe('[REDACTED]');
    expect(redacted.api_secret).toBe('[REDACTED]');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.nested.refreshToken).toBe('[REDACTED]');
    expect(redacted.nested.safeProperty).toBe('hello world');
  });

  it('should redact Bearer tokens and connection strings in plain text strings', () => {
    const rawLog =
      'Connecting to postgresql://movana_app:MySecretPass123@localhost:5432/movana with Bearer abc.def.ghi';
    const redacted = logger.redact(rawLog);

    expect(redacted).not.toContain('MySecretPass123');
    expect(redacted).toContain('postgresql://movana_app:[REDACTED]@localhost:5432/movana');
    expect(redacted).not.toContain('abc.def.ghi');
    expect(redacted).toContain('Bearer [REDACTED]');
  });
});
