const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET current customer profile
router.get('/me', auth(), async (req, res) => {
  res.json({ success: true, data: req.customer });
});

// PUT update profile
router.put('/me', auth(), async (req, res) => {
  try {
    const { name, phone } = req.body;
    const { rows } = await pool.query(
      `UPDATE customers SET name=$1, phone=$2 WHERE id=$3 RETURNING *`,
      [name, phone, req.customer.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET customer's own bookings
router.get('/me/bookings', auth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, s.name AS service_name, s.duration AS service_duration,
              br.name AS barber_name, br.photo AS barber_photo
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       LEFT JOIN barbers br ON br.id = b.barber_id
       WHERE b.customer_id = $1
       ORDER BY b.booking_date DESC, b.start_time DESC`,
      [req.customer.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST cancel a booking (customer can only cancel their own)
router.post('/me/bookings/:id/cancel', auth(), async (req, res) => {
  try {
    const { reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE bookings SET status='cancelled', cancellation_reason=$1
       WHERE id=$2 AND customer_id=$3
         AND status IN ('pending','confirmed')
       RETURNING *`,
      [reason || null, req.params.id, req.customer.id]
    );
    if (!rows.length) return res.status(404).json({
      success: false,
      message: 'Booking not found or cannot be cancelled'
    });
    res.json({ success: true, data: rows[0], message: 'Booking cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET active offers
router.get('/offers', auth({ optional: true }), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT * FROM offers
       WHERE is_active = TRUE AND valid_from <= $1 AND valid_until >= $1
       ORDER BY created_at DESC`,
      [today]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET active products
router.get('/products', auth({ optional: true }), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM products WHERE is_active = TRUE ORDER BY category, name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST sync Firebase user → creates/updates customer record
// Called on login from the frontend
router.post('/sync', auth(), async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = {};
    if (name)  updates.name  = name;
    if (phone) updates.phone = phone;

    if (Object.keys(updates).length) {
      const sets   = Object.keys(updates).map((k, i) => `${k}=$${i+1}`).join(', ');
      const vals   = [...Object.values(updates), req.customer.id];
      const { rows } = await pool.query(
        `UPDATE customers SET ${sets} WHERE id=$${vals.length} RETURNING *`, vals
      );
      return res.json({ success: true, data: rows[0] });
    }

    res.json({ success: true, data: req.customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;