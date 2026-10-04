-- =============================================================================
-- MOVANA PLATFORM SEED DATA: REFERENCE / MASTER DATA
-- File: database/seeds/reference_data.sql
-- Description: Deterministic, immutable system lookup records, RBAC roles,
--              operational permissions, vehicle classes, and system settings.
-- Target Database: movana
-- Idempotency: All statements use ON CONFLICT DO NOTHING
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Seeds must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master System Roles
INSERT INTO roles (id, code, name, description, is_system_role)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'ADMIN', 'Super Administrator', 'Full platform administrative access', TRUE),
    ('00000000-0000-0000-0000-000000000002', 'OPERATOR', 'Transit Operations Dispatcher', 'Manages fleet schedules, dispatches, and daily runs', TRUE),
    ('00000000-0000-0000-0000-000000000003', 'DRIVER', 'Commercial Fleet Driver', 'Authorized driver operating platform trips', TRUE),
    ('00000000-0000-0000-0000-000000000004', 'PASSENGER', 'Standard Passenger Traveler', 'Consumer booking trips and buying tickets', TRUE),
    ('00000000-0000-0000-0000-000000000005', 'SUPPORT_AGENT', 'Customer Support Representative', 'Resolves tickets, dispute refunds, and lost items', TRUE),
    ('00000000-0000-0000-0000-000000000006', 'SAFETY_OFFICER', 'Safety & Compliance Inspector', 'Monitors SOS alarms, accidents, and driver scores', TRUE),
    ('00000000-0000-0000-0000-000000000007', 'FLEET_MANAGER', 'Fleet Maintenance Director', 'Supervises garage maintenance, parts, and bus health', TRUE),
    ('00000000-0000-0000-0000-000000000008', 'FINANCE_MANAGER', 'Financial Reconciliation Officer', 'Audits revenue, payouts, taxes, and refunds', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Master System Permissions
INSERT INTO permissions (id, code, module, action, description)
VALUES 
    ('10000000-0000-0000-0000-000000000001', 'users.view', 'USERS', 'VIEW', 'View user profiles'),
    ('10000000-0000-0000-0000-000000000002', 'users.manage', 'USERS', 'MANAGE', 'Create and modify users'),
    ('10000000-0000-0000-0000-000000000003', 'drivers.verify', 'DRIVERS', 'VERIFY', 'Approve or reject driver compliance documents'),
    ('10000000-0000-0000-0000-000000000004', 'drivers.assign', 'DRIVERS', 'ASSIGN', 'Assign drivers to trips and shifts'),
    ('10000000-0000-0000-0000-000000000005', 'vehicles.manage', 'VEHICLES', 'MANAGE', 'Register and decommission fleet buses'),
    ('10000000-0000-0000-0000-000000000006', 'routes.manage', 'ROUTES', 'MANAGE', 'Create and edit transit routes and stops'),
    ('10000000-0000-0000-0000-000000000007', 'trips.dispatch', 'TRIPS', 'DISPATCH', 'Dispatch, delay, and cancel trips'),
    ('10000000-0000-0000-0000-000000000008', 'bookings.create', 'BOOKINGS', 'CREATE', 'Book seats and purchase tickets'),
    ('10000000-0000-0000-0000-000000000009', 'bookings.cancel', 'BOOKINGS', 'CANCEL', 'Cancel bookings and request refunds'),
    ('10000000-0000-0000-0000-000000000010', 'payments.refund', 'PAYMENTS', 'REFUND', 'Process and authorize customer refunds'),
    ('10000000-0000-0000-0000-000000000011', 'safety.monitor', 'SAFETY', 'MONITOR', 'View live SOS emergencies and telemetry infractions'),
    ('10000000-0000-0000-0000-000000000012', 'maintenance.manage', 'MAINTENANCE', 'MANAGE', 'Create work orders and sign off on inspections')
ON CONFLICT (code) DO NOTHING;

-- 3. Vehicle Manufacturers
INSERT INTO vehicle_manufacturers (id, name, country, website)
VALUES 
    ('20000000-0000-0000-0000-000000000001', 'Volvo Buses', 'Sweden', 'https://www.volvobuses.com'),
    ('20000000-0000-0000-0000-000000000002', 'Tata Motors Commercial', 'India', 'https://buses.tatamotors.com'),
    ('20000000-0000-0000-0000-000000000003', 'Scania Commercial Vehicles', 'Sweden', 'https://www.scania.com'),
    ('20000000-0000-0000-0000-000000000004', 'Ashok Leyland', 'India', 'https://www.ashokleyland.com')
ON CONFLICT (name) DO NOTHING;

-- 4. Vehicle Classification Types
INSERT INTO vehicle_types (id, code, name, description, default_fare_multiplier, is_active)
VALUES 
    ('21000000-0000-0000-0000-000000000001', 'EXPRESS_AC', 'Multi-Axle AC Express', 'Air-conditioned luxury intercity coach', 1.25, TRUE),
    ('21000000-0000-0000-0000-000000000002', 'SLEEPER_LUXURY', 'AC Multi-Axle Sleeper', 'Full sleeper berths with reading lights and USB charging', 1.60, TRUE),
    ('21000000-0000-0000-0000-000000000003', 'CITY_BUS', 'Low-Floor City Bus', 'Urban commuter transit with accessible ramp', 1.00, TRUE),
    ('21000000-0000-0000-0000-000000000004', 'MINI_BUS', 'Suburban Mini Bus', 'Feeder route transit shuttle', 0.90, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 5. Driver Document Types
INSERT INTO driver_document_types (id, code, name, description, is_mandatory, expires)
VALUES 
    ('30000000-0000-0000-0000-000000000001', 'COMMERCIAL_LICENSE', 'Heavy Commercial Passenger Vehicle License', 'Regional transport authority driving license', TRUE, TRUE),
    ('30000000-0000-0000-0000-000000000002', 'MEDICAL_FITNESS', 'Commercial Driver Medical Fitness Certificate', 'Annual vision, cardiological and physical fitness check', TRUE, TRUE),
    ('30000000-0000-0000-0000-000000000003', 'POLICE_CLEARANCE', 'Police Background Verification Certificate', 'Criminal record clearance certificate', TRUE, TRUE),
    ('30000000-0000-0000-0000-000000000004', 'GOVERNMENT_ID', 'National Identity Card (Aadhaar / Voter ID)', 'Proof of citizenship and residential address', TRUE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- 6. Incident Types Catalog
INSERT INTO incident_types (id, code, name, category, description)
VALUES 
    ('40000000-0000-0000-0000-000000000001', 'MECHANICAL_BREAKDOWN', 'Vehicle Engine/Mechanical Failure', 'MECHANICAL', 'Bus unable to proceed due to mechanical breakdown'),
    ('40000000-0000-0000-0000-000000000002', 'TRAFFIC_COLLISION', 'Road Traffic Accident / Collision', 'SAFETY', 'Collision with another vehicle, obstacle, or pedestrian'),
    ('40000000-0000-0000-0000-000000000003', 'PASSENGER_MEDICAL', 'Passenger Medical Emergency', 'MEDICAL', 'Onboard illness, injury, or severe medical event'),
    ('40000000-0000-0000-0000-000000000004', 'ROUTE_BLOCKAGE', 'Severe Weather / Road Blockage', 'ENVIRONMENTAL', 'Flooding, landslip, or road closure forcing diversion')
ON CONFLICT (code) DO NOTHING;

-- 7. Incident Severity Scale
INSERT INTO incident_severity_levels (id, code, name, level_rank)
VALUES 
    ('41000000-0000-0000-0000-000000000001', 'LOW', 'Low Severity (Informational)', 1),
    ('41000000-0000-0000-0000-000000000002', 'MEDIUM', 'Medium Severity (Operational Delay)', 2),
    ('41000000-0000-0000-0000-000000000003', 'HIGH', 'High Severity (Safety Hazard)', 3),
    ('41000000-0000-0000-0000-000000000004', 'CRITICAL', 'Critical Severity (Immediate Emergency Dispatch)', 4)
ON CONFLICT (code) DO NOTHING;

-- 8. Review Categories
INSERT INTO review_categories (id, code, name, description)
VALUES 
    ('50000000-0000-0000-0000-000000000001', 'PUNCTUALITY', 'On-Time Punctuality', 'Departure and arrival timeliness'),
    ('50000000-0000-0000-0000-000000000002', 'CLEANLINESS', 'Cleanliness & Hygiene', 'Interior cleanliness and seat condition'),
    ('50000000-0000-0000-0000-000000000003', 'DRIVING', 'Driving Quality & Safety', 'Smooth driving and compliance with traffic safety'),
    ('50000000-0000-0000-0000-000000000004', 'STAFF', 'Staff Courtesy', 'Driver and conductor helpfulness and behavior')
ON CONFLICT (code) DO NOTHING;

-- 9. System Operational Settings
INSERT INTO system_settings (id, setting_key, setting_value, value_type, description, is_public)
VALUES 
    ('60000000-0000-0000-0000-000000000001', 'booking.max_advance_days', '"60"'::jsonb, 'INTEGER', 'Maximum days in advance a passenger can reserve seats', TRUE),
    ('60000000-0000-0000-0000-000000000002', 'booking.hold_timeout_minutes', '"10"'::jsonb, 'INTEGER', 'Temporary seat hold reservation window during checkout', TRUE),
    ('60000000-0000-0000-0000-000000000003', 'cancellation.free_window_hours', '"24"'::jsonb, 'INTEGER', 'Hours prior to scheduled departure for full refund', TRUE),
    ('60000000-0000-0000-0000-000000000004', 'telemetry.gps_ping_interval_seconds', '"5"'::jsonb, 'INTEGER', 'Expected GPS telematics beacon frequency', FALSE)
ON CONFLICT (setting_key) DO NOTHING;

-- 10. Feature Flags
INSERT INTO feature_flags (id, flag_key, name, description, is_enabled, target_rules)
VALUES 
    ('70000000-0000-0000-0000-000000000001', 'feature.instant_refund', 'Instant Bank UPI Refund', 'Direct UPI refund processing upon cancellation', TRUE, '{"percentage": 100}'::jsonb),
    ('70000000-0000-0000-0000-000000000002', 'feature.live_driver_chat', 'Passenger to Driver In-App Messaging', 'Direct in-app messaging when bus is boarding', FALSE, '{"roles": ["ADMIN"]}'::jsonb)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
