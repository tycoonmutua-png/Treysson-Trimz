require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔧 Running migrations...');

    // Drop all tables cleanly (reverse dependency order)
    await client.query(`
      DROP TABLE IF EXISTS offers           CASCADE;
      DROP TABLE IF EXISTS products         CASCADE;
      DROP TABLE IF EXISTS bookings         CASCADE;
      DROP TABLE IF EXISTS customers        CASCADE;
      DROP TABLE IF EXISTS barber_schedules CASCADE;
      DROP TABLE IF EXISTS barbers          CASCADE;
      DROP TABLE IF EXISTS services         CASCADE;
    `);
    console.log('  ✔ Old tables cleared');

    await client.query(`
      CREATE TABLE services (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        duration    INTEGER NOT NULL,
        price       NUMERIC(10,2) NOT NULL,
        category    VARCHAR(50) DEFAULT 'haircut'
                      CHECK (category IN ('haircut','shave','beard','treatment','combo')),
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE barbers (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        phone       VARCHAR(20),
        email       VARCHAR(150),
        photo       TEXT DEFAULT '',
        bio         TEXT,
        specialties TEXT[],
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE barber_schedules (
        id          SERIAL PRIMARY KEY,
        barber_id   INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
        day         VARCHAR(10) NOT NULL
                      CHECK (day IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
        is_working  BOOLEAN DEFAULT TRUE,
        start_time  TIME DEFAULT '08:00',
        end_time    TIME DEFAULT '18:00',
        UNIQUE(barber_id, day)
      );
    `);

    await client.query(`
      CREATE TABLE customers (
        id            SERIAL PRIMARY KEY,
        firebase_uid  VARCHAR(128) UNIQUE NOT NULL,
        name          VARCHAR(100),
        phone         VARCHAR(20),
        email         VARCHAR(150),
        photo_url     TEXT DEFAULT '',
        provider      VARCHAR(30) DEFAULT 'email',
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_customers_firebase_uid ON customers(firebase_uid);
      CREATE INDEX idx_customers_email        ON customers(email);
    `);

    await client.query(`
      CREATE TABLE bookings (
        id                  SERIAL PRIMARY KEY,
        reference_code      VARCHAR(20) UNIQUE NOT NULL,
        customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_name       VARCHAR(100) NOT NULL,
        customer_phone      VARCHAR(20) NOT NULL,
        customer_email      VARCHAR(150),
        service_id          INTEGER NOT NULL REFERENCES services(id),
        barber_id           INTEGER REFERENCES barbers(id),
        booking_date        DATE NOT NULL,
        start_time          TIME NOT NULL,
        end_time            TIME NOT NULL,
        price               NUMERIC(10,2) NOT NULL,
        status              VARCHAR(20) DEFAULT 'pending'
                              CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
        notes               TEXT,
        cancellation_reason TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_bookings_date        ON bookings(booking_date);
      CREATE INDEX idx_bookings_barber_date ON bookings(barber_id, booking_date);
      CREATE INDEX idx_bookings_status      ON bookings(status);
      CREATE INDEX idx_bookings_customer    ON bookings(customer_id);
    `);

    await client.query(`
      CREATE TABLE products (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        price       NUMERIC(10,2) NOT NULL,
        image_url   TEXT DEFAULT '',
        category    VARCHAR(50) DEFAULT 'general',
        stock       INTEGER DEFAULT 0,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE offers (
        id             SERIAL PRIMARY KEY,
        title          VARCHAR(150) NOT NULL,
        description    TEXT,
        discount_type  VARCHAR(20) DEFAULT 'percent'
                         CHECK (discount_type IN ('percent','fixed')),
        discount_value NUMERIC(10,2) NOT NULL,
        code           VARCHAR(30) UNIQUE,
        image_url      TEXT DEFAULT '',
        valid_from     DATE NOT NULL,
        valid_until    DATE NOT NULL,
        is_active      BOOLEAN DEFAULT TRUE,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Auto-update updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    for (const tbl of ['services','barbers','bookings','customers','products','offers']) {
      await client.query(`
        DROP TRIGGER IF EXISTS trg_${tbl}_updated_at ON ${tbl};
        CREATE TRIGGER trg_${tbl}_updated_at
          BEFORE UPDATE ON ${tbl}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    }

    console.log('✅ Migration complete — all tables created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();