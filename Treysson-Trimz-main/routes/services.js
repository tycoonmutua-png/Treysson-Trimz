const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET all active services
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM services WHERE is_active = TRUE ORDER BY category, name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single service
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM services WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create service (admin)
router.post('/', async (req, res) => {
  try {
    const { name, description, duration, price, category } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO services (name, description, duration, price, category)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, description, duration, price, category || 'haircut']
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update service (admin)
router.put('/:id', async (req, res) => {
  try {
    const { name, description, duration, price, category, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE services SET name=$1, description=$2, duration=$3, price=$4,
       category=$5, is_active=$6 WHERE id=$7 RETURNING *`,
      [name, description, duration, price, category, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE (soft delete) service
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE services SET is_active = FALSE WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Service deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;