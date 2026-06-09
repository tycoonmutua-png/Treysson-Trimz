-- Migration: Add customers table and link bookings to customers
-- Run after your existing migrate.js tables are created.
-- You can add this to your migrate.js or run it separately in psql.

-- ─── Customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) UNIQUE NOT NULL,
  email        VARCHAR(255),
  phone        VARCHAR(30),
  full_name    VARCHAR(255),
  photo_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_firebase_uid ON customers(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_customers_email        ON customers(email);

-- ─── Link bookings to customers (optional column — won't break existing rows) ─
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);