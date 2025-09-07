-- 日语形态练习应用数据库架构
-- 邮箱登录系统版本
-- 更新时间: 2025-01-07

-- 1. 正式用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 2. 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

-- 3. 验证码表
CREATE TABLE IF NOT EXISTS verification_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code CHAR(4) NOT NULL,
    code_type VARCHAR(20) NOT NULL, -- 'email_verification', 'password_reset'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 确保同一用户同一类型只能有一个有效验证码
    CONSTRAINT unique_active_code UNIQUE(user_id, code_type, expires_at)
);

-- 4. 邮件发送记录表
CREATE TABLE IF NOT EXISTS email_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) NOT NULL, -- 'verification', 'password_reset', 'notification'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    resend_id VARCHAR(255), -- Resend API 返回的ID
    verification_code CHAR(4), -- 发送的验证码
    code_type VARCHAR(20), -- 验证码类型
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 动词表
CREATE TABLE IF NOT EXISTS verbs (
    id SERIAL PRIMARY KEY,
    kana TEXT NOT NULL,
    kanji TEXT,
    group_type CHAR(3) NOT NULL CHECK (group_type IN ('I', 'II', 'IRR')),
    meaning TEXT NOT NULL
);

-- 6. 形容词表
CREATE TABLE IF NOT EXISTS adjectives (
    id SERIAL PRIMARY KEY,
    kana TEXT NOT NULL,
    kanji TEXT,
    type CHAR(2) NOT NULL CHECK (type IN ('i', 'na')),
    meaning TEXT NOT NULL
);

-- 7. 简体形专用表
CREATE TABLE IF NOT EXISTS plain (
    id SERIAL PRIMARY KEY,
    kana TEXT NOT NULL,
    kanji TEXT,
    item_type CHAR(3) NOT NULL CHECK (item_type IN ('vrb', 'adj')),
    group_type CHAR(3) CHECK (group_type IN ('I', 'II', 'IRR')), -- 仅动词使用
    adj_type CHAR(2) CHECK (adj_type IN ('i', 'na')), -- 仅形容词使用
    meaning TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 复习记录表
CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type CHAR(3) NOT NULL CHECK (item_type IN ('vrb', 'adj', 'pln')),
    item_id INTEGER NOT NULL,
    form TEXT NOT NULL,
    learning_mode VARCHAR(10) DEFAULT 'quiz' CHECK (learning_mode IN ('quiz', 'flashcard')),
    attempts INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    due_at TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, item_type, item_id, form, learning_mode)
);

-- 9. 学习会话记录表
CREATE TABLE IF NOT EXISTS learning_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    learning_mode VARCHAR(10) NOT NULL CHECK (learning_mode IN ('quiz', 'flashcard')),
    module_type CHAR(3) NOT NULL CHECK (module_type IN ('vrb', 'adj', 'pln')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    new_items_learned INTEGER DEFAULT 0,
    reviews_completed INTEGER DEFAULT 0,
    session_duration_seconds INTEGER DEFAULT 0
);

-- 10. 每日学习统计表
CREATE TABLE IF NOT EXISTS daily_learning_stats (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    learning_mode VARCHAR(10) NOT NULL CHECK (learning_mode IN ('quiz', 'flashcard')),
    module_type CHAR(3) NOT NULL CHECK (module_type IN ('vrb', 'adj', 'pln')),
    new_items_target INTEGER DEFAULT 0,
    new_items_completed INTEGER DEFAULT 0,
    reviews_due INTEGER DEFAULT 0,
    reviews_completed INTEGER DEFAULT 0,
    total_study_time_seconds INTEGER DEFAULT 0,
    accuracy_rate DECIMAL(5,2) DEFAULT 0.00,
    streak_improvements INTEGER DEFAULT 0,
    UNIQUE(user_id, stat_date, learning_mode, module_type)
);

-- 11. 用户学习偏好表
CREATE TABLE IF NOT EXISTS user_learning_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_new_target INTEGER DEFAULT 10,
    daily_review_target INTEGER DEFAULT 50,
    preferred_mode VARCHAR(10) DEFAULT 'quiz' CHECK (preferred_mode IN ('quiz', 'flashcard')),
    study_streak_days INTEGER DEFAULT 0,
    last_study_date DATE,
    total_study_time_seconds BIGINT DEFAULT 0
);

-- 创建索引以提高查询性能

-- 用户相关索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 会话相关索引
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);

-- 验证码相关索引
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_type ON verification_codes(code_type);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- 邮件日志相关索引
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_code_type ON email_logs(code_type);

-- 学习内容相关索引
CREATE INDEX IF NOT EXISTS idx_verbs_group ON verbs(group_type);
CREATE INDEX IF NOT EXISTS idx_adjectives_type ON adjectives(type);
CREATE INDEX IF NOT EXISTS idx_plain_item_type ON plain(item_type);
CREATE INDEX IF NOT EXISTS idx_plain_group_type ON plain(group_type);
CREATE INDEX IF NOT EXISTS idx_plain_adj_type ON plain(adj_type);

-- 学习记录相关索引
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_due_at ON reviews(due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_learning_mode ON reviews(learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id_learning_mode ON reviews(user_id, learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_item_type_learning_mode ON reviews(item_type, learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_item_type ON reviews(item_type);

-- 学习统计相关索引
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_learning_stats_user_id ON daily_learning_stats(user_id);

-- 添加约束
ALTER TABLE email_logs ADD CONSTRAINT IF NOT EXISTS chk_email_type 
    CHECK (email_type IN ('verification', 'password_reset', 'notification'));

ALTER TABLE email_logs ADD CONSTRAINT IF NOT EXISTS chk_status 
    CHECK (status IN ('pending', 'sent', 'failed'));

-- 验证码表约束
ALTER TABLE verification_codes ADD CONSTRAINT IF NOT EXISTS chk_code_type 
    CHECK (code_type IN ('email_verification', 'password_reset'));

ALTER TABLE verification_codes ADD CONSTRAINT IF NOT EXISTS chk_code_format 
    CHECK (code ~ '^[0-9]{4}$');

ALTER TABLE verification_codes ADD CONSTRAINT IF NOT EXISTS chk_max_attempts 
    CHECK (max_attempts > 0 AND max_attempts <= 10);

ALTER TABLE verification_codes ADD CONSTRAINT IF NOT EXISTS chk_attempts 
    CHECK (attempts >= 0 AND attempts <= max_attempts);

-- 创建触发器更新updated_at字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图

-- 今日学习概览视图
CREATE OR REPLACE VIEW today_learning_overview AS
SELECT 
    u.user_id,
    u.daily_new_target,
    u.daily_review_target,
    u.study_streak_days,
    COALESCE(SUM(CASE WHEN ds.learning_mode = 'quiz' THEN ds.new_items_completed ELSE 0 END), 0) as quiz_new_completed,
    COALESCE(SUM(CASE WHEN ds.learning_mode = 'flashcard' THEN ds.new_items_completed ELSE 0 END), 0) as flashcard_new_completed,
    COALESCE(SUM(CASE WHEN ds.learning_mode = 'quiz' THEN ds.reviews_completed ELSE 0 END), 0) as quiz_reviews_completed,
    COALESCE(SUM(CASE WHEN ds.learning_mode = 'flashcard' THEN ds.reviews_completed ELSE 0 END), 0) as flashcard_reviews_completed,
    COALESCE(SUM(ds.total_study_time_seconds), 0) as total_study_time_today,
    COALESCE(AVG(CASE WHEN ds.learning_mode = 'quiz' THEN ds.accuracy_rate END), 0) as quiz_accuracy_today,
    COALESCE(AVG(CASE WHEN ds.learning_mode = 'flashcard' THEN ds.accuracy_rate END), 0) as flashcard_accuracy_today
FROM user_learning_preferences u
LEFT JOIN daily_learning_stats ds ON u.user_id = ds.user_id AND ds.stat_date = CURRENT_DATE
GROUP BY u.user_id, u.daily_new_target, u.daily_review_target, u.study_streak_days;

-- 模式对比分析视图
CREATE OR REPLACE VIEW mode_comparison_analysis AS
SELECT 
    user_id,
    -- Quiz模式统计
    COALESCE(SUM(CASE WHEN learning_mode = 'quiz' THEN new_items_completed ELSE 0 END), 0) as quiz_total_new,
    COALESCE(SUM(CASE WHEN learning_mode = 'quiz' THEN reviews_completed ELSE 0 END), 0) as quiz_total_reviews,
    COALESCE(AVG(CASE WHEN learning_mode = 'quiz' THEN accuracy_rate END), 0) as quiz_avg_accuracy,
    COALESCE(SUM(CASE WHEN learning_mode = 'quiz' THEN total_study_time_seconds ELSE 0 END), 0) as quiz_total_time,
    
    -- Flashcard模式统计
    COALESCE(SUM(CASE WHEN learning_mode = 'flashcard' THEN new_items_completed ELSE 0 END), 0) as flashcard_total_new,
    COALESCE(SUM(CASE WHEN learning_mode = 'flashcard' THEN reviews_completed ELSE 0 END), 0) as flashcard_total_reviews,
    COALESCE(AVG(CASE WHEN learning_mode = 'flashcard' THEN accuracy_rate END), 0) as flashcard_avg_accuracy,
    COALESCE(SUM(CASE WHEN learning_mode = 'flashcard' THEN total_study_time_seconds ELSE 0 END), 0) as flashcard_total_time,
    
    -- 总体统计
    COALESCE(SUM(new_items_completed), 0) as total_new_items,
    COALESCE(SUM(reviews_completed), 0) as total_reviews,
    COALESCE(AVG(accuracy_rate), 0) as overall_accuracy,
    COALESCE(SUM(total_study_time_seconds), 0) as total_study_time,
    COUNT(DISTINCT stat_date) as active_days
FROM daily_learning_stats
GROUP BY user_id;

-- 插入示例用户（仅用于开发测试）
INSERT INTO users (id, email, password_hash, email_verified) VALUES 
('00000000-0000-0000-0000-000000000000', 'demo@example.com', '$2b$10$demo.hash.for.testing.only', true)
ON CONFLICT (email) DO NOTHING;

-- 为示例用户创建默认学习偏好
INSERT INTO user_learning_preferences (user_id) VALUES 
('00000000-0000-0000-0000-000000000000')
ON CONFLICT (user_id) DO NOTHING;

-- 验证码相关函数

-- 清理过期验证码的函数
CREATE OR REPLACE FUNCTION cleanup_expired_verification_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM verification_codes 
    WHERE expires_at < NOW() OR used_at IS NOT NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 生成验证码的函数
CREATE OR REPLACE FUNCTION generate_verification_code(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_code_type VARCHAR(20),
    p_expires_minutes INTEGER DEFAULT 10
)
RETURNS CHAR(4) AS $$
DECLARE
    v_code CHAR(4);
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 清理该用户该类型的旧验证码
    DELETE FROM verification_codes 
    WHERE user_id = p_user_id AND code_type = p_code_type;
    
    -- 生成4位随机数字
    v_code := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    v_expires_at := NOW() + (p_expires_minutes || ' minutes')::INTERVAL;
    
    -- 插入新验证码
    INSERT INTO verification_codes (user_id, email, code, code_type, expires_at)
    VALUES (p_user_id, p_email, v_code, p_code_type, v_expires_at);
    
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- 验证验证码的函数
CREATE OR REPLACE FUNCTION verify_code(
    p_email VARCHAR(255),
    p_code CHAR(4),
    p_code_type VARCHAR(20)
)
RETURNS TABLE(
    success BOOLEAN,
    user_id UUID,
    message TEXT,
    attempts_left INTEGER
) AS $$
DECLARE
    v_record RECORD;
    v_attempts_left INTEGER;
BEGIN
    -- 查找验证码记录
    SELECT * INTO v_record
    FROM verification_codes vc
    WHERE vc.email = p_email 
      AND vc.code_type = p_code_type
      AND vc.expires_at > NOW()
      AND vc.used_at IS NULL
    ORDER BY vc.created_at DESC
    LIMIT 1;
    
    -- 如果没找到有效验证码
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '验证码不存在或已过期'::TEXT, 0;
        RETURN;
    END IF;
    
    -- 检查尝试次数
    IF v_record.attempts >= v_record.max_attempts THEN
        RETURN QUERY SELECT FALSE, v_record.user_id, '验证码尝试次数已达上限'::TEXT, 0;
        RETURN;
    END IF;
    
    -- 增加尝试次数
    UPDATE verification_codes 
    SET attempts = attempts + 1
    WHERE id = v_record.id;
    
    v_attempts_left := v_record.max_attempts - v_record.attempts - 1;
    
    -- 验证码错误
    IF v_record.code != p_code THEN
        RETURN QUERY SELECT FALSE, v_record.user_id, 
            CASE 
                WHEN v_attempts_left > 0 THEN '验证码错误，还有 ' || v_attempts_left || ' 次尝试机会'
                ELSE '验证码错误，尝试次数已达上限'
            END::TEXT, 
            v_attempts_left;
        RETURN;
    END IF;
    
    -- 验证码正确，标记为已使用
    UPDATE verification_codes 
    SET used_at = NOW()
    WHERE id = v_record.id;
    
    RETURN QUERY SELECT TRUE, v_record.user_id, '验证成功'::TEXT, v_attempts_left;
END;
$$ LANGUAGE plpgsql;