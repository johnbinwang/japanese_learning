-- 验证码发送频率限制迁移
-- 创建时间: 2025-01-07
-- 描述: 添加验证码发送频率限制机制

BEGIN;

-- 1. 创建验证码发送记录表
CREATE TABLE IF NOT EXISTS verification_send_logs (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code_type VARCHAR(20) NOT NULL, -- 'email_verification', 'password_reset'
    ip_address INET,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_send_logs_email ON verification_send_logs(email);
CREATE INDEX IF NOT EXISTS idx_send_logs_type ON verification_send_logs(code_type);
CREATE INDEX IF NOT EXISTS idx_send_logs_sent_at ON verification_send_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_send_logs_ip ON verification_send_logs(ip_address);

-- 2. 创建检查发送频率的函数
CREATE OR REPLACE FUNCTION check_send_rate_limit(
    p_email VARCHAR(255),
    p_code_type VARCHAR(20),
    p_ip_address INET DEFAULT NULL
)
RETURNS TABLE(
    allowed BOOLEAN,
    message TEXT,
    wait_seconds INTEGER
) AS $$
DECLARE
    v_email_count INTEGER;
    v_ip_count INTEGER;
    v_last_send TIMESTAMPTZ;
    v_wait_seconds INTEGER;
BEGIN
    -- 检查邮箱发送频率（30秒内最多1次）
    SELECT COUNT(*), MAX(sent_at) INTO v_email_count, v_last_send
    FROM verification_send_logs
    WHERE email = p_email 
      AND code_type = p_code_type
      AND sent_at > NOW() - INTERVAL '30 seconds';
    
    IF v_email_count > 0 THEN
        v_wait_seconds := EXTRACT(EPOCH FROM (v_last_send + INTERVAL '30 seconds' - NOW()))::INTEGER;
        IF v_wait_seconds > 0 THEN
            RETURN QUERY SELECT FALSE, '发送过于频繁，请等待 ' || v_wait_seconds || ' 秒后重试'::TEXT, v_wait_seconds;
            RETURN;
        END IF;
    END IF;
    
    -- 检查IP发送频率（5分钟内最多3次）
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(*) INTO v_ip_count
        FROM verification_send_logs
        WHERE ip_address = p_ip_address
          AND sent_at > NOW() - INTERVAL '5 minutes';
        
        IF v_ip_count >= 3 THEN
            RETURN QUERY SELECT FALSE, '该IP发送过于频繁，请稍后重试'::TEXT, 300;
            RETURN;
        END IF;
    END IF;
    
    -- 检查邮箱每小时发送次数（1小时内最多20次）
    SELECT COUNT(*) INTO v_email_count
    FROM verification_send_logs
    WHERE email = p_email 
      AND code_type = p_code_type
      AND sent_at > NOW() - INTERVAL '1 hour';
    
    IF v_email_count >= 20 THEN
        RETURN QUERY SELECT FALSE, '该邮箱发送次数过多，请1小时后重试'::TEXT, 3600;
        RETURN;
    END IF;
    
    -- 通过所有检查
    RETURN QUERY SELECT TRUE, '允许发送'::TEXT, 0;
END;
$$ LANGUAGE plpgsql;

-- 3. 创建记录发送日志的函数
CREATE OR REPLACE FUNCTION log_verification_send(
    p_email VARCHAR(255),
    p_code_type VARCHAR(20),
    p_ip_address INET DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO verification_send_logs (email, code_type, ip_address)
    VALUES (p_email, p_code_type, p_ip_address);
END;
$$ LANGUAGE plpgsql;

-- 4. 创建清理旧发送记录的函数
CREATE OR REPLACE FUNCTION cleanup_old_send_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 删除24小时前的记录
    DELETE FROM verification_send_logs 
    WHERE sent_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 5. 更新生成验证码函数，添加频率检查
CREATE OR REPLACE FUNCTION generate_verification_code_with_rate_limit(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_code_type VARCHAR(20),
    p_expires_minutes INTEGER DEFAULT 10,
    p_ip_address INET DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    code CHAR(4),
    message TEXT
) AS $$
DECLARE
    v_rate_check RECORD;
    v_code CHAR(4);
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 检查发送频率
    SELECT * INTO v_rate_check
    FROM check_send_rate_limit(p_email, p_code_type, p_ip_address);
    
    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT FALSE, NULL::CHAR(4), v_rate_check.message;
        RETURN;
    END IF;
    
    -- 清理该用户该类型的旧验证码
    DELETE FROM verification_codes 
    WHERE user_id = p_user_id AND code_type = p_code_type;
    
    -- 生成4位随机数字
    v_code := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    v_expires_at := NOW() + (p_expires_minutes || ' minutes')::INTERVAL;
    
    -- 插入新验证码
    INSERT INTO verification_codes (user_id, email, code, code_type, expires_at)
    VALUES (p_user_id, p_email, v_code, p_code_type, v_expires_at);
    
    -- 记录发送日志
    PERFORM log_verification_send(p_email, p_code_type, p_ip_address);
    
    RETURN QUERY SELECT TRUE, v_code, '验证码生成成功'::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMIT;