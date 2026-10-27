# Movana Backend — External Dependencies & Third-Party Adapters

This document catalogs all external integrations, communication brokers, and third-party service adapters across the 100 backend modules.

---

## 1. Adapter Catalog

| Service Category | Targeted Providers | Fallback Adapter for Dev / Offline | Modules |
| :--- | :--- | :--- | :---: |
| **Relational Database** | PostgreSQL 16 (Engine `movana`, Role `movana_app`) | Bounded mock connection pool | All |
| **Ephemeral Cache** | Redis 7 | Mock in-memory key-value fallback | Modules 2, 21, 39, 94 |
| **Payment Gateways** | Razorpay / Stripe | Synthetic test provider (`RAZORPAY_DEMO`) | Modules 68, 70 |
| **SMS Notifications** | Twilio / AWS SNS / Gupshup | Console log & database queue logger (`sms_simulated`) | Modules 36, 41 |
| **Email Delivery** | SendGrid / AWS SES / SMTP | In-memory mock mailer / log output | Modules 36, 40 |
| **Push Notifications** | Firebase Cloud Messaging (FCM) / Apple APNs | Mock device notification dispatcher | Modules 36, 41 |
| **Mapping & Routing** | OpenStreetMap (OSRM) / Google Maps | Deterministic Haversine distance calculator | Modules 17, 24, 31 |
| **Object Cloud Storage** | AWS S3 / MinIO / Google Cloud Storage | Local disk storage adapter with SHA-256 validation | Modules 8, 10, 43 |

---

## 2. Mocking & Local Development Invariants

1. **No Real Financial Charges**: Automated tests must never contact real gateway endpoints or trigger credit transactions.
2. **No Real SMS/Email Billing**: Dev environments must default to mock communication adapters unless production API keys are explicitly verified in `.env`.
3. **No External Hardware Dependencies**: GPS telemetry ingestion must be testable via automated synthetic coordinate streams.
