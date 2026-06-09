const pool = require('../db/pool');

module.exports = function authMiddleware({ optional = false } = {}) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      if (optional) return next();
      return res.status(401).json({ success: false, message: 'No auth token provided' });
    }

    try {
      const admin   = require('./firebase');
      const decoded = await admin.auth().verifyIdToken(token);

      let { rows } = await pool.query(
        `SELECT * FROM customers WHERE firebase_uid = $1`, [decoded.uid]
      );

      if (!rows.length) {
        const result = await pool.query(
          `INSERT INTO customers (firebase_uid, name, email, photo_url, provider)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [
            decoded.uid,
            decoded.name  || decoded.email?.split('@')[0] || 'Customer',
            decoded.email || null,
            decoded.picture || '',
            decoded.firebase?.sign_in_provider?.replace('.com','') || 'email',
          ]
        );
        rows = result.rows;
      }

      req.customer     = rows[0];
      req.firebaseUser = decoded;
      next();
    } catch (err) {
      if (optional) return next();
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
  };
};