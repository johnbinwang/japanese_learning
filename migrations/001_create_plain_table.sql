-- Migration: 001_create_plain_table.sql
-- Description: 创建简体形专用表并导入数据
-- Date: 2024-01-XX

-- 创建简体形专用表
CREATE TABLE IF NOT EXISTS plain (
    id SERIAL PRIMARY KEY,
    kana TEXT NOT NULL,
    kanji TEXT,
    item_type CHAR(3) NOT NULL CHECK (item_type IN ('vrb', 'adj')),
    group_type CHAR(3) CHECK (group_type IN ('I', 'II', 'IRR')), -- 仅动词使用
    adj_type CHAR(2) CHECK (adj_type IN ('i', 'na')), -- 仅形容词使用
    meaning TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_plain_item_type ON plain(item_type);
CREATE INDEX IF NOT EXISTS idx_plain_group_type ON plain(group_type);
CREATE INDEX IF NOT EXISTS idx_plain_adj_type ON plain(adj_type);

-- 从现有的动词表和形容词表导入数据到 plain 表
INSERT INTO plain (kana, kanji, item_type, group_type, meaning)
SELECT kana, kanji, 'vrb', group_type, meaning
FROM verbs
ON CONFLICT DO NOTHING;

INSERT INTO plain (kana, kanji, item_type, adj_type, meaning)
SELECT kana, kanji, 'adj', type, meaning
FROM adjectives
ON CONFLICT DO NOTHING;