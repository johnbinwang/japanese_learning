# 基于Resend的邮箱登录用户验证系统设计方案

## 1. 现状分析

### 当前认证系统
- **认证方式**: 基于8位访问码的匿名用户系统
- **用户表**: `users_anon` (id, access_code, created_at)
- **认证流程**: 通过 `X-Access-Code` 头部或 Cookie 验证
- **项目状态**: 尚未上线，无历史用户数据

### 改进目标
- 实现标准的邮箱+密码登录
- 提供更好的用户体验和安全性
- 支持密码找回功能
- 为后续功能扩展打好基础

## 2. 新系统设计目标

### 核心功能
- **邮箱注册/登录**: 用户使用邮箱和密码注册登录
- **邮箱验证**: 注册时发送验证邮件
- **密码重置**: 通过邮箱重置密码
- **会话管理**: JWT Token 或 Session 管理
- **数据迁移**: 现有匿名用户数据平滑迁移

### 技术选型
- **邮件服务**: Resend (免费额度: 3000封/月, 100封/天)
- **密码加密**: bcrypt
- **Token管理**: jsonwebtoken
- **验证码**: 6位数字验证码

## 3. 数据库架构设计

### 3.1 新增用户表
```sql
-- 正式用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMPTZ,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 用户会话表
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

-- 邮件发送记录表
CREATE TABLE email_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) NOT NULL, -- 'verification', 'password_reset', 'notification'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    resend_id VARCHAR(255), -- Resend API 返回的ID
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 现有表结构调整
```sql
-- 直接替换现有表的用户关联
-- 删除匿名用户表
DROP TABLE IF EXISTS users_anon CASCADE;

-- 修改现有表结构，直接使用user_id
ALTER TABLE reviews DROP COLUMN IF EXISTS anon_id;
ALTER TABLE reviews ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE learning_sessions DROP COLUMN IF EXISTS anon_id;
ALTER TABLE learning_sessions ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE daily_learning_stats DROP COLUMN IF EXISTS anon_id;
ALTER TABLE daily_learning_stats ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_learning_preferences DROP COLUMN IF EXISTS anon_id;
ALTER TABLE user_learning_preferences ADD COLUMN user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE;

-- 创建索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
```

## 4. API接口设计

### 4.1 认证相关接口
```javascript
// 用户注册
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123"
}

// 邮箱验证
GET /api/auth/verify-email?token=verification_token

// 用户登录
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

// 密码重置请求
POST /api/auth/forgot-password
{
  "email": "user@example.com"
}

// 密码重置确认
POST /api/auth/reset-password
{
  "token": "reset_token",
  "password": "new_password123"
}

// 用户登出
POST /api/auth/logout

// 刷新Token
POST /api/auth/refresh
```

### 4.2 现有接口改造
```javascript
// 认证中间件升级
// 统一使用JWT认证：
// Authorization: Bearer <jwt_token>

// 所有现有API保持不变，只需要更新认证方式
// GET /api/me - 获取用户信息
// POST /api/me - 更新用户信息  
// GET /api/preferences - 获取学习偏好
// POST /api/preferences - 更新学习偏好
// GET /api/next - 获取下一题
// POST /api/submit - 提交答案
// GET /api/progress - 获取学习进度
// GET /api/today-overview - 今日学习概览
```

## 5. 前端界面设计

### 5.1 新增页面
- **登录页面** (`/login`)
- **注册页面** (`/register`)
- **邮箱验证页面** (`/verify-email`)
- **忘记密码页面** (`/forgot-password`)
- **重置密码页面** (`/reset-password`)


### 5.2 现有页面改造
- **设置页面**: 添加邮箱管理、密码修改功能
- **首页**: 根据登录状态显示不同内容

### 5.3 路由设计
```javascript
const routes = {
  'login': () => showPage('login'),
  'register': () => showPage('register'),
  'verify-email': () => showPage('verify-email'),
  'forgot-password': () => showPage('forgot-password'),
  'reset-password': () => showPage('reset-password'),

  'learn': () => showPage('learn'),
  'progress': () => showPage('progress'),
  'settings': () => showPage('settings')
};
```

## 6. Resend集成方案

### 6.1 环境配置
```bash
# 新增环境变量
RESEND_API_KEY=re_xxxxxxxxxx
JWT_SECRET=your_jwt_secret_key
FRONT_END_URL=https://your-app.vercel.app
```

### 6.2 邮件模板
```javascript
// 邮箱验证邮件
const verificationEmailTemplate = {
  subject: '验证您的邮箱 - 日语学习应用',
  html: `
    <h2>欢迎使用日语学习应用！</h2>
    <p>请点击下面的链接验证您的邮箱：</p>
    <a href="${frontendUrl}/verify-email?token=${token}">验证邮箱</a>
    <p>此链接将在24小时后过期。</p>
  `
};

// 密码重置邮件
const passwordResetTemplate = {
  subject: '重置密码 - 日语学习应用',
  html: `
    <h2>重置您的密码</h2>
    <p>请点击下面的链接重置您的密码：</p>
    <a href="${frontendUrl}/reset-password?token=${token}">重置密码</a>
    <p>此链接将在1小时后过期。</p>
  `
};
```

### 6.3 邮件服务封装
```javascript
class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendVerificationEmail(email, token) {
    // 发送验证邮件
  }

  async sendPasswordResetEmail(email, token) {
    // 发送密码重置邮件
  }

  async logEmail(userId, email, type, status, resendId, error) {
    // 记录邮件发送日志
  }
}
```

## 7. 实施计划

### 阶段1: 基础架构 (1天)
1. 安装依赖包 (resend, bcrypt, jsonwebtoken)
2. 创建新的数据库表结构
3. 实现邮件服务封装
4. 创建JWT认证中间件

### 阶段2: 后端API (1-2天)
1. 实现用户注册/登录接口
2. 实现邮箱验证功能
3. 实现密码重置功能
4. 升级现有API接口认证方式

### 阶段3: 前端界面 (1-2天)
1. 创建登录/注册页面
2. 创建邮箱验证页面
3. 创建密码重置页面
4. 改造设置页面
5. 更新应用路由和状态管理

### 阶段4: 测试和部署 (1天)
1. 功能测试
2. 邮件发送测试
3. 生产环境部署
4. 数据库结构更新

## 8. 风险评估和应对

### 8.1 技术风险
- **邮件发送失败**: 实现重试机制和备用方案
- **数据迁移失败**: 提供回滚机制
- **性能影响**: 优化数据库查询和索引

### 8.2 用户体验风险
- **新用户注册**: 确保注册流程简单直观
- **邮箱验证**: 提供清晰的验证指引
- **密码安全**: 实现合理的密码强度要求

### 8.3 成本风险
- **邮件额度**: Resend免费额度3000封/月，足够初期使用
- **存储成本**: 新增表结构对存储影响较小

## 9. 成功指标

- **注册成功率**: >95%的用户能够成功完成注册流程
- **邮件送达率**: >98%的验证邮件成功发送
- **登录体验**: 平均登录时间<3秒
- **系统稳定性**: 99%的API可用性

## 10. 后续优化

- **社交登录**: 支持Google、Apple登录
- **多设备管理**: 显示和管理登录设备
- **邮件通知**: 学习提醒、进度报告等
- **用户画像**: 基于邮箱域名分析用户群体

---

**总结**: 该方案将现有的匿名访问码系统升级为完整的邮箱登录系统，提供更好的用户体验和数据安全性，同时确保现有用户数据的平滑迁移。