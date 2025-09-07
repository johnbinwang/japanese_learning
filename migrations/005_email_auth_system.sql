-- 邮箱登录系统数据库迁移
-- 创建时间: 2025-01-07
-- 描述: 替换匿名用户系统为邮箱登录系统

-- 1. 创建正式用户表
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

-- 2. 创建用户会话表
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

-- 3. 创建邮件发送记录表
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

-- 4. 删除依赖anon_id的视图
DROP VIEW IF EXISTS today_learning_overview CASCADE;
DROP VIEW IF EXISTS mode_comparison_analysis CASCADE;

-- 5. 删除匿名用户表（如果存在）
DROP TABLE IF EXISTS users_anon CASCADE;

-- 6. 清空现有数据（因为无法迁移匿名用户数据到邮箱用户）
TRUNCATE TABLE reviews CASCADE;
TRUNCATE TABLE learning_sessions CASCADE;
TRUNCATE TABLE daily_learning_stats CASCADE;
TRUNCATE TABLE user_learning_preferences CASCADE;

-- 7. 修改现有表结构，替换anon_id为user_id
-- reviews表
ALTER TABLE reviews DROP COLUMN IF EXISTS anon_id;
ALTER TABLE reviews ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

-- learning_sessions表
ALTER TABLE learning_sessions DROP COLUMN IF EXISTS anon_id;
ALTER TABLE learning_sessions ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

-- daily_learning_stats表
ALTER TABLE daily_learning_stats DROP COLUMN IF EXISTS anon_id;
ALTER TABLE daily_learning_stats ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

-- user_learning_preferences表
ALTER TABLE user_learning_preferences DROP COLUMN IF EXISTS anon_id;
ALTER TABLE user_learning_preferences ADD COLUMN user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE;

-- 8. 创建索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_learning_sessions_user_id ON learning_sessions(user_id);
CREATE INDEX idx_daily_learning_stats_user_id ON daily_learning_stats(user_id);
CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX idx_email_logs_status ON email_logs(status);

-- 9. 添加约束
ALTER TABLE email_logs ADD CONSTRAINT chk_email_type 
    CHECK (email_type IN ('verification', 'password_reset', 'notification'));

ALTER TABLE email_logs ADD CONSTRAINT chk_status 
    CHECK (status IN ('pending', 'sent', 'failed'));

-- 10. 创建触发器更新updated_at字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. 插入默认的学习偏好设置（当用户注册时会自动创建）
-- 这将在应用层处理，不在数据库层设置默认值

COMMIT;