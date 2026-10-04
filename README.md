# Movana — Next-Generation Transportation Platform

Movana is an enterprise-grade intercity and urban bus transit platform engineered for high concurrency, passenger safety, real-time fleet operations, transparent booking lifecycles, and resilient financial reconciliation.

---

## 🏛️ System Architecture Overview

Movana adopts a high-integrity relational persistence model paired with a high-throughput caching and real-time ingestion layer:

* **Authoritative Persistent Store (PostgreSQL 16)**:
  * Manages immutable financial records (bookings, payments, refunds, invoices).
  * Enforces database-level concurrency protection against seat double-booking.
  * Preserves full operational audit logs, maintenance histories, and driver safety events.
  * Tracks point-to-point geospatial routing, topological stops, schedules, and historical telemetry.
* **Real-Time Telemetry & Ephemeral Cache (Redis)**:
  * Ingests high-frequency vehicle GPS pings.
  * Caches real-time vehicle coordinates, active driver states, and live trip status feeds.
  * Batches historical GPS entries into PostgreSQL partitioned tables.

---

## 📁 Repository Layout

```text
Movana/
├── backend/                  # Application API server (Node.js/TypeScript / Go)
├── database/                 # Authoritative PostgreSQL engineering domain
│   ├── migrations/           # Versioned sequential SQL migrations (V001__... to V024__...)
│   ├── seeds/                # Deterministic reference and development seed datasets
│   ├── tests/                # Automated SQL integrity, constraint & isolation test suites
│   ├── docs/                 # Detailed engineering and schema documentation
│   └── README.md             # Database operational handbook
├── docs/                     # Global architecture and platform design documentation
│   ├── database-architecture.md
│   ├── database-schema.md
│   ├── database-relationships.md
│   ├── indexing-strategy.md
│   ├── migration-plan.md
│   ├── backup-restore.md
│   └── data-retention.md
├── scripts/                  # Management scripts
│   ├── database/             # Migration execution & verification runners
│   ├── backup/               # Point-in-time and logical backup automation
│   └── restore/              # Safe database recovery scripts
├── .env.example              # Template environment variables
├── .gitignore                # Enterprise-grade git ignore configuration
├── docker-compose.yml        # Development container orchestration
└── README.md                 # Project root documentation
```

---

## 🛡️ Critical Safety & Multi-Tenant Rules

The local PostgreSQL instance hosts multiple independent databases. Under no circumstances should any script or command modify databases other than **`movana`**.

The following target databases are strictly protected:
* `chatbot_db`
* `cyber_investigation`
* `dayflow`
* `localhero`
* `localhero_db`
* `maritime_m3_db`
* `movana_db` (legacy/isolated)
* `skillbridge_ai`

**All Movana migrations, seeds, and test suites must strictly run inside the `movana` database.**

---

## ⚙️ Quick Start

### 1. Prerequisites
* **PostgreSQL 16.x** (64-bit) running on port `5432`
* **pgAdmin 4** or **psql** command line client
* Optional: **Docker & Docker Compose**

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Ensure credentials point to `DB_NAME=movana`.

### 3. Verify Connection
```powershell
psql -U postgres -h localhost -p 5432 -d movana -c "SELECT current_database(), version();"
```

---

## 📚 Technical Documentation

Detailed specifications are available in `docs/`:
1. [Database Architecture](docs/database-architecture.md)
2. [Complete Schema & Table Inventory](docs/database-schema.md)
3. [Entity Relationships & ER Diagrams](docs/database-relationships.md)
4. [Indexing & Query Optimization Strategy](docs/indexing-strategy.md)
5. [Migration Sequencing & Execution Plan](docs/migration-plan.md)
6. [Backup & Disaster Recovery Runbook](docs/backup-restore.md)
7. [Data Retention, Partitioning & Archival Policy](docs/data-retention.md)
