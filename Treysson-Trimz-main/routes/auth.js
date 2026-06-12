require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'treysson-trimz-secret-2024';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    // Find staff by email
    const { rows } = await pool.query(
      `SELECT * FROM staff WHERE email = $1 AND is_active = TRUE`, [email]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const staff = rows[0];

    // Check password
    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/setup — create first staff accounts (disable after setup)
router.post('/setup', async (req, res) => {
  try {
    const { name, email, phone, password, role, setup_key } = req.body;
    if (setup_key !== process.env.SETUP_KEY) {
      return res.status(403).json({ success: false, message: 'Invalid setup key' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO staff (name, email, phone, password, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role`,
      [name, email, phone, hashed, role || 'cashier']
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/auth/verify — verify token
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;