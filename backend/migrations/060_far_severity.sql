-- Optional severity for collector incident/issue field activity reports.
-- Sales Agent reports leave this NULL.

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20);

COMMENT ON COLUMN field_activity_reports.severity IS
  'Nullable severity for incident/issue activity types (Low|Medium|High|Critical).';
