const admin = require('./firebase');
const pool  = require('../db/pool');

// Verifies Firebase token and attaches customer to req.customer
// Pass { optional: true } to allow unauthenticated requests through
module.exports = function authMiddleware({ optional = false } = {}) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      if (optional) return next();
      return res.status(401).json({ success: false, message: 'No auth token provided' });
    }

    try {
      // Verify the token with Firebase Admin
      const decoded = await admin.auth().verifyIdToken(token);

      // Look up or create customer record in PostgreSQL
      let { rows } = await pool.query(
        `SELECT * FROM customers WHERE firebase_uid = $1`, [decoded.uid]
      );

      if (!rows.length) {
        // Auto-create customer on first login
        const result = await pool.query(
          `INSERT INTO customers (firebase_uid, name, email, photo_url, provider)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [
            decoded.uid,
            decoded.name  || decoded.email?.split('@')[0] || 'Customer',
            decoded.email || null,
            decoded.picture || '',
            decoded.firebase?.sign_in_provider?.replace('.com', '') || 'email',
          ]
        );
        rows = result.rows;
      }

      req.customer = rows[0];
      req.firebaseUser = decoded;
      next();
    } catch (err) {
      if (optional) return next();
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
  };
};