const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET all bookings (admin) with filters
router.get('/', async (req, res) => {
  try {
    const { date, status, barber_id, page=1, limit=20 } = req.query;
    const conditions = [], params = [];
    if (date)      { params.push(date);      conditions.push(`b.booking_date=$${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`b.status=$${params.length}`); }
    if (barber_id) { params.push(barber_id); conditions.push(`b.barber_id=$${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));

    const { rows } = await pool.query(
      `SELECT b.*, s.name as service_name, s.duration as service_duration,
              br.name as barber_name, br.photo as barber_photo
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       LEFT JOIN barbers br ON br.id = b.barber_id
       ${where}
       ORDER BY b.booking_date DESC, b.start_time DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length-2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM bookings b ${where}`, countParams
    );
    const total = parseInt(countRows[0].count);

    res.json({ success: true, data: rows, total, page: parseInt(page), pages: Math.ceil(total/limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET today's bookings
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT b.*, s.name as service_name, s.duration as service_duration, br.name as barber_name
       FROM bookings b
       JOIN services s ON s.id=b.service_id
       LEFT JOIN barbers br ON br.id=b.barber_id
       WHERE b.booking_date=$1 AND b.status IN ('pending','confirmed')
       ORDER BY b.start_time`, [today]
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET booking by reference code
router.get('/reference/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, s.name as service_name, s.duration as service_duration,
              s.price as service_price, br.name as barber_name, br.photo as barber_photo
       FROM bookings b
       JOIN services s ON s.id=b.service_id
       LEFT JOIN barbers br ON br.id=b.barber_id
       WHERE UPPER(b.reference_code)=UPPER($1)`, [req.params.code]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single booking
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, s.name as service_name, br.name as barber_name
       FROM bookings b JOIN services s ON s.id=b.service_id LEFT JOIN barbers br ON br.id=b.barber_id
       WHERE b.id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create a new booking
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { service_id, barber_id, date, start_time, customer_name, customer_phone, customer_email, notes } = req.body;

    // Get service info
    const { rows: svcRows } = await client.query(
      `SELECT * FROM services WHERE id=$1 AND is_active=TRUE`, [service_id]
    );
    if (!svcRows.length) return res.status(400).json({ success: false, message: 'Service not available' });
    const service = svcRows[0];

    // Calculate end time
    const [h,m] = start_time.split(':').map(Number);
    const endMins = h*60 + m + service.duration;
    const end_time = `${Math.floor(endMins/60).toString().padStart(2,'0')}:${(endMins%60).toString().padStart(2,'0')}`;

    // Check for slot conflict
    const conflictQuery = barber_id
      ? `SELECT id FROM bookings WHERE barber_id=$1 AND booking_date=$2 AND status IN ('pending','confirmed')
         AND start_time < $3::time AND end_time > $4::time`
      : `SELECT id FROM bookings WHERE booking_date=$1 AND status IN ('pending','confirmed')
         AND start_time < $2::time AND end_time > $3::time`;
    const conflictParams = barber_id
      ? [barber_id, date, end_time, start_time]
      : [date, end_time, start_time];

    const { rows: conflicts } = await client.query(conflictQuery, conflictParams);
    if (conflicts.length) {
      return res.status(409).json({ success: false, message: 'This time slot is no longer available. Please choose another.' });
    }

    // Generate unique reference code
    const refCode = `TT-${Math.floor(10000 + Math.random() * 90000)}`;

    const { rows } = await client.query(
      `INSERT INTO bookings
         (reference_code, customer_name, customer_phone, customer_email,
          service_id, barber_id, booking_date, start_time, end_time, price, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [refCode, customer_name, customer_phone, customer_email||null,
       service_id, barber_id||null, date, start_time, end_time, service.price, notes||null]
    );

    res.status(201).json({ success: true, data: { ...rows[0], service_name: service.name }, message: 'Booking confirmed!' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  } finally { client.release(); }
});

// PATCH update booking status (admin)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, cancellation_reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE bookings SET status=$1, cancellation_reason=$2 WHERE id=$3 RETURNING *`,
      [status, cancellation_reason||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE booking (admin)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM bookings WHERE id=$1`, [req.params.id]);
    res.json({ success: true, message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;