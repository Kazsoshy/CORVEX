-- Persist affected branch on audit_logs so BM Branch Activity can scope by
-- the branch impacted by the action (not only the actor's home branch).

BEGIN;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id);

COMMENT ON COLUMN audit_logs.branch_id IS
  'Branch affected by the audited activity. Prefer this over the actor users.branch_id for BM scoping.';

CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created ON audit_logs (branch_id, created_at DESC);

COMMIT;
