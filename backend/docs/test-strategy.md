# Movana Backend — Comprehensive Testing Strategy

## 1. Test Pyramid & Quality Gates

The Movana test strategy enforces 4 rigorous testing layers:

1. **Unit Tests (Isolated & Fast)**:
   * Target: Individual services, password hashing, token validation, DTO constraints, and exception filters.
   * Execution: Runs completely offline with mocked repositories.
   * Requirement: 100% pass rate before code can advance to staging.

2. **E2E Tests (HTTP & Integration Boundary)**:
   * Target: Full NestJS execution pipeline (`NestApplication`) with HTTP request dispatch via `supertest`.
   * Verifies route registration, global exception formatting, CORS headers, authorization guards, and sanitized error envelopes.

3. **Gated Read-Only Database Integration Tests**:
   * Target: Live PostgreSQL database `movana`.
   * Boundary: **Strictly read-only**. No test fixtures may create, alter, drop, or truncate rows in `movana`.
   * Gating: Requires explicit `RUN_DB_INTEGRATION_TESTS=true` and authenticated role `movana_app`.
   * Invariant: Fails closed if connected user is anything other than `movana_app`.

4. **Security, Negative & Abuse Tests**:
   * Attempting to access another user's profile (IDOR prevention).
   * Attempting to call administrative endpoints as a `PASSENGER` (asserting HTTP 403 Forbidden).
   * Attempting login with expired or revoked refresh tokens (asserting HTTP 401 Unauthorized).
   * Brute force / velocity attempt logging in `login_attempts`.

---

## 2. Command Reference

* `npm run test`: Executes all unit test suites.
* `npm run test:e2e`: Executes all end-to-end HTTP integration test suites.
* `npm run test:integration`: Runs the gated live database identity integration suite.
* `npm run lint`: Enforces ESLint 9 static analysis rules with zero errors and zero warnings.
* `npm run format:check`: Validates Prettier code style compliance across `src/` and `test/`.
