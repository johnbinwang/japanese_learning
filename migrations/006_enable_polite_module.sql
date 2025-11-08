BEGIN;

-- Extend reviews item_type constraint to allow polite module data
ALTER TABLE reviews
    DROP CONSTRAINT IF EXISTS reviews_item_type_check,
    ADD CONSTRAINT reviews_item_type_check CHECK (item_type IN ('vrb', 'adj', 'pln', 'pol'));

-- Extend learning_sessions module_type constraint
ALTER TABLE learning_sessions
    DROP CONSTRAINT IF EXISTS learning_sessions_module_type_check,
    ADD CONSTRAINT learning_sessions_module_type_check CHECK (module_type IN ('vrb', 'adj', 'pln', 'pol'));

-- Extend daily_learning_stats module_type constraint
ALTER TABLE daily_learning_stats
    DROP CONSTRAINT IF EXISTS daily_learning_stats_module_type_check,
    ADD CONSTRAINT daily_learning_stats_module_type_check CHECK (module_type IN ('vrb', 'adj', 'pln', 'pol'));

COMMIT;
