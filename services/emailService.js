const { Resend } = require('resend');
const pool = require('../db/pool');

class EmailService {
  constructor() {
    this.apiKey = process.env.RESEND_API_KEY;
    this.isSimulationMode = !this.apiKey || this.apiKey === 'your_resend_api_key_here';
    
    if (!this.isSimulationMode) {
      this.resend = new Resend(this.apiKey);
    }
    
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@yourdomain.com';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    if (this.isSimulationMode) {
      console.log('📧 EmailService运行在模拟模式 - 邮件将被模拟发送');
    }
  }

  /**
   * 发送邮箱验证邮件
   * @param {string} email - 用户邮箱
   * @param {string} code - 验证码
   * @param {string} userId - 用户ID
   */
  async sendVerificationEmail(email, code, userId) {
    // console.log(`🔧 [EmailService] 开始发送验证邮件 - 用户ID: ${userId}, 邮箱: ${email}`);
    // // console.log(`🔧 [EmailService] 邮件服务配置 - 模拟模式: ${this.isSimulationMode}, 发件人: ${this.fromEmail}`);
    
    try {
      // console.log(`🔧 [EmailService] 验证码: ${code}`);
      
      const emailData = {
        from: this.fromEmail,
        to: email,
        subject: '验证您的邮箱 - 日语学习应用',
        html: this.getVerificationEmailTemplate(code)
      };
      // console.log(`🔧 [EmailService] 邮件数据准备完成:`, { from: emailData.from, to: emailData.to, subject: emailData.subject });

      // 记录邮件发送日志
      // // console.log(`🔧 [EmailService] 记录邮件日志 - 状态: pending`);
      await this.logEmail(userId, email, 'verification', 'pending');

      let result;
      if (this.isSimulationMode) {
        // 模拟模式：不实际发送邮件
        // console.log(`📧 [模拟] 验证邮件发送至: ${email}`);
        // console.log(`📧 [模拟] 验证码: ${code}`);
        result = { id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
        // // // console.log(`📧 [模拟] 生成模拟MessageID: ${result.id}`);
      } else {
        // // console.log(`🔧 [EmailService] 调用Resend API发送邮件...`);
        result = await this.resend.emails.send(emailData);
        // // console.log(`🔧 [EmailService] Resend API响应:`, result);
      }

      // 获取正确的MessageID
      const messageId = this.isSimulationMode ? result.id : result.data?.id;
      // // console.log(`🔧 [EmailService] 提取MessageID: ${messageId}`);

      // 更新邮件发送状态
      // // console.log(`🔧 [EmailService] 更新邮件日志 - 状态: sent, MessageID: ${messageId}`);
      await this.logEmail(userId, email, 'verification', 'sent', messageId);
      
      // console.log(`✅ [EmailService] 验证邮件发送成功 - MessageID: ${messageId}`);
      return {
        success: true,
        messageId: messageId
      };
    } catch (error) {
      // console.error('❌ [EmailService] 发送验证邮件失败:', error);
      console.error('❌ [EmailService] 错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // 记录错误
      try {
        // console.log(`🔧 [EmailService] 记录邮件错误日志`);
        await this.logEmail(userId, email, 'verification', 'failed', null, error.message);
      } catch (logError) {
        // console.error('❌ [EmailService] 记录错误日志失败:', logError);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送密码重置邮件
   * @param {string} email - 用户邮箱
   * @param {string} code - 重置验证码
   * @param {string} userId - 用户ID
   */
  async sendPasswordResetEmail(email, code, userId) {
    // console.log(`🔧 [EmailService] 开始发送密码重置邮件 - 用户ID: ${userId}, 邮箱: ${email}`);
    console.log(`🔧 [EmailService] 邮件服务配置 - 模拟模式: ${this.isSimulationMode}, 发件人: ${this.fromEmail}`);
    
    try {
      // console.log(`🔧 [EmailService] 重置验证码: ${code}`);
      
      const emailData = {
        from: this.fromEmail,
        to: email,
        subject: '重置密码 - 日语学习应用',
        html: this.getPasswordResetEmailTemplate(code)
      };
      // console.log(`🔧 [EmailService] 邮件数据准备完成:`, { from: emailData.from, to: emailData.to, subject: emailData.subject });

      // 记录邮件发送日志
      console.log(`🔧 [EmailService] 记录邮件日志 - 状态: pending`);
      await this.logEmail(userId, email, 'password_reset', 'pending');

      let result;
      if (this.isSimulationMode) {
        // 模拟模式：不实际发送邮件
        // console.log(`📧 [模拟] 密码重置邮件发送至: ${email}`);
        // console.log(`📧 [模拟] 重置验证码: ${code}`);
        result = { id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
        console.log(`📧 [模拟] 生成模拟MessageID: ${result.id}`);
      } else {
        console.log(`🔧 [EmailService] 调用Resend API发送邮件...`);
        result = await this.resend.emails.send(emailData);
        console.log(`🔧 [EmailService] Resend API响应:`, result);
      }

      // 获取正确的MessageID
      const messageId = this.isSimulationMode ? result.id : result.data?.id;
      console.log(`🔧 [EmailService] 提取MessageID: ${messageId}`);

      // 更新邮件发送状态
      console.log(`🔧 [EmailService] 更新邮件日志 - 状态: sent, MessageID: ${messageId}`);
      await this.logEmail(userId, email, 'password_reset', 'sent', messageId);
      
      console.log(`✅ [EmailService] 密码重置邮件发送成功 - MessageID: ${messageId}`);
      return {
        success: true,
        messageId: messageId
      };
    } catch (error) {
      console.error('❌ [EmailService] 发送密码重置邮件失败:', error);
      console.error('❌ [EmailService] 错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // 记录错误
      try {
        console.log(`🔧 [EmailService] 记录邮件错误日志`);
        await this.logEmail(userId, email, 'password_reset', 'failed', null, error.message);
      } catch (logError) {
        console.error('❌ [EmailService] 记录错误日志失败:', logError);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送通知邮件
   * @param {string} email - 用户邮箱
   * @param {string} subject - 邮件主题
   * @param {string} content - 邮件内容
   * @param {string} userId - 用户ID
   */
  async sendNotificationEmail(email, subject, content, userId) {
    try {
      const emailData = {
        from: this.fromEmail,
        to: email,
        subject: subject,
        html: this.getNotificationEmailTemplate(content)
      };

      // 记录邮件发送日志
      await this.logEmail(userId, email, 'notification', 'pending');

      let result;
      if (this.isSimulationMode) {
        // 模拟模式：不实际发送邮件
        console.log(`📧 [模拟] 通知邮件发送至: ${email}`);
        console.log(`📧 [模拟] 主题: ${subject}`);
        result = { id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
      } else {
        result = await this.resend.emails.send(emailData);
      }

      // 更新邮件发送状态
      await this.logEmail(userId, email, 'notification', 'sent', result.id);

      return {
        success: true,
        messageId: result.id
      };
    } catch (error) {
      console.error('发送通知邮件失败:', error);
      
      // 记录错误
      await this.logEmail(userId, email, 'notification', 'failed', null, error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 记录邮件发送日志
   * @param {string} userId - 用户ID
   * @param {string} email - 邮箱地址
   * @param {string} emailType - 邮件类型
   * @param {string} status - 发送状态
   * @param {string} resendId - Resend返回的ID
   * @param {string} errorMessage - 错误信息
   */
  async logEmail(userId, email, emailType, status, resendId = null, errorMessage = null) {
    try {
      // 如果userId为空或测试用户，跳过日志记录
      if (!userId || userId === 'test-user-id') {
        console.log(`跳过邮件日志记录 - 测试模式或无效用户ID: ${userId}`);
        return;
      }
      
      // 检查用户是否存在
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        console.log(`跳过邮件日志记录 - 用户不存在: ${userId}`);
        return;
      }
      
      const query = `
        INSERT INTO email_logs (user_id, email, email_type, status, resend_id, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const sentAt = status === 'sent' ? new Date() : null;
      
      await pool.query(query, [
        userId,
        email,
        emailType,
        status,
        resendId,
        errorMessage,
        sentAt
      ]);
      
      console.log(`邮件日志记录成功: ${emailType} -> ${email}`);
    } catch (error) {
      console.error('记录邮件日志失败:', error);
      // 不抛出错误，避免影响邮件发送
    }
  }

  /**
   * 获取邮箱验证邮件模板
   * @param {string} verificationCode - 验证码
   */
  getVerificationEmailTemplate(verificationCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>验证您的邮箱</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 8px; }
          .code-box { background: #fff; border: 2px solid #4F46E5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
          .verification-code { font-size: 32px; font-weight: bold; color: #4F46E5; letter-spacing: 4px; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">日语学习应用</div>
          </div>
          
          <div class="content">
            <h2>欢迎使用日语学习应用！</h2>
            <p>感谢您注册我们的日语学习应用。为了确保您的账户安全，请使用以下验证码完成邮箱验证：</p>
            
            <div class="code-box">
              <div class="verification-code">${verificationCode}</div>
            </div>
            
            <p style="text-align: center; color: #666;">请在注册页面输入上述验证码</p>
            
            <p><strong>注意：</strong>此验证码将在10分钟后过期。如果您没有注册此账户，请忽略此邮件。</p>
          </div>
          
          <div class="footer">
            <p>此邮件由系统自动发送，请勿回复。</p>
            <p>© 2025 日语学习应用. 保留所有权利。</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * 获取密码重置邮件模板
   * @param {string} resetCode - 重置验证码
   */
  getPasswordResetEmailTemplate(resetCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>重置您的密码</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 8px; }
          .code-box { background: #fff; border: 2px solid #DC2626; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
          .reset-code { font-size: 32px; font-weight: bold; color: #DC2626; letter-spacing: 4px; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .warning { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">日语学习应用</div>
          </div>
          
          <div class="content">
            <h2>重置您的密码</h2>
            <p>我们收到了重置您账户密码的请求。如果这是您本人的操作，请使用以下验证码重置密码：</p>
            
            <div class="code-box">
              <div class="reset-code">${resetCode}</div>
            </div>
            
            <p style="text-align: center; color: #666;">请在密码重置页面输入上述验证码</p>
            
            <div class="warning">
              <strong>安全提醒：</strong>
              <ul>
                <li>此验证码将在1小时后过期</li>
                <li>如果您没有请求重置密码，请忽略此邮件</li>
                <li>为了账户安全，请设置一个强密码</li>
              </ul>
            </div>
          </div>
          
          <div class="footer">
            <p>此邮件由系统自动发送，请勿回复。</p>
            <p>© 2025 日语学习应用. 保留所有权利。</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * 获取通知邮件模板
   * @param {string} content - 邮件内容
   */
  getNotificationEmailTemplate(content) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>日语学习应用通知</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 8px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">日语学习应用</div>
          </div>
          
          <div class="content">
            ${content}
          </div>
          
          <div class="footer">
            <p>此邮件由系统自动发送，请勿回复。</p>
            <p>© 2025 日语学习应用. 保留所有权利。</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * 获取用户的邮件发送历史
   * @param {string} userId - 用户ID
   * @param {number} limit - 限制数量
   */
  async getUserEmailHistory(userId, limit = 10) {
    try {
      const query = `
        SELECT email_type, status, sent_at, error_message
        FROM email_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      
      const result = await pool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error('获取邮件历史失败:', error);
      return [];
    }
  }

  /**
   * 检查邮件发送频率限制
   * @param {string} email - 邮箱地址
   * @param {string} emailType - 邮件类型
   * @param {number} minutes - 时间窗口（分钟）
   */
  async checkRateLimit(email, emailType, minutes = 5) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM email_logs
        WHERE email = $1 AND email_type = $2 AND created_at > NOW() - INTERVAL '${minutes} minutes'
      `;
      
      const result = await pool.query(query, [email, emailType]);
      const count = parseInt(result.rows[0].count);
      
      // 每5分钟最多发送3封同类型邮件
      return count < 3;
    } catch (error) {
      console.error('检查发送频率限制失败:', error);
      return true; // 出错时允许发送
    }
  }
}

module.exports = EmailService;