-- 数据库更新脚本
-- 为日语学习应用添加学习模式支持

-- 1. 添加 learning_mode 列到 reviews 表
ALTER TABLE reviews ADD COLUMN learning_mode VARCHAR(10) DEFAULT 'quiz';

-- 2. 更新现有数据的 learning_mode 为 'quiz'
UPDATE reviews SET learning_mode = 'quiz' WHERE learning_mode IS NULL;

-- 3. 设置 learning_mode 列为非空
ALTER TABLE reviews ALTER COLUMN learning_mode SET NOT NULL;

-- 4. 删除旧的唯一约束（如果存在）
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_anon_id_item_type_item_id_form_key;

-- 5. 创建新的唯一约束，包含 learning_mode
ALTER TABLE reviews ADD CONSTRAINT reviews_anon_id_item_type_item_id_form_learning_mode_key 
    UNIQUE (anon_id, item_type, item_id, form, learning_mode);

-- 6. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_reviews_learning_mode ON reviews(learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_anon_id_learning_mode ON reviews(anon_id, learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_item_type_learning_mode ON reviews(item_type, learning_mode);

-- 7. 创建复合索引以优化进度查询
CREATE INDEX IF NOT EXISTS idx_reviews_progress_query 
    ON reviews(anon_id, item_type, learning_mode, form, last_reviewed);

-- 验证更新
-- 检查表结构
\d reviews;

-- 检查数据
SELECT learning_mode, COUNT(*) as count 
FROM reviews 
GROUP BY learning_mode;

-- 检查约束
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'reviews'::regclass;

-- 检查索引
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'reviews';