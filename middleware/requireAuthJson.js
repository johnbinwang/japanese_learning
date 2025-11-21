const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const formatAuthError = (res, code = 'UNAUTHORIZED', message = 'Login required.', statusCode = 401) => {
  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message
    }
  });
};

async function requireAuthJson(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return formatAuthError(res);
    }

    const token = authHeader.slice(7);
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return formatAuthError(res, 'UNAUTHORIZED', 'Login required.');
    }

    const { rows } = await pool.query(
      'SELECT id, email, email_verified, created_at, last_login_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (rows.length === 0) {
      return formatAuthError(res, 'UNAUTHORIZED', 'Login required.');
    }

    req.user = {
      id: rows[0].id,
      email: rows[0].email,
      emailVerified: rows[0].email_verified,
      createdAt: rows[0].created_at,
      lastLoginAt: rows[0].last_login_at,
      sessionId: decoded.sessionId
    };

    next();
  } catch (error) {
    console.error('[AI Auth] 验证失败', error);
    return formatAuthError(res, 'UNAUTHORIZED', 'Login required.');
  }
}

module.exports = {
  requireAuthJson
};
