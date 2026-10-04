-- =============================================================================
-- MOVANA PLATFORM DATABASE MIGRATION
-- Migration: V017__payments_refunds.sql
-- Description: Tokenized payment methods, payment gateway settlement ledgers,
--              idempotency webhook protection, refund reversals, and immutable invoices.
-- Database Engine: PostgreSQL 16
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'movana' THEN
        RAISE EXCEPTION 'CRITICAL: Migration must run strictly inside "movana" database. Current: %', current_database();
    END IF;
END $$;

-- 1. Tokenized Payment Methods (Zero Raw Card / CVV Storage)
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    payment_type VARCHAR(32) NOT NULL DEFAULT 'CARD',
    provider_token VARCHAR(255) NOT NULL,
    masked_account_number VARCHAR(32) NOT NULL,
    expiry_month SMALLINT NULL,
    expiry_year SMALLINT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_methods_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_payment_methods_expiry CHECK (expiry_month IS NULL OR (expiry_month BETWEEN 1 AND 12))
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

CREATE TRIGGER trg_payment_methods_updated_at
BEFORE UPDATE ON payment_methods
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. Master Payments Ledger Table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    payment_reference VARCHAR(64) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_transaction_id VARCHAR(255) NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
    payment_method VARCHAR(32) NOT NULL DEFAULT 'CARD',
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    authorized_at TIMESTAMPTZ NULL,
    captured_at TIMESTAMPTZ NULL,
    failed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT uq_payments_ref UNIQUE (payment_reference),
    CONSTRAINT uq_payments_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_payments_amount CHECK (amount > 0.00),
    CONSTRAINT chk_payments_status CHECK (status IN ('INITIATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'))
);

CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(payment_reference);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_tx ON payments(provider_transaction_id);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3. Gateway Roundtrip Attempts Log
CREATE TABLE IF NOT EXISTS payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    provider VARCHAR(50) NOT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_attempts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
    CONSTRAINT uq_payment_attempts_num UNIQUE (payment_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON payment_attempts(payment_id);

-- 4. Double-Entry Payment Transactions Ledger
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL,
    transaction_type VARCHAR(32) NOT NULL DEFAULT 'CAPTURE',
    provider_transaction_id VARCHAR(255) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_tx_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT chk_payment_tx_amount CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_payment ON payment_transactions(payment_id);

-- 5. Webhook Ingestion Idempotency Ledger
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_events_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_provider_event ON payment_events (provider, event_id);

-- 6. Refunds Master Table
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    refund_reference VARCHAR(64) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
    provider_refund_id VARCHAR(255) NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ NULL,
    failed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refunds_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT uq_refunds_ref UNIQUE (refund_reference),
    CONSTRAINT uq_refunds_idempotency UNIQUE (idempotency_key),
    CONSTRAINT chk_refunds_amount CHECK (amount > 0.00),
    CONSTRAINT chk_refunds_status CHECK (status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds(booking_id);
CREATE INDEX IF NOT EXISTS idx_refunds_ref ON refunds(refund_reference);

CREATE TRIGGER trg_refunds_updated_at
BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 7. Refund Gateway Transactions Log
CREATE TABLE IF NOT EXISTS refund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL,
    provider_transaction_id VARCHAR(255) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refund_tx_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE RESTRICT,
    CONSTRAINT chk_refund_tx_amount CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_refund_tx_refund ON refund_transactions(refund_id);

-- 8. Statutory Tax Invoices (Immutable Billing Entity)
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) NOT NULL,
    booking_id UUID NOT NULL,
    user_id UUID NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL,
    tax NUMERIC(10,2) NOT NULL,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoices_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_invoices_num UNIQUE (invoice_number),
    CONSTRAINT chk_invoices_status CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'REFUNDED')),
    CONSTRAINT chk_invoices_totals CHECK (total = (subtotal - discount + tax))
);

CREATE INDEX IF NOT EXISTS idx_invoices_num ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_booking ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 9. Tax Invoice Line Items Breakdown
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    CONSTRAINT chk_invoice_items_totals CHECK (total_amount = ((quantity * unit_price) + tax_amount))
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Record migration
INSERT INTO schema_migrations (version, description, script, execution_time_ms, success)
VALUES ('V017', 'payments_refunds', 'V017__payments_refunds.sql', 0, TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
