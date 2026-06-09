require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const pool    = require('./db/pool');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/services',   require('./routes/services'));
app.use('/api/barbers',    require('./routes/barbers'));
app.use('/api/bookings',   require('./routes/bookings'));
app.use('/api/customers',  require('./routes/customers'));  // ← new

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'postgresql', time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─── HTML page routes ─────────────────────────────────────────────────────────
// Serve specific pages explicitly so the wildcard doesn't swallow them
app.get('/',               (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/booking',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'booking.html')));
app.get('/customer',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'customer.html')));
app.get('/auth',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/login',          (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/cashier',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'cashier.html')));

// ─── 404 for unknown API routes ───────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ─── Fallback: serve index for any other GET (SPA behaviour) ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection error:', err.message);
    console.error('   Run: cp .env.example .env  and fill in your DB credentials');
  }
  console.log(`🚀 Treysson Trimz running on http://localhost:${PORT}`);
});