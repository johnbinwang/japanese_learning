-- Repair production user records for the email-auth schema.
-- The live database ended up with a legacy wechat-style users table while
-- the email-auth tables (user_sessions / verification_codes / email_logs)
-- already contain UUID user_ids. This migration preserves the legacy table,
-- recreates the expected users table, and rebuilds user rows from the
-- surviving auth/activity tables.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users_wechat_legacy'
    ) THEN
      ALTER TABLE users RENAME TO users_wechat_legacy;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_users_updated_at'
      AND tgrelid = 'users'::regclass
  ) THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

WITH email_candidates AS (
  SELECT
    user_id,
    lower(trim(email)) AS email,
    created_at AS seen_at
  FROM verification_codes
  WHERE user_id IS NOT NULL
    AND email IS NOT NULL
    AND trim(email) <> ''

  UNION ALL

  SELECT
    user_id,
    lower(trim(email)) AS email,
    COALESCE(sent_at, created_at) AS seen_at
  FROM email_logs
  WHERE user_id IS NOT NULL
    AND email IS NOT NULL
    AND trim(email) <> ''
),
ranked_emails AS (
  SELECT
    user_id,
    email,
    seen_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY seen_at DESC NULLS LAST, email DESC
    ) AS rn
  FROM email_candidates
),
activity AS (
  SELECT
    user_id,
    MIN(activity_at) AS first_seen_at,
    MAX(activity_at) AS last_seen_at
  FROM (
    SELECT user_id, created_at AS activity_at
    FROM verification_codes
    WHERE user_id IS NOT NULL

    UNION ALL

    SELECT user_id, COALESCE(sent_at, created_at) AS activity_at
    FROM email_logs
    WHERE user_id IS NOT NULL

    UNION ALL

    SELECT user_id, created_at AS activity_at
    FROM user_sessions
    WHERE user_id IS NOT NULL

    UNION ALL

    SELECT user_id, started_at AS activity_at
    FROM learning_sessions
    WHERE user_id IS NOT NULL

    UNION ALL

    SELECT user_id, created_at AS activity_at
    FROM daily_learning_stats
    WHERE user_id IS NOT NULL

    UNION ALL

    SELECT user_id, created_at AS activity_at
    FROM user_learning_preferences
    WHERE user_id IS NOT NULL
  ) AS combined_activity
  GROUP BY user_id
),
last_session AS (
  SELECT
    user_id,
    MAX(last_used_at) AS last_login_at
  FROM user_sessions
  WHERE user_id IS NOT NULL
  GROUP BY user_id
),
recovered_users AS (
  SELECT
    re.user_id AS id,
    re.email,
    COALESCE(a.first_seen_at, NOW()) AS created_at,
    COALESCE(a.last_seen_at, NOW()) AS updated_at,
    ls.last_login_at
  FROM ranked_emails re
  LEFT JOIN activity a ON a.user_id = re.user_id
  LEFT JOIN last_session ls ON ls.user_id = re.user_id
  WHERE re.rn = 1
)
INSERT INTO users (
  id,
  email,
  password_hash,
  email_verified,
  created_at,
  updated_at,
  last_login_at
)
SELECT
  ru.id,
  ru.email,
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  TRUE,
  ru.created_at,
  ru.updated_at,
  ru.last_login_at
FROM recovered_users ru
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.id = ru.id OR lower(u.email) = ru.email
)
ON CONFLICT (id) DO UPDATE
SET
  email = COALESCE(users.email, EXCLUDED.email),
  password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
  email_verified = COALESCE(users.email_verified, FALSE) OR EXCLUDED.email_verified,
  created_at = LEAST(COALESCE(users.created_at, EXCLUDED.created_at), EXCLUDED.created_at),
  updated_at = GREATEST(COALESCE(users.updated_at, EXCLUDED.updated_at), EXCLUDED.updated_at),
  last_login_at = CASE
    WHEN users.last_login_at IS NULL THEN EXCLUDED.last_login_at
    WHEN EXCLUDED.last_login_at IS NULL THEN users.last_login_at
    ELSE GREATEST(users.last_login_at, EXCLUDED.last_login_at)
  END;

COMMIT;
