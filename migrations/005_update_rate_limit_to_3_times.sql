-- 更新频率限制函数：1分钟内允许3次请求
CREATE OR REPLACE FUNCTION generate_verification_code_with_rate_limit(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_code_type VARCHAR(20),
    p_expires_minutes INTEGER DEFAULT 10,
    p_client_ip INET DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    code CHAR(4)
) AS $$
DECLARE
    v_code CHAR(4);
    v_expires_at TIMESTAMPTZ;
    v_request_count INTEGER;
    v_rate_limit_minutes INTEGER := 1; -- 1分钟时间窗口
    v_max_requests INTEGER := 3; -- 1分钟内最多3次请求
BEGIN
    -- 检查频率限制：统计最近1分钟内的请求次数
    SELECT COUNT(*) INTO v_request_count
    FROM verification_codes 
    WHERE user_id = p_user_id 
      AND code_type = p_code_type
      AND created_at > NOW() - (v_rate_limit_minutes || ' minutes')::INTERVAL;
    
    -- 如果请求次数已达上限，返回错误
    IF v_request_count >= v_max_requests THEN
        RETURN QUERY SELECT FALSE, 
            '请求过于频繁，1分钟内最多只能请求 ' || v_max_requests || ' 次验证码'::TEXT, 
            NULL::CHAR(4);
        RETURN;
    END IF;
    
    -- 清理该用户该类型的旧验证码（保留最近1分钟内的）
    DELETE FROM verification_codes 
    WHERE user_id = p_user_id 
      AND code_type = p_code_type
      AND created_at <= NOW() - (v_rate_limit_minutes || ' minutes')::INTERVAL;
    
    -- 生成4位随机数字
    v_code := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    v_expires_at := NOW() + (p_expires_minutes || ' minutes')::INTERVAL;
    
    -- 插入新验证码
    INSERT INTO verification_codes (user_id, email, code, code_type, expires_at)
    VALUES (p_user_id, p_email, v_code, p_code_type, v_expires_at);
    
    RETURN QUERY SELECT TRUE, '验证码生成成功'::TEXT, v_code;
END;
$$ LANGUAGE plpgsql;