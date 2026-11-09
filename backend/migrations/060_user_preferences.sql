-- Per-user UI preferences (display, accessibility, notifications, workspace).
-- NULL means the user has not saved preferences yet; clients use defaults.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT NULL;
