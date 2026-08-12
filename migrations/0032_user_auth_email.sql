ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_email text;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_email_unique
  ON users (auth_email)
  WHERE auth_email IS NOT NULL;
