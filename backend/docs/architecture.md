# Movana Backend — Architectural Blueprint & Engineering Design

## 1. Architectural Philosophy

The Movana backend is engineered as a **modular monolith** in **NestJS (TypeScript)**. It couples high-throughput domain modularity with atomic relational integrity:

```
                           ┌─────────────────────────────────────────┐
                           │      Client Applications & Portals      │
                           │   (Passenger App, Driver App, Admin)    │
                           └────────────────────┬────────────────────┘
                                                │ HTTPS / WSS
                                                ▼
                           ┌─────────────────────────────────────────┐
                           │           API Gateway Layer             │
                           │  (RedactedLogger, AllExceptionsFilter)  │
                           └────────────────────┬────────────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         ▼                                      ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐                  ┌──────────────────┐
│  Auth & Access   │                  │  Transit Fleet   │                  │ Booking & Pay    │
│  (Modules 3-5)   │                  │  (Modules 6-25)  │                  │ (Modules 66-70)  │
└────────┬─────────┘                  └────────┬─────────┘                  └────────┬─────────┘
         │                                      │                                      │
         └──────────────────────────────────────┼──────────────────────────────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     ▼                                                     ▼
      ┌─────────────────────────────┐                       ┌─────────────────────────────┐
      │       Redis 7 (Cache)       │                       │ PostgreSQL 16 (Persistence) │
      │ ─────────────────────────── │                       │ ─────────────────────────── │
      │ • Ephemeral Session Cache   │                       │ • User Master & Credentials │
      │ • Sliding-window Rate Limits│                       │ • RBAC Roles & Permissions  │
      │ • Real-time GPS Coordinates │                       │ • Bounded Audit & Security  │
      └─────────────────────────────┘                       └─────────────────────────────┘
```

---

## 2. Layered Isolation Principles

1. **Controller Layer**:
   * Responsible strictly for HTTP protocol routing, DTO validation using Zod/class-validator, and status code assignment.
   * Enforces security metadata via `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)`.
   * Never contains raw SQL or persistence calls.

2. **Service / Business Domain Layer**:
   * Encapsulates authoritative business logic, token generation, state transition rules, and cryptographic operations.
   * Injects repositories or database connection services.

3. **Repository / Data Access Layer**:
   * Implements strict parameterized SQL queries (`query(text, params)`).
   * Maps relational tuples to strongly-typed TypeScript domain entities.
   * Interacts with PostgreSQL strictly as database user `movana_app`.

4. **Database Separation of Concerns**:
   * Application runtime connects exclusively as `movana_app` to database `movana`.
   * Runtime cannot execute DDL, migrations, or role grants.
   * All mutations are transactional (`BEGIN ... COMMIT`) with row-level locks (`FOR UPDATE`) on concurrent critical sections.

---

## 3. Cryptographic & Security Baseline

* **Password Security**: Bcrypt with cost factor 12 (or Argon2id) for passenger, driver, and staff credentials.
* **Token Rotation**:
  * Access tokens: short-lived (15 minutes to 1 day).
  * Refresh tokens: long-lived (30 days), stored strictly as **cryptographic SHA-256 hashes** in `user_sessions.refresh_token_hash`.
  * Plaintext refresh tokens are never written to database tables or logs.
* **Redaction Policy**: All application logging automatically masks sensitive credentials via `RedactedLoggerService`.
