const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');

// Simple authenticate/bind middleware
// - Reads X-Access-Code header for binding existing anon user
// - If no header, ensures a device session by creating a new anon user if missing
// - Attaches req.user = { anonId, accessCode }
module.exports = async function authenticateUser(req, res, next) {
  try {
    // Ensure JSON body/headers are parsed (express.json should be applied in app)
    const accessCode = req.header('X-Access-Code');
    const cookieAnonId = req.cookies.anon_id;

    if (accessCode) {
      // Try find existing user by access_code
      const { rows } = await pool.query('SELECT id, access_code, created_at FROM users_anon WHERE access_code = $1', [accessCode]);
      if (rows.length === 0) {
        return res.status(400).json({ error: '访问码无效' });
      }
      req.user = { anonId: rows[0].id, accessCode: rows[0].access_code, createdAt: rows[0].created_at };
      return next();
    }

    if (cookieAnonId) {
      // Try find existing user by anon_id from cookie
      const { rows } = await pool.query('SELECT id, access_code, created_at FROM users_anon WHERE id = $1', [cookieAnonId]);
      if (rows.length > 0) {
        req.user = { anonId: rows[0].id, accessCode: rows[0].access_code, createdAt: rows[0].created_at };
        return next();
      }
    }

    // No access code provided: create or reuse a pseudo session per-IP (minimal)
    // For simplicity, create a new anon user if not present in a temporary header
    // In a real app, you might use cookies or persistent storage
    const newAccessCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit

    // Create anon user
    const insertSql = `INSERT INTO users_anon (id, access_code) VALUES ($1, $2) RETURNING id, access_code, created_at`;
    const newId = uuidv4();
    const { rows: created } = await pool.query(insertSql, [newId, newAccessCode]);

    req.user = { anonId: created[0].id, accessCode: created[0].access_code, createdAt: created[0].created_at };
    return next();
  } catch (err) {
    console.error('authenticateUser error:', err);
    return res.status(500).json({ error: '认证失败' });
  }
};