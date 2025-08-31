-- 日语形态练习应用数据库架构
-- 创建数据库表

-- 匿名用户表
CREATE TABLE IF NOT EXISTS users_anon (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_code VARCHAR(8) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 动词表
CREATE TABLE IF NOT EXISTS verbs (
    id SERIAL PRIMARY KEY,
    kana TEXT NOT NULL,
    kanji TEXT,
    group_type CHAR(3) NOT NULL CHECK (group_type IN ('I', 'II', 'IRR')),
    meaning TEXT NOT NULL
);

-- 形容词表
CREATE TABLE IF NOT EXISTS adjectives (
    id SERIAL PRIMARY KEY,
    kana TEXT NOT NULL,
    kanji TEXT,
    type CHAR(2) NOT NULL CHECK (type IN ('i', 'na')),
    meaning TEXT NOT NULL
);

-- 用户设置表
CREATE TABLE IF NOT EXISTS settings (
    anon_id UUID PRIMARY KEY REFERENCES users_anon(id) ON DELETE CASCADE,
    due_only BOOLEAN DEFAULT true,
    show_explain BOOLEAN DEFAULT true,
    enabled_forms TEXT[] DEFAULT ARRAY['masu', 'te', 'nai', 'ta', 'potential', 'volitional']
);

-- 复习记录表
CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY,
    anon_id UUID NOT NULL REFERENCES users_anon(id) ON DELETE CASCADE,
    item_type CHAR(3) NOT NULL CHECK (item_type IN ('vrb', 'adj', 'pln')),
    item_id INTEGER NOT NULL,
    form TEXT NOT NULL,
    learning_mode VARCHAR(10) DEFAULT 'quiz' CHECK (learning_mode IN ('quiz', 'flashcard')),
    attempts INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    due_at TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(anon_id, item_type, item_id, form, learning_mode)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_anon_access_code ON users_anon(access_code);
CREATE INDEX IF NOT EXISTS idx_reviews_anon_id ON reviews(anon_id);
CREATE INDEX IF NOT EXISTS idx_reviews_due_at ON reviews(due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_learning_mode ON reviews(learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_anon_id_learning_mode ON reviews(anon_id, learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_item_type_learning_mode ON reviews(item_type, learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_item_type ON reviews(item_type);
CREATE INDEX IF NOT EXISTS idx_verbs_group ON verbs(group_type);
CREATE INDEX IF NOT EXISTS idx_adjectives_type ON adjectives(type);

-- 插入一些基础设置数据
INSERT INTO users_anon (id, access_code) VALUES 
('00000000-0000-0000-0000-000000000000', 'DEMO0000')
ON CONFLICT (access_code) DO NOTHING;

INSERT INTO settings (anon_id) VALUES 
('00000000-0000-0000-0000-000000000000')
ON CONFLICT (anon_id) DO NOTHING;