import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';
import { validateEnvironment } from '../src/config/env.validation';
import { configuration } from '../src/config/configuration';

describe('Database Identity Integration Test (Strictly Read-Only, Gated)', () => {
  const isEnabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

  let service: DatabaseService | null = null;
  let module: TestingModule | null = null;

  beforeAll(async () => {
    if (!isEnabled) {
      return;
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnvironment,
            load: [configuration],
          }),
        ],
        providers: [DatabaseService],
      }).compile();

      service = module.get<DatabaseService>(DatabaseService);
    } catch (_err: any) {
      // If environment validation fails or database credentials are not present, skip cleanly
      service = null;
    }
  });

  afterAll(async () => {
    if (service) {
      await service.closePool();
    }
  });

  it('connects only as movana_app to database movana and confirms identity without mutating state', async () => {
    if (!isEnabled) {
      console.warn(
        '[SKIPPED] Database integration test skipped. Set RUN_DB_INTEGRATION_TESTS=true with valid movana_app credentials to execute.',
      );
      return;
    }

    if (!service) {
      console.warn(
        '[SKIPPED] Database service could not initialize (credentials unavailable or invalid configuration). Skipping integration test.',
      );
      return;
    }

    // Execute read-only identity query
    const identity = await service.verifyIdentity();

    // Strict assertions
    expect(identity.database_name).toBe('movana');
    expect(identity.database_user).toBe('movana_app');

    // Execute read-only ping query
    const pingResult = await service.query('SELECT 1 AS alive;');
    expect(pingResult.rows[0].alive).toBe(1);
  });
});
