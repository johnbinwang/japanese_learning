BEGIN;

CREATE TABLE IF NOT EXISTS reviews_v2 (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type CHAR(3) NOT NULL CHECK (item_type IN ('vrb', 'adj', 'pln', 'pol')),
  item_id INTEGER NOT NULL,
  form TEXT NOT NULL,
  learning_mode VARCHAR(10) DEFAULT 'quiz' CHECK (learning_mode IN ('quiz', 'flashcard')),
  attempts INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  due_at TIMESTAMPTZ DEFAULT NOW(),
  last_reviewed TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id, form, learning_mode)
);

CREATE INDEX IF NOT EXISTS idx_reviews_v2_user_id ON reviews_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_v2_due_at ON reviews_v2(due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_v2_learning_mode ON reviews_v2(learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_v2_user_mode ON reviews_v2(user_id, learning_mode);
CREATE INDEX IF NOT EXISTS idx_reviews_v2_item_type ON reviews_v2(item_type);
CREATE INDEX IF NOT EXISTS idx_reviews_v2_item_type_mode ON reviews_v2(item_type, learning_mode);

COMMIT;
