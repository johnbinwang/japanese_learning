const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const EmailService = require('../services/emailService');
const { authenticateUser } = require('../middleware/authenticateUser');

const router = express.Router();
const emailService = new EmailService();

// 请求密码重置
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // 查找用户
    const userQuery = 'SELECT id, email FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    // 无论用户是否存在，都返回成功消息（安全考虑）
    if (userResult.rows.length === 0) {
      return res.json({ message: '如果该邮箱已注册，您将收到密码重置邮件' });
    }

    const user = userResult.rows[0];

    // 检查是否在短时间内重复请求
    const recentResetQuery = `
      SELECT created_at FROM password_reset_tokens 
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC LIMIT 1
    `;
    const recentReset = await pool.query(recentResetQuery, [user.id]);

    if (recentReset.rows.length > 0) {
      return res.status(429).json({ error: '请等待5分钟后再次请求密码重置' });
    }

    // 生成重置token
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1小时后过期

    // 保存重置token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES ($1, $2, $3, NOW())',
      [user.id, resetToken, expiresAt]
    );

    // 发送重置邮件
    try {
      await emailService.sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      // console.error('发送密码重置邮件失败:', emailError);
      return res.status(500).json({ error: '邮件发送失败，请稍后重试' });
    }

    res.json({ message: '如果该邮箱已注册，您将收到密码重置邮件' });

  } catch (error) {
    console.error('密码重置请求错误:', error);
    res.status(500).json({ error: '请求失败，请稍后重试' });
  }
});

// 验证重置token
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // 查找有效的重置token
    const tokenQuery = `
      SELECT prt.user_id, prt.expires_at, u.email
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()
    `;
    const tokenResult = await pool.query(tokenQuery, [token]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: '重置链接无效或已过期' });
    }

    const tokenData = tokenResult.rows[0];

    res.json({
      message: '重置链接有效',
      email: tokenData.email,
      expiresAt: tokenData.expires_at
    });

  } catch (error) {
    // console.error('验证重置token错误:', error);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

// 重置密码
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: '重置token和新密码不能为空' });
    }

    // 验证密码强度
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 查找有效的重置token
    const tokenQuery = `
      SELECT prt.user_id, u.email
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()
    `;
    const tokenResult = await pool.query(tokenQuery, [token]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: '重置链接无效或已过期' });
    }

    const tokenData = tokenResult.rows[0];

    // 加密新密码
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // 开始事务
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 更新用户密码
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, tokenData.user_id]
      );

      // 标记token为已使用
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1',
        [token]
      );

      // 删除该用户的所有活跃会话（强制重新登录）
      await client.query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [tokenData.user_id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // 发送密码重置成功通知邮件
    try {
      await emailService.sendNotificationEmail(
        tokenData.email,
        '密码重置成功',
        '您的密码已成功重置。如果这不是您的操作，请立即联系我们。'
      );
    } catch (emailError) {
      // console.error('发送密码重置成功通知失败:', emailError);
      // 不阻止重置流程
    }

    res.json({ message: '密码重置成功，请使用新密码登录' });

  } catch (error) {
    // console.error('密码重置错误:', error);
    res.status(500).json({ error: '密码重置失败，请稍后重试' });
  }
});

// 修改密码（已登录用户）
router.post('/change-password', authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '当前密码和新密码不能为空' });
    }

    // 验证新密码强度
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' });
    }

    // 获取用户当前密码
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];

    // 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: '当前密码错误' });
    }

    // 检查新密码是否与当前密码相同
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ error: '新密码不能与当前密码相同' });
    }

    // 加密新密码
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedNewPassword, userId]
    );

    // 删除除当前会话外的所有会话
    await pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND id != $2',
      [userId, req.user.sessionId]
    );

    res.json({ message: '密码修改成功' });

  } catch (error) {
    // console.error('修改密码错误:', error);
    res.status(500).json({ error: '密码修改失败，请稍后重试' });
  }
});

module.exports = router;