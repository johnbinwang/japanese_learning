-- 验证码系统迁移
-- 创建时间: 2025-01-07
-- 描述: 将token链接系统改为4位数字验证码系统

BEGIN;

-- 1. 创建验证码表
CREATE TABLE verification_codes (
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

-- 2. 移除users表中的token相关字段
ALTER TABLE users DROP COLUMN IF EXISTS email_verification_token;
ALTER TABLE users DROP COLUMN IF EXISTS email_verification_expires;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_expires;

-- 3. 创建索引
CREATE INDEX idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX idx_verification_codes_email ON verification_codes(email);
CREATE INDEX idx_verification_codes_code ON verification_codes(code);
CREATE INDEX idx_verification_codes_type ON verification_codes(code_type);
CREATE INDEX idx_verification_codes_expires ON verification_codes(expires_at);

-- 4. 添加约束
ALTER TABLE verification_codes ADD CONSTRAINT chk_code_type 
    CHECK (code_type IN ('email_verification', 'password_reset'));

ALTER TABLE verification_codes ADD CONSTRAINT chk_code_format 
    CHECK (code ~ '^[0-9]{4}$');

ALTER TABLE verification_codes ADD CONSTRAINT chk_max_attempts 
    CHECK (max_attempts > 0 AND max_attempts <= 10);

ALTER TABLE verification_codes ADD CONSTRAINT chk_attempts 
    CHECK (attempts >= 0 AND attempts <= max_attempts);

-- 5. 创建清理过期验证码的函数
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

-- 6. 创建生成验证码的函数
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

-- 7. 创建验证验证码的函数
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

-- 8. 更新email_logs表，添加验证码相关字段
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS verification_code CHAR(4);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS code_type VARCHAR(20);

-- 9. 创建定时清理任务（需要在应用层实现）
-- 建议每小时执行一次: SELECT cleanup_expired_verification_codes();

COMMIT;