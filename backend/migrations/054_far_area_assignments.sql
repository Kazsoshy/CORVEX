-- ============================================================
-- CORVEX — Migration 054: FAR area-assignment support (Sales)
-- Allows Sales Agent reports against sales_area_assignments
-- without a customer field_visit. Collector visit_id path kept.
-- ============================================================

BEGIN;

ALTER TABLE field_activity_reports
  ALTER COLUMN visit_id DROP NOT NULL;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS assignment_id INTEGER;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS customer_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_far_assignment'
  ) THEN
    ALTER TABLE field_activity_reports
      ADD CONSTRAINT fk_far_assignment
      FOREIGN KEY (assignment_id) REFERENCES sales_area_assignments(assignment_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_far_customer'
  ) THEN
    ALTER TABLE field_activity_reports
      ADD CONSTRAINT fk_far_customer
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'far_visit_or_assignment_chk'
  ) THEN
    ALTER TABLE field_activity_reports
      ADD CONSTRAINT far_visit_or_assignment_chk
      CHECK (visit_id IS NOT NULL OR assignment_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_field_activity_reports_assignment_id
  ON field_activity_reports (assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_activity_reports_customer_id
  ON field_activity_reports (customer_id);

COMMIT;
