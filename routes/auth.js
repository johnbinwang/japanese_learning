const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const EmailService = require('../services/emailService');
const { authenticateUser } = require('../middleware/authenticateUser');

const router = express.Router();
const emailService = new EmailService();

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 验证输入
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // 验证密码强度
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 检查邮箱是否已存在
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    // 加密密码
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const insertUserQuery = `
      INSERT INTO users (email, password_hash, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id, email, created_at
    `;
    
    const userResult = await pool.query(insertUserQuery, [
      email.toLowerCase(),
      hashedPassword
    ]);

    const user = userResult.rows[0];

    // 获取客户端IP
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // 生成验证码（带频率限制）
    const generateCodeQuery = 'SELECT * FROM generate_verification_code_with_rate_limit($1::UUID, $2::VARCHAR, $3::VARCHAR, $4::INTEGER, $5::INET)';
    const codeResult = await pool.query(generateCodeQuery, [
      user.id,
      email.toLowerCase(),
      'email_verification',
      10, // 10分钟过期
      clientIP || null
    ]);
    
    const result = codeResult.rows[0];
    if (!result.success) {
      return res.status(429).json({ error: result.message });
    }
    
    const verificationCode = result.code;

    // 发送验证邮件
    // console.log(`📧 [注册] 准备发送验证邮件 - 用户ID: ${user.id}, 邮箱: ${email}, 验证码: ${verificationCode}`);
    try {
      const emailResult = await emailService.sendVerificationEmail(email, verificationCode, user.id);
      // console.log(`📧 [注册] 验证邮件发送结果:`, emailResult);
      if (emailResult.success) {
        // console.log(`✅ [注册] 验证邮件发送成功 - MessageID: ${emailResult.messageId}`);
      } else {
        console.error(`❌ [注册] 验证邮件发送失败 - 错误: ${emailResult.error}`);
      }
    } catch (emailError) {
      console.error('❌ [注册] 发送验证邮件异常:', emailError);
      // 不阻止注册流程，但记录错误
    }

    res.status(201).json({
      message: '注册成功，请检查邮箱并输入4位数字验证码',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: false,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 验证输入
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // 查找用户
    const userQuery = 'SELECT id, email, password_hash, email_verified, last_login_at FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const user = userResult.rows[0];

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 检查邮箱是否已验证
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: '请先验证邮箱后再登录',
        needEmailVerification: true,
        email: user.email
      });
    }

    // 生成JWT token
    const sessionId = uuidv4();
    const token = jwt.sign(
      {
        userId: user.id,
        sessionId: sessionId,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 创建token hash用于数据库存储
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 创建会话
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天后过期

    await pool.query(
      'INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [sessionId, user.id, tokenHash, expiresAt]
    );

    // 更新用户最后登录时间
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        lastLoginAt: user.last_login_at
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 验证邮箱
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '邮箱和验证码不能为空' });
    }

    // 验证验证码
    const verifyQuery = 'SELECT * FROM verify_code($1, $2, $3)';
    const verifyResult = await pool.query(verifyQuery, [
      email.toLowerCase(),
      code,
      'email_verification'
    ]);

    const result = verifyResult.rows[0];
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // 查找用户并更新验证状态
    const userQuery = 'SELECT id, email FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];

    // 更新用户验证状态
    await pool.query(
      'UPDATE users SET email_verified = true WHERE id = $1',
      [user.id]
    );

    // 生成JWT token
    const sessionId = uuidv4();
    const token = jwt.sign(
      {
        userId: user.id,
        sessionId: sessionId,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 创建token hash用于数据库存储
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 创建会话
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天后过期

    await pool.query(
      'INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [sessionId, user.id, tokenHash, expiresAt]
    );

    res.json({
      message: '邮箱验证成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('邮箱验证错误:', error);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

// 发送验证邮件
router.post('/send-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    // 查找用户
    const userQuery = 'SELECT id, email, email_verified FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: '邮箱已验证' });
    }

    // 获取客户端IP
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // 生成验证码（带频率限制）
    const generateCodeQuery = 'SELECT * FROM generate_verification_code_with_rate_limit($1::UUID, $2::VARCHAR, $3::VARCHAR, $4::INTEGER, $5::INET)';
    const codeResult = await pool.query(generateCodeQuery, [
      user.id,
      email.toLowerCase(),
      'email_verification',
      10, // 10分钟过期
      clientIP || null
    ]);
    
    const result = codeResult.rows[0];
    if (!result.success) {
      return res.status(429).json({ error: result.message });
    }
    
    const verificationCode = result.code;

    // 发送验证邮件
    // console.log(`📧 [发送验证] 准备发送验证邮件 - 用户ID: ${user.id}, 邮箱: ${email}, 验证码: ${verificationCode}`);
    const emailResult = await emailService.sendVerificationEmail(email, verificationCode, user.id);
    // console.log(`📧 [发送验证] 验证邮件发送结果:`, emailResult);
    if (emailResult.success) {
      // console.log(`✅ [发送验证] 验证邮件发送成功 - MessageID: ${emailResult.messageId}`);
    } else {
      console.error(`❌ [发送验证] 验证邮件发送失败 - 错误: ${emailResult.error}`);
      throw new Error(emailResult.error);
    }

    res.json({ message: '验证邮件已发送' });

  } catch (error) {
    console.error('发送验证邮件错误:', error);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// 重新发送验证邮件
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    // 查找用户
    const userQuery = 'SELECT id, email, email_verified FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: '邮箱已验证' });
    }

    // 生成验证码
    const generateCodeQuery = 'SELECT generate_verification_code($1, $2, $3, $4) as code';
    const codeResult = await pool.query(generateCodeQuery, [
      user.id,
      email.toLowerCase(),
      'email_verification',
      10 // 10分钟过期
    ]);
    const verificationCode = codeResult.rows[0].code;

    // 发送验证邮件
    // console.log(`📧 [重发验证] 准备重发验证邮件 - 用户ID: ${user.id}, 邮箱: ${email}, 验证码: ${verificationCode}`);
    const emailResult = await emailService.sendVerificationEmail(email, verificationCode, user.id);
    // console.log(`📧 [重发验证] 验证邮件发送结果:`, emailResult);
    if (emailResult.success) {
      // console.log(`✅ [重发验证] 验证邮件发送成功 - MessageID: ${emailResult.messageId}`);
    } else {
      console.error(`❌ [重发验证] 验证邮件发送失败 - 错误: ${emailResult.error}`);
      throw new Error(emailResult.error);
    }

    res.json({ message: '验证邮件已重新发送' });

  } catch (error) {
    console.error('重发验证邮件错误:', error);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// 忘记密码
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    // 查找用户
    const userQuery = 'SELECT id, email FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      // 为了安全，即使用户不存在也返回成功消息
      return res.json({ message: '如果该邮箱存在，重置密码邮件已发送' });
    }

    const user = userResult.rows[0];

    // 获取客户端IP
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // 生成验证码（带频率限制）
    const generateCodeQuery = 'SELECT * FROM generate_verification_code_with_rate_limit($1::UUID, $2::VARCHAR, $3::VARCHAR, $4::INTEGER, $5::INET)';
    const codeResult = await pool.query(generateCodeQuery, [
      user.id,
      email.toLowerCase(),
      'password_reset',
      60, // 60分钟过期
      clientIP || null
    ]);
    
    const result = codeResult.rows[0];
    if (!result.success) {
      return res.status(429).json({ error: result.message });
    }
    
    const resetCode = result.code;

    // 发送重置密码邮件
    // console.log(`📧 [密码重置] 准备发送密码重置邮件 - 用户ID: ${user.id}, 邮箱: ${email}, 验证码: ${resetCode}`);
    const emailResult = await emailService.sendPasswordResetEmail(email, resetCode, user.id);
    // console.log(`📧 [密码重置] 密码重置邮件发送结果:`, emailResult);
    if (emailResult.success) {
      // console.log(`✅ [密码重置] 密码重置邮件发送成功 - MessageID: ${emailResult.messageId}`);
    } else {
      console.error(`❌ [密码重置] 密码重置邮件发送失败 - 错误: ${emailResult.error}`);
      // 不抛出错误，保持安全性
    }

    res.json({ message: '如果该邮箱存在，重置密码验证码已发送' });

  } catch (error) {
    console.error('忘记密码错误:', error);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// 重置密码
// 验证密码重置验证码
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '邮箱和验证码不能为空' });
    }

    // 验证验证码（不标记为已使用）
    const verifyQuery = 'SELECT * FROM check_code($1, $2, $3)';
    const verifyResult = await pool.query(verifyQuery, [
      email.toLowerCase(),
      code,
      'password_reset'
    ]);

    const result = verifyResult.rows[0];
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // 验证成功，返回成功消息
    // console.log(`✅ [密码重置] 验证码验证成功 - 邮箱: ${email}`);
    res.json({ message: '验证码验证成功' });

  } catch (error) {
    console.error('验证重置验证码错误:', error);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: '邮箱、验证码和新密码不能为空' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 验证验证码并标记为已使用
    const verifyQuery = 'SELECT * FROM verify_code($1, $2, $3)';
    const verifyResult = await pool.query(verifyQuery, [
      email.toLowerCase(),
      code,
      'password_reset'
    ]);

    const result = verifyResult.rows[0];
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // 查找用户
    const userQuery = 'SELECT id, email FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];

    // 加密新密码
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, user.id]
    );

    // console.log(`🔐 [密码重置] 用户 ${user.id} 密码重置成功`);

    res.json({ message: '密码重置成功' });

  } catch (error) {
    console.error('重置密码错误:', error);
    res.status(500).json({ error: '重置失败，请稍后重试' });
  }
});

// 退出登录
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.user;

    if (sessionId) {
      // 删除会话
      await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
    }

    res.json({ message: '登出成功' });

  } catch (error) {
    console.error('登出错误:', error);
    res.status(500).json({ error: '登出失败' });
  }
});

// 获取当前用户信息
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 刷新token
router.post('/refresh-token', authenticateUser, async (req, res) => {
  try {
    const { id: userId, sessionId } = req.user;

    // 检查会话是否仍然有效
    const sessionQuery = 'SELECT expires_at FROM user_sessions WHERE id = $1 AND user_id = $2';
    const sessionResult = await pool.query(sessionQuery, [sessionId, userId]);

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: '会话已失效' });
    }

    const session = sessionResult.rows[0];
    if (new Date() > new Date(session.expires_at)) {
      await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
      return res.status(401).json({ error: '会话已过期' });
    }

    // 生成新的JWT token
    const newToken = jwt.sign(
      {
        userId,
        sessionId,
        email: req.user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Token刷新成功',
      token: newToken
    });

  } catch (error) {
    console.error('刷新token错误:', error);
    res.status(500).json({ error: 'Token刷新失败' });
  }
});

module.exports = router;