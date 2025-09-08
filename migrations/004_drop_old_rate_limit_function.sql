-- 删除旧的 generate_verification_code_with_rate_limit 函数
DROP FUNCTION IF EXISTS generate_verification_code_with_rate_limit(
    p_user_id uuid, 
    p_code_type character varying, 
    p_email character varying, 
    p_expiry_minutes integer, 
    p_rate_limit_minutes integer
);