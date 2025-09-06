-- 重新设计学习进度功能的数据库架构
-- 添加学习会话记录表和优化今日数据统计

-- 学习会话记录表
CREATE TABLE IF NOT EXISTS learning_sessions (
    id BIGSERIAL PRIMARY KEY,
    anon_id UUID NOT NULL REFERENCES users_anon(id) ON DELETE CASCADE,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    learning_mode VARCHAR(10) NOT NULL CHECK (learning_mode IN ('quiz', 'flashcard')),
    module_type CHAR(3) NOT NULL CHECK (module_type IN ('vrb', 'adj', 'pln')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    new_items_learned INTEGER DEFAULT 0,
    reviews_completed INTEGER DEFAULT 0,
    session_duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每日学习统计表
CREATE TABLE IF NOT EXISTS daily_learning_stats (
    id BIGSERIAL PRIMARY KEY,
    anon_id UUID NOT NULL REFERENCES users_anon(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    learning_mode VARCHAR(10) NOT NULL CHECK (learning_mode IN ('quiz', 'flashcard')),
    module_type CHAR(3) NOT NULL CHECK (module_type IN ('vrb', 'adj', 'pln')),
    new_items_target INTEGER DEFAULT 0,
    new_items_completed INTEGER DEFAULT 0,
    reviews_due INTEGER DEFAULT 0,
    reviews_completed INTEGER DEFAULT 0,
    total_study_time_seconds INTEGER DEFAULT 0,
    accuracy_rate DECIMAL(5,2) DEFAULT 0.00,
    streak_improvements INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(anon_id, stat_date, learning_mode, module_type)
);

-- 用户学习偏好表
CREATE TABLE IF NOT EXISTS user_learning_preferences (
    anon_id UUID PRIMARY KEY REFERENCES users_anon(id) ON DELETE CASCADE,
    daily_new_target INTEGER DEFAULT 10,
    daily_review_target INTEGER DEFAULT 50,
    preferred_mode VARCHAR(10) DEFAULT 'quiz' CHECK (preferred_mode IN ('quiz', 'flashcard')),
    study_streak_days INTEGER DEFAULT 0,
    last_study_date DATE,
    total_study_time_seconds BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_learning_sessions_anon_date ON learning_sessions(anon_id, session_date);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_mode_module ON learning_sessions(learning_mode, module_type);
CREATE INDEX IF NOT EXISTS idx_daily_stats_anon_date ON daily_learning_stats(anon_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_mode_module ON daily_learning_stats(learning_mode, module_type);
CREATE INDEX IF NOT EXISTS idx_user_preferences_last_study ON user_learning_preferences(last_study_date);

-- 创建视图：今日学习概览
CREATE OR REPLACE VIEW today_learning_overview AS
SELECT 
    u.anon_id,
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
LEFT JOIN daily_learning_stats ds ON u.anon_id = ds.anon_id AND ds.stat_date = CURRENT_DATE
GROUP BY u.anon_id, u.daily_new_target, u.daily_review_target, u.study_streak_days;

-- 创建视图：模式对比分析
CREATE OR REPLACE VIEW mode_comparison_analysis AS
SELECT 
    r.anon_id,
    r.learning_mode,
    r.item_type as module_type,
    COUNT(*) as total_items,
    SUM(r.attempts) as total_attempts,
    SUM(r.correct) as total_correct,
    CASE WHEN SUM(r.attempts) > 0 THEN 
        ROUND((SUM(r.correct)::DECIMAL / SUM(r.attempts) * 100), 2)
    ELSE 0 END as accuracy_rate,
    ROUND(AVG(r.streak), 2) as avg_streak,
    COUNT(CASE WHEN r.due_at <= NOW() THEN 1 END) as due_count,
    COUNT(CASE WHEN r.streak >= 5 THEN 1 END) as mastered_count
FROM reviews r
GROUP BY r.anon_id, r.learning_mode, r.item_type;

-- 创建函数：获取今日到期复习数量
CREATE OR REPLACE FUNCTION get_today_due_reviews(user_id UUID, mode VARCHAR(10) DEFAULT NULL)
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
    WHERE r.anon_id = user_id
        AND r.due_at <= NOW()
        AND (mode IS NULL OR r.learning_mode = mode)
    GROUP BY r.item_type;
END;
$$ LANGUAGE plpgsql;

-- 创建函数：更新每日学习统计
CREATE OR REPLACE FUNCTION update_daily_stats(
    user_id UUID,
    mode VARCHAR(10),
    module CHAR(3),
    new_learned INTEGER DEFAULT 0,
    reviews_done INTEGER DEFAULT 0,
    study_seconds INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
    INSERT INTO daily_learning_stats (
        anon_id, stat_date, learning_mode, module_type,
        new_items_completed, reviews_completed, total_study_time_seconds,
        accuracy_rate
    ) VALUES (
        user_id, CURRENT_DATE, mode, module,
        new_learned, reviews_done, study_seconds,
        CASE WHEN total_count > 0 THEN (correct_count::DECIMAL / total_count * 100) ELSE 0 END
    )
    ON CONFLICT (anon_id, stat_date, learning_mode, module_type)
    DO UPDATE SET
        new_items_completed = daily_learning_stats.new_items_completed + EXCLUDED.new_items_completed,
        reviews_completed = daily_learning_stats.reviews_completed + EXCLUDED.reviews_completed,
        total_study_time_seconds = daily_learning_stats.total_study_time_seconds + EXCLUDED.total_study_time_seconds,
        accuracy_rate = CASE 
            WHEN (daily_learning_stats.reviews_completed + daily_learning_stats.new_items_completed + EXCLUDED.reviews_completed + EXCLUDED.new_items_completed) > 0 THEN
                ((daily_learning_stats.accuracy_rate * (daily_learning_stats.reviews_completed + daily_learning_stats.new_items_completed) + 
                  EXCLUDED.accuracy_rate * (EXCLUDED.reviews_completed + EXCLUDED.new_items_completed)) / 
                 (daily_learning_stats.reviews_completed + daily_learning_stats.new_items_completed + EXCLUDED.reviews_completed + EXCLUDED.new_items_completed))
            ELSE 0
        END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 插入默认用户偏好设置
INSERT INTO user_learning_preferences (anon_id) 
SELECT id FROM users_anon 
WHERE id NOT IN (SELECT anon_id FROM user_learning_preferences);