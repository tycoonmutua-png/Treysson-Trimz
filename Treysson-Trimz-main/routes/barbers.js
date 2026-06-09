const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET all active barbers
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, 
        COALESCE(json_agg(json_build_object(
          'day', bs.day, 'is_working', bs.is_working,
          'start_time', bs.start_time, 'end_time', bs.end_time
        ) ORDER BY 
          CASE bs.day WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 ELSE 7 END
        ) FILTER (WHERE bs.id IS NOT NULL), '[]') AS schedule
       FROM barbers b
       LEFT JOIN barber_schedules bs ON bs.barber_id = b.id
       WHERE b.is_active = TRUE
       GROUP BY b.id ORDER BY b.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single barber
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
        COALESCE(json_agg(json_build_object(
          'day', bs.day, 'is_working', bs.is_working,
          'start_time', bs.start_time, 'end_time', bs.end_time
        )) FILTER (WHERE bs.id IS NOT NULL), '[]') AS schedule
       FROM barbers b
       LEFT JOIN barber_schedules bs ON bs.barber_id = b.id
       WHERE b.id = $1 GROUP BY b.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Barber not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET slots for a specific barber on a date
router.get('/:id/slots', async (req, res) => {
  try {
    const { date, duration } = req.query;
    if (!date || !duration) return res.status(400).json({ success: false, message: 'date and duration required' });

    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const { rows: schedRows } = await pool.query(
      `SELECT * FROM barber_schedules WHERE barber_id=$1 AND day=$2`, [req.params.id, dayName]
    );
    if (!schedRows.length || !schedRows[0].is_working)
      return res.json({ success: true, data: [], message: 'Barber not working this day' });

    const { rows: bookings } = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE barber_id=$1 AND booking_date=$2 AND status IN ('pending','confirmed')`,
      [req.params.id, date]
    );
    const slots = generateSlots(schedRows[0].start_time, schedRows[0].end_time, parseInt(duration), bookings);
    res.json({ success: true, data: slots });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET slots across ALL barbers (any barber)
router.get('/available/slots', async (req, res) => {
  try {
    const { date, duration } = req.query;
    if (!date || !duration) return res.status(400).json({ success: false, message: 'date and duration required' });

    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const { rows: barbers } = await pool.query(
      `SELECT b.id, b.name, b.photo, bs.start_time, bs.end_time
       FROM barbers b
       JOIN barber_schedules bs ON bs.barber_id=b.id AND bs.day=$1 AND bs.is_working=TRUE
       WHERE b.is_active=TRUE`, [dayName]
    );

    const result = [];
    for (const barber of barbers) {
      const { rows: bookings } = await pool.query(
        `SELECT start_time, end_time FROM bookings
         WHERE barber_id=$1 AND booking_date=$2 AND status IN ('pending','confirmed')`,
        [barber.id, date]
      );
      const slots = generateSlots(barber.start_time, barber.end_time, parseInt(duration), bookings);
      if (slots.length > 0) result.push({ barber: { id: barber.id, name: barber.name, photo: barber.photo }, slots });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create barber (admin)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, phone, email, photo, bio, specialties, schedule } = req.body;
    const { rows } = await client.query(
      `INSERT INTO barbers (name,phone,email,photo,bio,specialties) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, phone, email, photo||'', bio, specialties||[]]
    );
    const barberId = rows[0].id;
    const days = schedule || defaultSchedule();
    for (const d of days) {
      await client.query(
        `INSERT INTO barber_schedules (barber_id,day,is_working,start_time,end_time) VALUES ($1,$2,$3,$4,$5)`,
        [barberId, d.day, d.is_working, d.start_time||'08:00', d.end_time||'18:00']
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally { client.release(); }
});

// PUT update barber
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, photo, bio, specialties, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE barbers SET name=$1,phone=$2,email=$3,photo=$4,bio=$5,specialties=$6,is_active=$7 WHERE id=$8 RETURNING *`,
      [name, phone, email, photo, bio, specialties, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Barber not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// PUT update schedule
router.put('/:id/schedule', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const d of req.body.schedule) {
      await client.query(
        `UPDATE barber_schedules SET is_working=$1,start_time=$2,end_time=$3 WHERE barber_id=$4 AND day=$5`,
        [d.is_working, d.start_time, d.end_time, req.params.id, d.day]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Schedule updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally { client.release(); }
});

// DELETE barber (soft)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE barbers SET is_active=FALSE WHERE id=$1`, [req.params.id]);
    res.json({ success: true, message: 'Barber deactivated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

function timeToMins(t) { const [h,m]=t.toString().split(':').map(Number); return h*60+m; }
function minsToTime(m) { return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`; }
function generateSlots(startTime, endTime, duration, bookings) {
  const slots=[], start=timeToMins(startTime), end=timeToMins(endTime);
  for (let t=start; t+duration<=end; t+=30) {
    const conflict=bookings.some(b=>{ const bS=timeToMins(b.start_time),bE=timeToMins(b.end_time); return t<bE&&(t+duration)>bS; });
    if (!conflict) slots.push({ start_time: minsToTime(t), end_time: minsToTime(t+duration) });
  }
  return slots;
}
function defaultSchedule() {
  return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({
    day, is_working: day!=='sunday', start_time:'08:00', end_time: day==='saturday'?'17:00':'18:00'
  }));
}

module.exports = router;