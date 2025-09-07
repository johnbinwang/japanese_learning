-- 清理生产环境脏数据
-- 执行时间: 2025-09-07
-- 目的: 清理过期验证码、无效用户记录和其他脏数据

BEGIN;

-- 1. 清理过期的验证码（超过7天的）
DELETE FROM verification_codes 
WHERE created_at < NOW() - INTERVAL '7 days';

-- 2. 清理过期的邮件发送日志（超过30天的）
DELETE FROM email_logs 
WHERE sent_at < NOW() - INTERVAL '30 days';

-- 3. 清理没有任何学习记录的匿名用户（超过30天未活动）
DELETE FROM users_anon 
WHERE id NOT IN (
    SELECT DISTINCT anon_id FROM reviews 
    WHERE last_reviewed > NOW() - INTERVAL '30 days'
)
AND created_at < NOW() - INTERVAL '30 days';

-- 4. 清理孤立的学习会话记录（用户已被删除）
DELETE FROM learning_sessions 
WHERE anon_id NOT IN (SELECT id FROM users_anon);

-- 5. 清理孤立的每日学习统计（用户已被删除）
DELETE FROM daily_learning_stats 
WHERE anon_id NOT IN (SELECT id FROM users_anon);

-- 6. 清理孤立的用户学习偏好（用户已被删除）
DELETE FROM user_learning_preferences 
WHERE anon_id NOT IN (SELECT id FROM users_anon);

-- 7. 清理孤立的复习记录（用户已被删除）
DELETE FROM reviews 
WHERE anon_id NOT IN (SELECT id FROM users_anon);

-- 8. 重置序列号（如果需要）
-- SELECT setval('verification_codes_id_seq', COALESCE((SELECT MAX(id) FROM verification_codes), 1));
-- SELECT setval('email_logs_id_seq', COALESCE((SELECT MAX(id) FROM email_logs), 1));

-- 9. 更新统计信息
ANALYZE verification_codes;
ANALYZE email_logs;
ANALYZE users_anon;
ANALYZE reviews;
ANALYZE learning_sessions;
ANALYZE daily_learning_stats;
ANALYZE user_learning_preferences;

COMMIT;

-- 输出清理结果
DO $$
BEGIN
    RAISE NOTICE '数据库清理完成:';
    RAISE NOTICE '- 验证码表: % 条记录', (SELECT COUNT(*) FROM verification_codes);
    RAISE NOTICE '- 邮件日志表: % 条记录', (SELECT COUNT(*) FROM email_logs);
    RAISE NOTICE '- 匿名用户表: % 条记录', (SELECT COUNT(*) FROM users_anon);
    RAISE NOTICE '- 复习记录表: % 条记录', (SELECT COUNT(*) FROM reviews);
    RAISE NOTICE '- 学习会话表: % 条记录', (SELECT COUNT(*) FROM learning_sessions);
    RAISE NOTICE '- 每日统计表: % 条记录', (SELECT COUNT(*) FROM daily_learning_stats);
END $$;