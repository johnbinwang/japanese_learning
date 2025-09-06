-- Migration: Merge settings table into user_learning_preferences table
-- This migration adds settings fields to preferences table and migrates data

BEGIN;

-- Add settings fields to user_learning_preferences table
ALTER TABLE user_learning_preferences 
ADD COLUMN IF NOT EXISTS due_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS show_explain BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enabled_forms TEXT[] DEFAULT ARRAY['present', 'past', 'te', 'potential', 'passive', 'causative', 'imperative', 'conditional', 'volitional'];

-- Migrate data from settings table to user_learning_preferences table
-- Update existing preferences with settings data
UPDATE user_learning_preferences 
SET 
    due_only = COALESCE(s.due_only, user_learning_preferences.due_only),
    show_explain = COALESCE(s.show_explain, user_learning_preferences.show_explain),
    enabled_forms = COALESCE(s.enabled_forms, user_learning_preferences.enabled_forms),
    daily_new_target = COALESCE(s.daily_goal, user_learning_preferences.daily_new_target)
FROM settings s 
WHERE user_learning_preferences.anon_id = s.anon_id;

-- Insert settings data for users who don't have preferences yet
INSERT INTO user_learning_preferences (
    anon_id, 
    daily_new_target, 
    daily_review_target, 
    preferred_mode,
    due_only,
    show_explain,
    enabled_forms
)
SELECT 
    s.anon_id,
    COALESCE(s.daily_goal, 10) as daily_new_target,
    15 as daily_review_target,  -- default value
    'quiz' as preferred_mode,  -- default value
    COALESCE(s.due_only, false) as due_only,
    COALESCE(s.show_explain, true) as show_explain,
    COALESCE(s.enabled_forms, ARRAY['present', 'past', 'te', 'potential', 'passive', 'causative', 'imperative', 'conditional', 'volitional']) as enabled_forms
FROM settings s
WHERE s.anon_id NOT IN (SELECT anon_id FROM user_learning_preferences);

-- Create indexes for the new fields if they don't exist
CREATE INDEX IF NOT EXISTS idx_user_learning_preferences_due_only ON user_learning_preferences(due_only);
CREATE INDEX IF NOT EXISTS idx_user_learning_preferences_show_explain ON user_learning_preferences(show_explain);

-- Note: We don't drop the settings table yet - that will be done in cleanup phase
-- This allows for rollback if needed

COMMIT;