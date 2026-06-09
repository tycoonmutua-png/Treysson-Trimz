require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Services ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        duration    INTEGER NOT NULL,        -- minutes
        price       NUMERIC(10,2) NOT NULL,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Barbers ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS barbers (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(150) UNIQUE,
        phone       VARCHAR(30),
        photo_url   TEXT,
        bio         TEXT,
        is_active   BOOLEAN DEFAULT TRUE,
        -- schedule stored as JSONB: { mon: {open:"09:00",close:"17:00"}, ... }
        schedule    JSONB DEFAULT '{
          "mon": {"open":"09:00","close":"17:00"},
          "tue": {"open":"09:00","close":"17:00"},
          "wed": {"open":"09:00","close":"17:00"},
          "thu": {"open":"09:00","close":"17:00"},
          "fri": {"open":"09:00","close":"17:00"},
          "sat": {"open":"09:00","close":"15:00"},
          "sun": null
        }'::jsonb,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Customers ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id           SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(128) UNIQUE NOT NULL,   -- from Firebase Auth
        full_name    VARCHAR(150),
        email        VARCHAR(150),
        phone        VARCHAR(30),
        photo_url    TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Bookings ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id              SERIAL PRIMARY KEY,
        reference_code  VARCHAR(20) UNIQUE,
        customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        barber_id       INTEGER NOT NULL REFERENCES barbers(id),
        service_id      INTEGER NOT NULL REFERENCES services(id),
        booking_date    DATE NOT NULL,
        start_time      TIME NOT NULL,
        end_time        TIME NOT NULL,
        status          VARCHAR(20) DEFAULT 'pending'
                          CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Auto-generate reference codes ─────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_reference_code()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.reference_code IS NULL THEN
          NEW.reference_code := 'TT-' || LPAD(NEW.id::TEXT, 5, '0');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS set_reference_code ON bookings;
      CREATE TRIGGER set_reference_code
        BEFORE INSERT ON bookings
        FOR EACH ROW EXECUTE FUNCTION generate_reference_code();
    `);

    await client.query('COMMIT');
    console.log('✅ Migration complete — all tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();