-- 修复缺失的数据库表和视图
-- 创建时间: 2025-01-07
-- 描述: 重新创建在邮箱登录系统迁移中缺失的表和视图

-- 1. 创建密码重置令牌表
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- 3. 重新创建今日学习概览视图（适配新的用户系统）
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

-- 4. 重新创建模式对比分析视图（适配新的用户系统）
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

COMMIT;