-- Replace catch-all Expired with Not Started / Incomplete auto-close statuses.

ALTER TABLE sales_area_assignments DROP CONSTRAINT IF EXISTS sales_area_assignments_status_check;

-- Migrate existing Expired rows before tightening CHECK
UPDATE sales_area_assignments
SET status = CASE
  WHEN started_at IS NULL THEN 'Not Started'
  ELSE 'Incomplete'
END,
updated_at = CURRENT_TIMESTAMP
WHERE status = 'Expired';

ALTER TABLE sales_area_assignments
  ADD CONSTRAINT sales_area_assignments_status_check
  CHECK (status IN ('Assigned', 'In Progress', 'Done', 'Not Started', 'Incomplete'));

ALTER TABLE sales_area_assignments
  ADD COLUMN IF NOT EXISTS closure_notes TEXT;

ALTER TABLE sales_area_assignments
  ADD COLUMN IF NOT EXISTS closeout_report_id INTEGER REFERENCES field_activity_reports(report_id) ON DELETE SET NULL;
