-- 修复验证码验证流程
-- 创建时间: 2025-01-07
-- 描述: 分离验证码验证和使用，支持两步验证流程

BEGIN;

-- 1. 创建只验证不标记为已使用的函数
CREATE OR REPLACE FUNCTION check_code(
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
    
    -- 验证码正确，但不标记为已使用
    RETURN QUERY SELECT TRUE, v_record.user_id, '验证成功'::TEXT, v_attempts_left;
END;
$$ LANGUAGE plpgsql;

-- 2. 创建标记验证码为已使用的函数
CREATE OR REPLACE FUNCTION mark_code_used(
    p_email VARCHAR(255),
    p_code CHAR(4),
    p_code_type VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    -- 标记验证码为已使用
    UPDATE verification_codes 
    SET used_at = NOW()
    WHERE email = p_email 
      AND code = p_code
      AND code_type = p_code_type
      AND expires_at > NOW()
      AND used_at IS NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- 3. 更新原有的verify_code函数，保持向后兼容
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
    v_check_result RECORD;
BEGIN
    -- 先检查验证码
    SELECT * INTO v_check_result
    FROM check_code(p_email, p_code, p_code_type);
    
    -- 如果验证成功，标记为已使用
    IF v_check_result.success THEN
        PERFORM mark_code_used(p_email, p_code, p_code_type);
    END IF;
    
    RETURN QUERY SELECT 
        v_check_result.success,
        v_check_result.user_id,
        v_check_result.message,
        v_check_result.attempts_left;
END;
$$ LANGUAGE plpgsql;

COMMIT;