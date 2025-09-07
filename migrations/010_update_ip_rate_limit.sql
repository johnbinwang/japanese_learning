-- 更新IP频率限制迁移
-- 创建时间: 2025-01-07
-- 描述: 将IP发送频率限制从5分钟3次调整为5分钟20次

BEGIN;

-- 更新检查发送频率的函数，将IP限制从3次改为20次
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
    
    -- 检查IP发送频率（5分钟内最多20次）
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(*) INTO v_ip_count
        FROM verification_send_logs
        WHERE ip_address = p_ip_address
          AND sent_at > NOW() - INTERVAL '5 minutes';
        
        IF v_ip_count >= 20 THEN
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

COMMIT;