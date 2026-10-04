-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V016__fares_pricing.sql
-- Description: Fare products, calculation pricing rules, tax rates, trip fares,
--              promotional discounts, coupons, and redemption logs.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Master Fare Products Catalog
CREATE TABLE IF NOT EXISTS fare_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    fare_type VARCHAR(32) NOT NULL DEFAULT 'DISTANCE_BASED',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fare_products_code UNIQUE (code),
    CONSTRAINT chk_fare_products_type CHECK (fare_type IN ('FLAT', 'DISTANCE_BASED', 'ZONE_BASED', 'DYNAMIC'))
);

CREATE INDEX IF NOT EXISTS idx_fare_products_code ON fare_products(code);

CREATE TRIGGER trg_fare_products_updated_at
BEFORE UPDATE ON fare_products
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Fare Calculation Rules
CREATE TABLE IF NOT EXISTS fare_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fare_product_id UUID NOT NULL,
    route_id UUID NULL,
    origin_stop_id UUID NULL,
    destination_stop_id UUID NULL,
    vehicle_type_id UUID NULL,
    seat_type VARCHAR(32) NULL,
    passenger_category VARCHAR(32) NOT NULL DEFAULT 'ADULT',
    min_distance_km NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    max_distance_km NUMERIC(8,2) NULL,
    base_fare NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    per_km_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fare_rules_product FOREIGN KEY (fare_product_id) REFERENCES fare_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_fare_rules_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    CONSTRAINT fk_fare_rules_vtype FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE SET NULL,
    CONSTRAINT chk_fare_rules_base CHECK (base_fare >= 0.00),
    CONSTRAINT chk_fare_rules_rate CHECK (per_km_rate >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_fare_rules_lookup ON fare_rules (fare_product_id, route_id, vehicle_type_id);

CREATE TRIGGER trg_fare_rules_updated_at
BEFORE UPDATE ON fare_rules
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Fare Prices & Tax Percentages
CREATE TABLE IF NOT EXISTS fare_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fare_rule_id UUID NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    base_amount NUMERIC(10,2) NOT NULL,
    tax_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMPTZ NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fare_prices_rule FOREIGN KEY (fare_rule_id) REFERENCES fare_rules(id) ON DELETE CASCADE,
    CONSTRAINT chk_fare_prices_amount CHECK (base_amount >= 0.00),
    CONSTRAINT chk_fare_prices_tax CHECK (tax_percentage BETWEEN 0.00 AND 100.00)
);

CREATE INDEX IF NOT EXISTS idx_fare_prices_rule_dates ON fare_prices (fare_rule_id, effective_from, effective_to);

-- 4. Trip Fares Materialized Quote Cache
CREATE TABLE IF NOT EXISTS trip_fares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    origin_stop_id UUID NOT NULL,
    destination_stop_id UUID NOT NULL,
    seat_type VARCHAR(32) NOT NULL DEFAULT 'REGULAR',
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    base_fare NUMERIC(10,2) NOT NULL,
    total_fare NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trip_fares_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_fares_orig FOREIGN KEY (origin_stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trip_fares_dest FOREIGN KEY (destination_stop_id) REFERENCES stops(id) ON DELETE RESTRICT,
    CONSTRAINT uq_trip_fares_trip_stops_seat UNIQUE (trip_id, origin_stop_id, destination_stop_id, seat_type),
    CONSTRAINT chk_trip_fares_total CHECK (total_fare >= base_fare AND base_fare >= 0.00)
);

CREATE INDEX IF NOT EXISTS idx_trip_fares_lookup ON trip_fares (trip_id, origin_stop_id, destination_stop_id);

-- 5. Promotional Discounts Table
CREATE TABLE IF NOT EXISTS discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    discount_type VARCHAR(32) NOT NULL DEFAULT 'PERCENTAGE',
    discount_value NUMERIC(10,2) NOT NULL,
    min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    max_discount_amount NUMERIC(10,2) NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_discounts_code UNIQUE (code),
    CONSTRAINT chk_discounts_type CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    CONSTRAINT chk_discounts_val CHECK (discount_value > 0),
    CONSTRAINT chk_discounts_window CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_discounts_code ON discounts(code);

CREATE TRIGGER trg_discounts_updated_at
BEFORE UPDATE ON discounts
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 6. Coupons Vouchers Table
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id UUID NOT NULL,
    coupon_code VARCHAR(50) NOT NULL,
    usage_limit INTEGER NOT NULL DEFAULT 1,
    times_used INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_coupons_discount FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE RESTRICT,
    CONSTRAINT uq_coupons_code UNIQUE (coupon_code),
    CONSTRAINT chk_coupons_usage CHECK (times_used <= usage_limit)
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(coupon_code);

CREATE TRIGGER trg_coupons_updated_at
BEFORE UPDATE ON coupons
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 7. Coupon Redemptions Log
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL,
    user_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE RESTRICT,
    CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_coupon_redemptions_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT uq_coupon_redemptions_booking UNIQUE (booking_id),
    CONSTRAINT chk_coupon_redemptions_amt CHECK (discount_amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V016', 'fares_pricing', 'V016__fares_pricing.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
