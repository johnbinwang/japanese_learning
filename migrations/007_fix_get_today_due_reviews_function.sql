-- 修复 get_today_due_reviews 函数以适配新的用户系统
-- 创建时间: 2025-01-07
-- 描述: 将函数中的 anon_id 更新为 user_id，并修复参数名歧义问题

-- 重新创建 get_today_due_reviews 函数（适配新的用户系统）
CREATE OR REPLACE FUNCTION get_today_due_reviews(target_user_id UUID, mode VARCHAR(10) DEFAULT NULL)
RETURNS TABLE(
    module_type CHAR(3),
    due_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.item_type,
        COUNT(*) as due_count
    FROM reviews r
    WHERE r.user_id = target_user_id
        AND r.due_at <= NOW()
        AND (mode IS NULL OR r.learning_mode = mode)
    GROUP BY r.item_type;
END;
$$ LANGUAGE plpgsql;

COMMIT;