-- 添加带频率限制的验证码生成函数
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
    v_last_request TIMESTAMPTZ;
    v_rate_limit_minutes INTEGER := 1; -- 1分钟内只能请求一次
BEGIN
    -- 检查频率限制：查找最近的验证码请求
    SELECT created_at INTO v_last_request
    FROM verification_codes 
    WHERE user_id = p_user_id 
      AND code_type = p_code_type
      AND created_at > NOW() - (v_rate_limit_minutes || ' minutes')::INTERVAL
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- 如果在频率限制时间内已有请求，返回错误
    IF v_last_request IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 
            '请求过于频繁，请等待 ' || v_rate_limit_minutes || ' 分钟后再试'::TEXT, 
            NULL::CHAR(4);
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
    
    RETURN QUERY SELECT TRUE, '验证码生成成功'::TEXT, v_code;
END;
$$ LANGUAGE plpgsql;