# Movana Backend — Foundation Services (Phase 1)

Enterprise transit backend API service engineered with **NestJS**, **TypeScript**, and **PostgreSQL 16**.

---

## 1. System Requirements & Runtime

* **Node.js**: `v20.x` or `v22.x` (or `v24.x`)
* **Package Manager**: `npm` (v10+ / v11+)
* **Database**: PostgreSQL 16.x (target database: `movana`)
* **Database Runtime Role**: `movana_app` (strictly enforced; superuser `postgres` and owner `movana_owner` are prohibited)
* **Ephemeral Cache**: Redis 7.x (optional for Phase 1 local development and liveness)

---

## 2. Architecture & Operational Foundation

### 2.1 Database Separation of Concerns
* **The backend never executes migrations, seeds, or DDL.**
* All schema migrations (`V001` to `V025`), role provisioning, and privilege hardening are managed exclusively through standalone, verified scripts in the `scripts/database/` directory.
* At runtime, the application pool connects **strictly as role `movana_app`** to database **`movana`**.
* The application runs an automated read-only startup identity assertion:
  ```sql
  SELECT current_database() AS database_name, current_user AS database_user;
  ```
  If any database other than `movana` or any role other than `movana_app` is returned, the application fails closed immediately.

### 2.2 Redis Ephemeral Store
* Redis is configured as an accelerator for future telemetry and session caching.
* For Phase 1, Redis is **not required for application liveness** (`GET /health/live`).
* In `/health/ready`, Redis health is checked according to `REDIS_REQUIRED_FOR_READY`. If set to `false`, Redis being offline does not block the service from being marked ready for local development.

---

## 3. Installation & Local Setup

### 3.1 Install Dependencies
From the `backend/` directory:
```bash
npm install
```

### 3.2 Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
# On Windows PowerShell
Copy-Item .env.example .env

# On Linux/macOS
cp .env.example .env
```

Edit `.env` to configure your local credentials. Example configuration:
```env
# Application
NODE_ENV=development
APP_PORT=3000
APP_HOST=0.0.0.0
LOG_LEVEL=log
CORS_ORIGIN=http://localhost:3000
SWAGGER_ENABLED=true

# Authoritative PostgreSQL Database (Strict: movana / movana_app)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=movana
DATABASE_USER=movana_app
DATABASE_PASSWORD=your_actual_movana_app_password
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_CONNECTION_TIMEOUT_MS=5000

# Redis Cache (Optional for Phase 1 liveness)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false
REDIS_REQUIRED_FOR_READY=false
```

> [!CAUTION]
> Never set `DATABASE_USER=postgres` or `DATABASE_USER=movana_owner`. The application validation logic will reject startup immediately if privileged accounts are detected.

---

## 4. Execution Commands

### 4.1 Development Mode
Runs the NestJS application with hot reloading:
```bash
npm run start:dev
```

### 4.2 Production Build & Run
```bash
# Compile TypeScript to dist/
npm run build

# Start production server
npm run start:prod
```

### 4.3 Code Quality & Linting
```bash
npm run lint
npm run format:check
```

---

## 5. Testing & Verification

### 5.1 Unit Tests (Offline / Mocked Infrastructure)
Runs all unit tests (no real database or Redis connection required):
```bash
npm run test
```

### 5.2 End-to-End Tests (Mocked Infrastructure)
Runs HTTP-level API verification tests:
```bash
npm run test:e2e
```

### 5.3 Gated Database Identity Integration Test (Opt-In)
This test connects directly to the local PostgreSQL database using role `movana_app` and asserts that identity matches `movana` and `movana_app` via read-only SQL:
```bash
# Requires local PostgreSQL running with movana_app role provisioned
npm run test:integration
```
* If `RUN_DB_INTEGRATION_TESTS` is not set to `true`, the test safely skips execution without error.

---

## 6. Operational Health Endpoints

### 6.1 Liveness Probe: `GET /health/live`
Confirms the Node.js process is active and accepting HTTP traffic. Does not make database or Redis calls.
* **Response (HTTP 200 OK):**
  ```json
  {
    "status": "ok",
    "uptimeSeconds": 128,
    "timestamp": "2026-10-26T14:00:00.000Z"
  }
  ```

### 6.2 Readiness Probe: `GET /health/ready`
Executes bounded health checks against required infrastructure dependencies.
* **Healthy Response (HTTP 200 OK):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-26T14:00:00.000Z",
    "checks": {
      "database": {
        "status": "up",
        "latencyMs": 8
      },
      "redis": {
        "status": "up",
        "latencyMs": 2,
        "required": false
      }
    }
  }
  ```
* **Unhealthy / Degraded Response (HTTP 503 Service Unavailable):**
  ```json
  {
    "status": "down",
    "timestamp": "2026-10-26T14:00:00.000Z",
    "checks": {
      "database": {
        "status": "down",
        "latencyMs": 5000
      },
      "redis": {
        "status": "down",
        "latencyMs": 3000,
        "required": false
      }
    }
  }
  ```

---

## 7. OpenAPI / Swagger Documentation

When `SWAGGER_ENABLED=true` (default in development), interactive OpenAPI documentation is available at:
`http://localhost:3000/api/docs`

---

## 8. Security & Logging Redaction

* **Redacted Logger**: Automatically masks sensitive object keys (`password`, `secret`, `token`, `authorization`, `cookie`, `key`) and sanitizes connection strings in logs.
* **Sanitized Client Errors**: Internal database exceptions and stack traces are suppressed in HTTP error responses, returning a clean `{ statusCode, timestamp, path, message }` JSON envelope.
* **Fail-Closed Verification**: Startup fails fast before opening connections if required environment variables are missing or use insecure template placeholders.

---

## 9. Troubleshooting

* **Issue: `[DATABASE SAFETY ABORT] Target database must strictly be 'movana'`**
  * *Resolution:* Ensure `DATABASE_NAME=movana` in `.env`.
* **Issue: `[DATABASE SAFETY ABORT] Target database user must strictly be 'movana_app'`**
  * *Resolution:* Ensure `DATABASE_USER=movana_app`. If `movana_app` password is unknown, refer to `scripts/database/provision-roles.ps1` to provision the role. Never use `postgres` or `movana_owner`.
* **Issue: Database identity assertion failed with `CRITICAL PRIVILEGE VIOLATION`**
  * *Resolution:* The database connection connected under an unauthorized superuser or owner account. Set credentials strictly for role `movana_app`.
