-- Migration: Clean up settings table after merging into preferences
-- This migration removes the settings table as it's no longer needed

BEGIN;

-- Drop the settings table since all data has been migrated to user_learning_preferences
DROP TABLE IF EXISTS settings;

-- Remove any references to settings table in schema.sql will be done manually
-- as this migration only handles database structure changes

COMMIT;