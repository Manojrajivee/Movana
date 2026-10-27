# MOVANA BACKEND — MASTER MODULE REGISTER (MODULES 1–100)

**Project:** Movana  
**Architecture:** NestJS Modular Monolith (TypeScript)  
**Database:** PostgreSQL 16 (`movana` / `movana_app`)  
**Cache:** Redis 7  
**Status Legend:**
- `PLANNED`: Requirements specified; not yet started
- `IN_PROGRESS`: Actively under implementation or verification
- `IMPLEMENTED`: Code written, awaiting comprehensive testing gate
- `TESTED`: Fully verified by unit, integration, and E2E test suites with passing evidence
- `BLOCKED`: Blocked by external hardware, third-party dependency, or unapproved schema change
- `FAILED`: Tests executed and failed; requires remediation

---

## Batch 0: Foundation Infrastructure (Modules 1–2)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Tests | Evidence |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- |
| **1** | **Foundation Infrastructure & Configuration** | `TESTED` | Environment config, Zod schema validation, graceful shutdown | None | Unit: 5, E2E: 1 | `npm run test`, `npm run test:e2e` passed (7 suites, 26 tests) |
| **2** | **Core Persistence & Cache Lifecycle** | `TESTED` | `movana` DB, `movana_app` role, Redis client, identity query | `GET /health/live`, `GET /health/ready` | Unit: 8, E2E: 3 | Database identity assertion validated (`movana` / `movana_app`) |

---

## Batch 1: Identity & Access (Modules 3–5)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Tests | Evidence |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- |
| **3** | **Authentication** | `TESTED` | `users`, `user_sessions`, `login_attempts`, `password_reset_tokens`, `email_verification_tokens` | `POST /api/v1/auth/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password` | Unit: 17, E2E: 7 | 100% passed (`auth.service.spec`, `password.service.spec`, `auth.controller.spec`, `auth.e2e-spec`) |
| **4** | **Authorization (RBAC & Permissions)** | `TESTED` | `roles`, `permissions`, `user_roles`, `role_permissions` | RBAC Guards (`@Roles`, `@RequirePermissions`), `@CurrentUser`, ownership policies | Unit: 10, E2E: 6 | 100% passed (`roles.guard.spec`, `permissions.guard.spec`, `users.e2e-spec`) |
| **5** | **Users & Passenger Profiles** | `TESTED` | `users`, `passenger_profiles`, `user_preferences` | `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `GET /api/v1/users`, `GET /api/v1/users/:id`, `PATCH /api/v1/users/:id/status`, `DELETE /api/v1/users/:id` | Unit: 16, E2E: 10 | 100% passed (`users.service.spec`, `users.controller.spec`, `users.e2e-spec`) |

---

## Batch 2: Fleet & Drivers (Modules 6–10)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **6** | **Organizations** | `BLOCKED` | None (Tables `organizations` and `organization_members` absent from migrations V001–V025; schema preserved with zero DDL) | N/A | None |
| **7** | **Drivers** | `TESTED` | `drivers`, `driver_status_history`, `driver_emergency_contacts` | `POST /api/v1/drivers`, `GET /api/v1/drivers/me`, `GET /api/v1/drivers/:id`, `PATCH /api/v1/drivers/:id`, `PATCH /api/v1/drivers/:id/status`, `GET /api/v1/drivers` | Modules 3, 4, 5 |
| **8** | **Driver Documents** | `TESTED` | `driver_document_types`, `driver_documents`, `driver_verifications` | `GET /api/v1/drivers/document-types`, `POST /api/v1/drivers/:id/documents`, `GET /api/v1/drivers/:id/documents`, `GET /api/v1/drivers/documents/:id`, `PATCH /api/v1/drivers/documents/:id/verify` | Module 7 |
| **9** | **Driver Assignments** | `TESTED` | `driver_assignments`, `driver_availability`, `vehicle_assignments` | `POST /api/v1/driver-assignments`, `GET /api/v1/driver-assignments`, `GET /api/v1/driver-assignments/:id`, `PATCH /api/v1/driver-assignments/:id/status`, `POST /api/v1/drivers/:id/availability`, `GET /api/v1/drivers/:id/availability`, `DELETE /api/v1/drivers/:id/availability/:id` | Modules 7, 10 |
| **10** | **Fleet/Buses** | `TESTED` | `vehicles`, `vehicle_models`, `vehicle_types`, `vehicle_manufacturers`, `vehicle_status_history` | `GET /api/v1/vehicles/types`, `GET /api/v1/vehicles/models`, `GET /api/v1/vehicles/manufacturers`, `POST /api/v1/vehicles`, `GET /api/v1/vehicles`, `GET /api/v1/vehicles/:id`, `PATCH /api/v1/vehicles/:id`, `PATCH /api/v1/vehicles/:id/status`, `PATCH /api/v1/vehicles/:id/telemetry`, `DELETE /api/v1/vehicles/:id` | Modules 4, 6 |

---

## Batch 3: Transport Operations & Maintenance (Modules 11–15)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| **11** | **Fleet Operations** | `TESTED` | `vehicles`, `vehicle_assignments`, `vehicle_status_history` | `POST /api/v1/fleet-operations/assignments`, `GET /api/v1/fleet-operations/assignments`, `GET /api/v1/fleet-operations/assignments/:id`, `PATCH /api/v1/fleet-operations/assignments/:id/status`, `GET /api/v1/fleet-operations/vehicles/:id/readiness`, `GET /api/v1/fleet-operations/vehicles/:id/status-history`, `GET /api/v1/fleet-operations/summary` | Unit: 27, E2E: 15 | Modules 7, 10 |
| **12** | **Driver Operations** | `TESTED` | `driver_assignments`, `driver_safety_events`, `drivers` | `POST /api/v1/driver-operations/duty/start`, `POST /api/v1/driver-operations/duty/end`, `GET /api/v1/driver-operations/duty/current`, `GET /api/v1/driver-operations/duty/history`, `POST /api/v1/driver-operations/safety-events`, `GET /api/v1/driver-operations/safety-events` | Unit: 19, E2E: 11 | Module 7 |
| **13** | **Vehicle Maintenance** | `TESTED` | `maintenance_schedules`, `maintenance_records`, `vehicle_inspections`, `vehicles` | `POST /api/v1/maintenance/schedules`, `GET /api/v1/maintenance/schedules`, `GET /api/v1/maintenance/schedules/:id`, `POST /api/v1/maintenance/records`, `GET /api/v1/maintenance/records`, `GET /api/v1/maintenance/records/:id`, `PATCH /api/v1/maintenance/records/:id/status`, `POST /api/v1/maintenance/inspections`, `GET /api/v1/maintenance/inspections`, `GET /api/v1/maintenance/inspections/:id` | Module 10 |
| **14** | **Transport Operations** | `TESTED` | `trips`, `trip_assignments`, `trip_status_history`, `trip_events`, `routes`, `vehicles`, `drivers` | `POST /api/v1/transport-operations/trips`, `GET /api/v1/transport-operations/trips`, `GET /api/v1/transport-operations/trips/:id`, `PATCH /api/v1/transport-operations/trips/:id/status`, `POST /api/v1/transport-operations/trips/:id/events`, `GET /api/v1/transport-operations/trips/:id/events`, `POST /api/v1/transport-operations/trips/:id/assignments`, `GET /api/v1/transport-operations/trips/:id/assignments`, `GET /api/v1/transport-operations/trips/:id/status-history`, `GET /api/v1/transport-operations/dispatch/summary` | Modules 9, 11 |
| **15** | **Transport Foundation** | `TESTED` | `service_calendars`, `service_calendar_exceptions` | `POST /api/v1/transport-foundation/calendars`, `GET /api/v1/transport-foundation/calendars`, `GET /api/v1/transport-foundation/calendars/:id`, `PATCH /api/v1/transport-foundation/calendars/:id`, `DELETE /api/v1/transport-foundation/calendars/:id`, `POST /api/v1/transport-foundation/calendars/:id/exceptions`, `GET /api/v1/transport-foundation/calendars/:id/exceptions`, `DELETE /api/v1/transport-foundation/calendars/:id/exceptions/:exceptionId`, `GET /api/v1/transport-foundation/calendars/:id/is-active-on`, `GET /api/v1/transport-foundation/transit-modes` | Module 14 |

---

## Batch 4: Network, Routes, Stops & Schedules (Modules 16–20)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **16** | **Bus Devices** | `TESTED` | `tracking_devices` | `POST /api/v1/bus-devices`, `GET /api/v1/bus-devices`, `GET /api/v1/bus-devices/:id`, `PATCH /api/v1/bus-devices/:id`, `POST /api/v1/bus-devices/:id/pair`, `POST /api/v1/bus-devices/:id/unpair`, `GET /api/v1/bus-devices/:id/status`, `DELETE /api/v1/bus-devices/:id` | Module 10 |
| **17** | **Routes** | `TESTED` | `routes`, `route_versions` | `POST /api/v1/routes`, `GET /api/v1/routes`, `GET /api/v1/routes/:id`, `PATCH /api/v1/routes/:id`, `PATCH /api/v1/routes/:id/status`, `DELETE /api/v1/routes/:id`, `POST /api/v1/routes/:id/versions`, `GET /api/v1/routes/:id/versions` | Modules 14, 15 |
| **18** | **Route Variants** | `TESTED` | `route_stops` (Table `route_segments` absent from migrations V001–V025; sub-capability blocked per zero DDL rule) | `POST /api/v1/routes/:routeId/stops`, `GET /api/v1/routes/:routeId/stops`, `GET /api/v1/routes/:routeId/stops/alignment-summary`, `POST /api/v1/routes/:routeId/stops/reorder`, `GET /api/v1/routes/:routeId/stops/:stopId`, `PATCH /api/v1/routes/:routeId/stops/:stopId`, `DELETE /api/v1/routes/:routeId/stops/:stopId` | Module 17 |
| **19** | **Stops** | `TESTED` | `stops` (Table `stop_amenities` absent from migrations V001–V025; sub-capability blocked per zero DDL rule) | `POST /api/v1/stops`, `GET /api/v1/stops`, `GET /api/v1/stops/nearby`, `GET /api/v1/stops/:id`, `PATCH /api/v1/stops/:id`, `PATCH /api/v1/stops/:id/status`, `DELETE /api/v1/stops/:id` | Module 17 |
| **20** | **Schedules** | `TESTED` | `trip_schedules`, `schedule_stops`, `vw_route_schedule_summary` | `POST /api/v1/schedules`, `GET /api/v1/schedules`, `GET /api/v1/schedules/summary`, `GET /api/v1/schedules/:id`, `PATCH /api/v1/schedules/:id`, `DELETE /api/v1/schedules/:id`, `POST /api/v1/schedules/:id/stops`, `GET /api/v1/schedules/:id/stops`, `PATCH /api/v1/schedules/:id/stops/:stopId`, `DELETE /api/v1/schedules/:id/stops/:stopId` | Modules 17, 19 |

---

## Batch 5: Telemetry, Geofencing & ETA (Modules 21–25)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **21** | **Tracking** | `PLANNED` | Redis spatial cache, active trip tracking | Live vehicle tracking query endpoint | Modules 10, 16 |
| **22** | **GPS Ingestion** | `PLANNED` | `vehicle_location_history` (partitioned) | High-throughput telemetry ingestion API | Modules 16, 21 |
| **23** | **Geofencing** | `PLANNED` | `geofences`, `geofence_events` | Stop entry, exit, dwell event processing | Modules 19, 22 |
| **24** | **ETA Engine** | `PLANNED` | Telemetry + schedule progress | Dynamic passenger arrival calculations | Modules 20, 22 |
| **25** | **Delay Detection** | `PLANNED` | `trip_events`, schedule comparisons | Variance alert triggers, delay thresholds | Modules 20, 24 |

---

## Batch 6: Trips, Arrivals & Disruptions (Modules 26–30)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **26** | **Trips** | `PLANNED` | `trips`, `trip_stops` | Scheduled and ad-hoc trip dispatch | Modules 9, 10, 20 |
| **27** | **Trip Progress** | `PLANNED` | `trip_events`, `vw_trip_current_status` | Real-time journey progress milestones | Modules 22, 26 |
| **28** | **Stop Arrivals** | `PLANNED` | `trip_stops.actual_arrival_at` | Stop sequence completion recording | Modules 23, 27 |
| **29** | **Stop Reminders** | `PLANNED` | Redis user notification alarms | Approaching-stop passenger alert service | Modules 24, 28 |
| **30** | **Service Disruptions** | `PLANNED` | `service_disruptions` | Network advisories, road closures, alerts | Modules 17, 26 |

---

## Batch 7: Journey Planner & Pricing (Modules 31–35)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **31** | **Journey Planner** | `PLANNED` | Route graph, schedule topology | Point-to-point journey routing engine | Modules 17, 19, 20 |
| **32** | **Route Optimization** | `PLANNED` | Historical speed breadcrumbs | Minimum-travel-time routing paths | Modules 22, 31 |
| **33** | **Multi-Modal Transport** | `PLANNED` | Inter-agency transit connections | Feeder route and metro transfer lookup | Module 31 |
| **34** | **Fare Estimation** | `PLANNED` | `fare_tables`, `fare_rules` | Fare matrix calculation before checkout | Modules 17, 31 |
| **35** | **Saved Journeys** | `PLANNED` | `saved_locations`, `saved_routes` | Passenger favorite commutes & history | Modules 5, 31 |

---

## Batch 8: Notifications & Real-Time Gateway (Modules 36–40)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **36** | **Notifications** | `PLANNED` | `notifications`, `notification_deliveries` | Multi-channel dispatch (SMS, Email, Push) | Module 5 |
| **37** | **Notification Preferences** | `PLANNED` | `user_notification_preferences` | User opt-in/opt-out configuration | Module 36 |
| **38** | **Alert Rules** | `PLANNED` | `alert_rules` | Automated event-to-notification triggers | Modules 30, 36 |
| **39** | **Real-Time Gateway** | `PLANNED` | WebSocket server + Redis pub/sub | Live bus position map stream to clients | Modules 21, 22 |
| **40** | **Communication Templates** | `PLANNED` | `notification_templates` | Localized email, SMS, and push templates | Module 36 |

---

## Batch 9: Safety, SOS & Incident Management (Modules 41–45)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **41** | **SOS / Emergency** | `PLANNED` | `emergency_events`, `emergency_contacts` | Instant panic SOS broadcast to dispatch | Modules 5, 21, 36 |
| **42** | **Live Location Sharing** | `PLANNED` | Redis ephemeral share tokens | Temporary live trip link for trusted contacts | Modules 21, 41 |
| **43** | **Incident Reporting** | `PLANNED` | `safety_incidents`, `incident_reports` | In-app passenger/driver incident filing | Modules 5, 7 |
| **44** | **Safety Zones** | `PLANNED` | `safety_zones`, risk geofences | High-risk speed restriction alerts | Modules 22, 43 |
| **45** | **Incident Management** | `PLANNED` | `incident_actions`, `incident_updates` | Safety officer investigation workflows | Modules 41, 43 |

---

## Batch 10: Crowd, Seat Availability & Accessibility (Modules 46–50)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **46** | **Crowd Estimation** | `PLANNED` | Active ticket counts vs capacity | Bus congestion tier (`LOW`, `MEDIUM`, `HIGH`) | Modules 10, 26 |
| **47** | **Seat Availability** | `PLANNED` | `vw_available_trip_seats`, `seats` | Real-time remaining seat inventory | Modules 10, 26 |
| **48** | **Community Reports** | `PLANNED` | `community_reports` | Crowdsourced delays, lost items, traffic | Modules 5, 26 |
| **49** | **Report Verification** | `PLANNED` | Moderator confirmation actions | Filtering and confirming passenger reports | Module 48 |
| **50** | **Accessibility Services** | `PLANNED` | Wheelchair ramps, audio announcements | Accessible vehicle search & priority booking | Modules 10, 47 |

---

## Batch 11: Driver Navigation & Performance (Modules 51–55)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **51** | **Driver Navigation** | `PLANNED` | Turn-by-turn route pathing | Dedicated driver waypoint navigation feed | Modules 17, 22 |
| **52** | **Driver Stop Reminders** | `PLANNED` | Stop geofence proximity | Automated audio chime for upcoming stop | Modules 23, 51 |
| **53** | **Driver Route Guidance** | `PLANNED` | Detour & diversion guidance | Dispatcher re-routing instructions | Modules 30, 51 |
| **54** | **Driver Performance** | `PLANNED` | `driver_safety_events`, telemetry | Harsh braking, acceleration, speeding scorecard | Modules 7, 22 |
| **55** | **Driver Coaching** | `PLANNED` | Driver training modules & feedback | Performance improvement suggestions | Module 54 |

---

## Batch 12: Fleet Health & Depot Management (Modules 56–60)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **56** | **Fleet Health** | `PLANNED` | `vw_vehicle_health_summary` | Overall bus fitness & sensor telemetry | Modules 10, 13 |
| **57** | **Predictive Maintenance** | `PLANNED` | Mileage & fault log analysis | Component failure early warning system | Modules 13, 56 |
| **58** | **Fuel & Energy Management** | `PLANNED` | Fuel logs, EV charging telemetry | Fuel efficiency and battery state-of-charge | Modules 10, 56 |
| **59** | **Fleet Allocation** | `PLANNED` | Vehicle assignment optimization | Matching bus size to route demand | Modules 10, 20 |
| **60** | **Depot Management** | `PLANNED` | `depots`, parking bay assignments | Bus depot check-in, bay allocation, washing | Modules 10, 59 |

---

## Batch 13: AI & Intelligence Providers (Modules 61–65)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **61** | **AI ETA Provider** | `PLANNED` | Historical duration machine models | High-precision ML arrival estimates | Modules 24, 63 |
| **62** | **Demand Prediction** | `PLANNED` | Time-of-day booking trends | Route passenger load forecasting | Modules 26, 46 |
| **63** | **Traffic Intelligence** | `PLANNED` | External traffic APIs + speed pings | Live congestion corridor feeds | Module 22 |
| **64** | **Weather Intelligence** | `PLANNED` | Weather forecast integrations | Severe weather warning impact on schedules | Modules 20, 26 |
| **65** | **Route Demand Optimization** | `PLANNED` | Commute heatmaps | Proposed new routes and stop placements | Modules 62, 63 |

---

## Batch 14: Bookings, Ticketing & Payments (Modules 66–70)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **66** | **Digital Tickets** | `PLANNED` | `bookings`, `booking_seats`, PNR generator | Ticket checkout, issuance, PNR lookup | Modules 5, 26, 47 |
| **67** | **QR Ticket Validation** | `PLANNED` | Signed cryptographic QR tokens | Conductor/driver offline QR validation | Module 66 |
| **68** | **Payments** | `PLANNED` | `payments`, `payment_events`, gateway | Stripe/Razorpay processing, idempotency | Module 66 |
| **69** | **Passes & Subscriptions** | `PLANNED` | `commuter_passes`, `subscriptions` | Daily/monthly multi-ride transit passes | Modules 5, 68 |
| **70** | **Refunds & Reconciliation** | `PLANNED` | `refunds`, `invoices`, payment logs | Automated refund calculation, dispute logs | Modules 66, 68 |

---

## Batch 15: Feedback, Moderation & Rewards (Modules 71–75)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **71** | **Lost & Found** | `PLANNED` | `lost_and_found_items` | Passenger lost item report filing | Modules 5, 26 |
| **72** | **Lost-Item Matching** | `PLANNED` | Depot found item registry | Automated matching & claim workflow | Module 71 |
| **73** | **Passenger Feedback** | `PLANNED` | `reviews`, `driver_ratings` | Post-trip star ratings, driver reviews | Modules 5, 7, 26 |
| **74** | **Community Moderation** | `PLANNED` | Profanity filter, report flags | Content moderation on reviews/reports | Modules 48, 73 |
| **75** | **Rewards & Loyalty** | `PLANNED` | `passenger_loyalty_points` | Ride reward points, coupon redemption | Modules 5, 66 |

---

## Batch 16: Administration & Public Data (Modules 76–80)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **76** | **Admin Management** | `PLANNED` | Administrative RBAC roles | System configuration, staff user controls | Modules 4, 5 |
| **77** | **Operator Dashboard APIs** | `PLANNED` | 8 Operational analytical views | Live fleet monitoring, operational KPI cards | Modules 14, 21 |
| **78** | **Government Analytics** | `PLANNED` | Aggregate transit telemetry | Urban transit agency compliance reports | Modules 26, 68 |
| **79** | **Service Planning** | `PLANNED` | Route ridership statistics | Seasonal schedule revision planning | Modules 20, 62 |
| **80** | **Public Data APIs (GTFS)** | `PLANNED` | Open data export feeds | GTFS static & GTFS-Realtime feeds | Modules 17, 20, 22 |

---

## Batch 17: Subscriptions, Partners & Billing (Modules 81–85)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **81** | **Subscription Plans** | `PLANNED` | Enterprise corporate pass tiers | Corporate commuter package catalog | Module 69 |
| **82** | **Billing** | `PLANNED` | Corporate invoice billing | Monthly recurring billing to operators | Modules 68, 81 |
| **83** | **Partner Integrations** | `PLANNED` | Third-party ticketing webhooks | Integration with external ticket aggregators | Modules 66, 68 |
| **84** | **API Client Management** | `PLANNED` | `api_keys`, client rate limits | API key issuance, quota management | Module 4 |
| **85** | **Usage & Revenue Analytics**| `PLANNED` | Financial summary projections | Executive revenue, ARPU, occupancy metrics | Modules 68, 77 |

---

## Batch 18: Multilingual, Accessibility & Tourism (Modules 86–90)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **86** | **Multilingual Content** | `PLANNED` | Translation catalogs (i18n) | Localized stops, routes, instructions | Modules 17, 19 |
| **87** | **Voice Assistant APIs** | `PLANNED` | Speech-to-text journey query | Voice booking and timetable queries | Modules 31, 86 |
| **88** | **Offline Data Packages** | `PLANNED` | SQLite/JSON route bundles | Compressed offline timetable downloads | Modules 17, 20 |
| **89** | **Sustainability Analytics** | `PLANNED` | Carbon offset calculations | CO2 emissions saved vs private cars | Modules 26, 66 |
| **90** | **Tourism Services** | `PLANNED` | Scenic routes, POI bookmarks | Touristic landmark stops, audio guides | Modules 17, 19 |

---

## Batch 19: Security, Privacy & Reliability (Modules 91–95)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **91** | **Audit Logs** | `PLANNED` | `audit_logs`, `security_events` | Immutable security log query APIs | Modules 4, 76 |
| **92** | **Fraud & Abuse Prevention** | `PLANNED` | Velocity checks, device fingerprinting| Replay attack and bot account mitigation | Modules 3, 68 |
| **93** | **Privacy & Consent** | `PLANNED` | Consent records, GDPR/DPDP | Right-to-be-forgotten soft delete flow | Module 5 |
| **94** | **API Protection** | `PLANNED` | Redis sliding-window rate limiter | Tiered IP and user rate limiting | Module 84 |
| **95** | **Reliability & Recovery** | `PLANNED` | Circuit breakers, cluster failovers | Resilient external provider fallbacks | Modules 2, 94 |

---

## Batch 20: Jobs, Events & Platform Hub (Modules 96–100)

| # | Module Name | Status | Tables / State Used | Routes / Contracts | Dependencies |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **96** | **Background Jobs** | `PLANNED` | Redis BullMQ worker queue | Telemetry micro-batching, notifications | Modules 2, 22, 36 |
| **97** | **Event Processing** | `PLANNED` | Domain event bus / EventEmitter2 | Decoupled cross-module domain events | Modules 26, 68 |
| **98** | **Observability** | `PLANNED` | OpenTelemetry, Prometheus metrics | Latency histograms, DB pool metrics | Modules 1, 2 |
| **99** | **Deployment Automation** | `PLANNED` | Docker container build specs | Zero-downtime rolling restart scripts | Modules 1, 98 |
| **100**| **External Integration Hub** | `PLANNED` | Webhook dispatch registry | Centralized outbound integration broker | Modules 83, 97 |
