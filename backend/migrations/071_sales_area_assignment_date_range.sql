-- Sales area assignments: inclusive end_date + Expired status.
-- Overlap conflicts are enforced in application code (findAreaAssignmentConflicts).

ALTER TABLE sales_area_assignments
  ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE sales_area_assignments
SET end_date = work_date
WHERE end_date IS NULL;

ALTER TABLE sales_area_assignments
  ALTER COLUMN end_date SET DEFAULT CURRENT_DATE;

ALTER TABLE sales_area_assignments
  ALTER COLUMN end_date SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_area_assignments_end_date_check'
  ) THEN
    ALTER TABLE sales_area_assignments
      ADD CONSTRAINT sales_area_assignments_end_date_check
      CHECK (end_date >= work_date);
  END IF;
END $$;

-- Expand status CHECK to include Expired
ALTER TABLE sales_area_assignments DROP CONSTRAINT IF EXISTS sales_area_assignments_status_check;
ALTER TABLE sales_area_assignments
  ADD CONSTRAINT sales_area_assignments_status_check
  CHECK (status IN ('Assigned', 'In Progress', 'Done', 'Expired'));

-- Day-only unique indexes cannot represent multi-day ranges; drop them.
DROP INDEX IF EXISTS uq_sales_area_territory_day;
DROP INDEX IF EXISTS uq_sales_area_agent_name_day;

CREATE INDEX IF NOT EXISTS idx_sales_area_assignments_agent_range
  ON sales_area_assignments (sales_agent_id, work_date, end_date);

CREATE INDEX IF NOT EXISTS idx_sales_area_assignments_territory_range
  ON sales_area_assignments (territory_id, work_date, end_date)
  WHERE territory_id IS NOT NULL;

-- Persist already-stale incomplete rows as Expired
UPDATE sales_area_assignments
SET status = 'Expired',
    updated_at = CURRENT_TIMESTAMP
WHERE status IN ('Assigned', 'In Progress')
  AND end_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
