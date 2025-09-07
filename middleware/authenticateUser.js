const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const authenticateUser = async (req, res, next) => {
  try {
    // 从Authorization头部获取JWT token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '需要有效的认证token' });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    
    // 验证JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token已过期' });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: '无效的token' });
      } else {
        return res.status(401).json({ error: 'Token验证失败' });
      }
    }

    // 查询用户信息
    const userQuery = 'SELECT id, email, email_verified, created_at, last_login_at FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];
    
    // 检查邮箱是否已验证（某些接口可能需要）
    if (req.requireEmailVerified && !user.email_verified) {
      return res.status(403).json({ error: '请先验证您的邮箱' });
    }

    // 更新会话最后使用时间
    if (decoded.sessionId) {
      await pool.query(
        'UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1 AND user_id = $2',
        [decoded.sessionId, decoded.userId]
      );
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: user.id,
      email: user.email,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      sessionId: decoded.sessionId
    };
    
    next();
  } catch (error) {
    console.error('认证错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
};

// 中间件：要求邮箱已验证
const requireEmailVerified = (req, res, next) => {
  req.requireEmailVerified = true;
  authenticateUser(req, res, next);
};

// 中间件：可选认证（用于某些公开接口）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const userQuery = 'SELECT id, email, email_verified FROM users WHERE id = $1';
      const userResult = await pool.query(userQuery, [decoded.userId]);
      
      if (userResult.rows.length > 0) {
        req.user = {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          emailVerified: userResult.rows[0].email_verified,
          sessionId: decoded.sessionId
        };
      } else {
        req.user = null;
      }
    } catch (jwtError) {
      req.user = null;
    }
    
    next();
  } catch (error) {
    console.error('可选认证错误:', error);
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateUser,
  requireEmailVerified,
  optionalAuth
};