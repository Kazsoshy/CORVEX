-- Operational Alerts desk: source dedup, entity links, assignment/resolution/escalation metadata.
-- Preserves existing rows. Status remains Open | Resolved; escalation is metadata on Open alerts.

BEGIN;

ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(160),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS entity_id INTEGER,
  ADD COLUMN IF NOT EXISTS link_path VARCHAR(240),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

COMMENT ON COLUMN operational_alerts.source_key IS
  'Idempotency key for the originating event (e.g. far:12, stockout:3:88). Open uniqueness only.';
COMMENT ON COLUMN operational_alerts.entity_type IS
  'field_report | product | stock_count | customer | other';
COMMENT ON COLUMN operational_alerts.link_path IS
  'Path relative to role ops base (e.g. field-activity-reports/12).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_alerts_open_source_key
  ON operational_alerts (source_key)
  WHERE status = 'Open' AND source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operational_alerts_status ON operational_alerts (status);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_severity ON operational_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_branch_status ON operational_alerts (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_assigned ON operational_alerts (assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operational_alerts_created ON operational_alerts (created_at DESC);

COMMIT;
