-- 更新数据库schema，添加learning_mode列

-- 添加learning_mode列到reviews表
ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS learning_mode VARCHAR(20) DEFAULT 'quiz' 
CHECK (learning_mode IN ('quiz', 'flashcard'));

-- 更新现有数据的learning_mode为默认值
UPDATE reviews 
SET learning_mode = 'quiz' 
WHERE learning_mode IS NULL;

-- 修改UNIQUE约束，包含learning_mode
ALTER TABLE reviews 
DROP CONSTRAINT IF EXISTS reviews_anon_id_item_type_item_id_form_key;

ALTER TABLE reviews 
ADD CONSTRAINT reviews_anon_id_item_type_item_id_form_learning_mode_key 
UNIQUE(anon_id, item_type, item_id, form, learning_mode);

-- 创建learning_mode索引
CREATE INDEX IF NOT EXISTS idx_reviews_learning_mode ON reviews(learning_mode);

-- 创建复合索引
CREATE INDEX IF NOT EXISTS idx_reviews_anon_item_mode ON reviews(anon_id, item_type, learning_mode);

COMMIT;