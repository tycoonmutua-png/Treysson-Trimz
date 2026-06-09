const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin SDK — verifies ID tokens sent from the frontend
// ─────────────────────────────────────────────────────────────────────────────
let admin;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (e) {
  console.warn('⚠ firebase-admin not installed or misconfigured. Run: npm install firebase-admin');
  admin = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: verify Firebase ID token
// ─────────────────────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = header.split(' ')[1];

  if (!admin) {
    // firebase-admin not set up yet — allow through in dev with a warning
    console.warn('⚠ Auth bypassed: firebase-admin not configured');
    req.firebaseUid = 'dev-bypass';
    return next();
  }

  try {
    const decoded   = await admin.auth().verifyIdToken(token);
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email || null;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get or create customer row from Firebase UID
// ─────────────────────────────────────────────────────────────────────────────
async function getOrCreateCustomer(firebaseUid, email = null) {
  // Try to find existing customer
  let result = await pool.query(
    'SELECT * FROM customers WHERE firebase_uid = $1',
    [firebaseUid]
  );

  if (result.rows.length > 0) return result.rows[0];

  // First time this user hits the API — create their record
  result = await pool.query(
    `INSERT INTO customers (firebase_uid, email, full_name, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [firebaseUid, email, email ? email.split('@')[0] : 'Member']
  );
  return result.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/me
// Returns the current customer's profile
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const customer = await getOrCreateCustomer(req.firebaseUid, req.firebaseEmail);
    res.json(customer);
  } catch (err) {
    console.error('GET /customers/me error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/customers/me
// Updates name, email, phone
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', requireAuth, async (req, res) => {
  const { full_name, email, phone } = req.body;
  try {
    const customer = await getOrCreateCustomer(req.firebaseUid, req.firebaseEmail);
    const result = await pool.query(
      `UPDATE customers
       SET full_name  = COALESCE($1, full_name),
           email      = COALESCE($2, email),
           phone      = COALESCE($3, phone),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [full_name || null, email || null, phone || null, customer.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /customers/me error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/me/bookings
// Returns all bookings for the current customer, newest first
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me/bookings', requireAuth, async (req, res) => {
  try {
    const customer = await getOrCreateCustomer(req.firebaseUid, req.firebaseEmail);
    const result = await pool.query(
      `SELECT
         b.id,
         b.reference_code,
         b.booking_date,
         b.start_time,
         b.status,
         s.name        AS service_name,
         s.duration    AS service_duration,
         s.price       AS service_price,
         br.name       AS barber_name,
         br.id         AS barber_id,
         br.photo_url  AS barber_photo
       FROM bookings b
       JOIN services s  ON s.id  = b.service_id
       JOIN barbers  br ON br.id = b.barber_id
       WHERE b.customer_id = $1
       ORDER BY b.booking_date DESC, b.start_time DESC`,
      [customer.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /customers/me/bookings error:', err);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/customers/me/bookings/:id/cancel
// Customer cancels one of their own bookings
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/me/bookings/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const customer = await getOrCreateCustomer(req.firebaseUid, req.firebaseEmail);

    // Verify this booking belongs to this customer and is cancellable
    const check = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2`,
      [id, customer.id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = check.rows[0];
    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a ${booking.status} booking` });
    }

    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/customers/me/bookings/:id/reschedule
// Body: { barber_id, booking_date, start_time }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/me/bookings/:id/reschedule', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { barber_id, booking_date, start_time } = req.body;

  if (!booking_date || !start_time) {
    return res.status(400).json({ error: 'booking_date and start_time are required' });
  }

  try {
    const customer = await getOrCreateCustomer(req.firebaseUid, req.firebaseEmail);

    // Verify ownership
    const check = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2`,
      [id, customer.id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = check.rows[0];
    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot reschedule a ${booking.status} booking` });
    }

    // Check the new slot isn't already taken
    const conflict = await pool.query(
      `SELECT id FROM bookings
       WHERE barber_id = $1
         AND booking_date = $2
         AND start_time = $3
         AND status NOT IN ('cancelled','no_show')
         AND id != $4`,
      [barber_id || booking.barber_id, booking_date, start_time, id]
    );
    if (conflict.rows.length) {
      return res.status(409).json({ error: 'That slot is no longer available' });
    }

    const result = await pool.query(
      `UPDATE bookings
       SET barber_id    = $1,
           booking_date = $2,
           start_time   = $3,
           status       = 'pending',
           updated_at   = NOW()
       WHERE id = $4
       RETURNING *`,
      [barber_id || booking.barber_id, booking_date, start_time, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH reschedule error:', err);
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
});

module.exports = router;