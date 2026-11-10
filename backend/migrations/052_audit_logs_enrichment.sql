-- ============================================================
-- CORVEX Audit Logs enrichment + login lockout fields
-- Migration: 052_audit_logs_enrichment.sql
-- ============================================================

BEGIN;

-- Allow system / unknown-actor rows (e.g. failed login for unknown email)
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS role_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS module VARCHAR(100),
  ADD COLUMN IF NOT EXISTS activity VARCHAR(150),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS affected_record VARCHAR(200);

-- Widen legacy status_details for longer notes while new description exists
ALTER TABLE audit_logs ALTER COLUMN status_details TYPE VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

-- Per-account consecutive failed login tracking / temporary lockout
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMP NULL;

COMMIT;
