-- Sales Agent: one active Field Activity Report per assignment + review/edit metadata.
-- Historical duplicates are superseded (not deleted) before the unique index is created.

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) NOT NULL DEFAULT 'Submitted';

ALTER TABLE field_activity_reports
  DROP CONSTRAINT IF EXISTS field_activity_reports_review_status_check;

ALTER TABLE field_activity_reports
  ADD CONSTRAINT field_activity_reports_review_status_check
  CHECK (review_status IN ('Submitted', 'Reviewed', 'Needs Follow-up'));

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS revision_history_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS photo_exception_reason TEXT;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS superseded_by INTEGER REFERENCES field_activity_reports(report_id) ON DELETE SET NULL;

ALTER TABLE field_activity_reports
  ADD COLUMN IF NOT EXISTS edit_reopened_until TIMESTAMPTZ;

UPDATE field_activity_reports
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

-- Reconcile: pick one canonical FAR per assignment_id (prefer closeout_report_id, else photo, else latest).
WITH ranked AS (
  SELECT
    far.report_id,
    far.assignment_id,
    ROW_NUMBER() OVER (
      PARTITION BY far.assignment_id
      ORDER BY
        CASE
          WHEN saa.closeout_report_id IS NOT NULL AND saa.closeout_report_id = far.report_id THEN 0
          ELSE 1
        END,
        CASE
          WHEN far.photo IS NOT NULL AND BTRIM(far.photo) <> '' THEN 0
          ELSE 1
        END,
        far.created_at DESC NULLS LAST,
        far.report_id DESC
    ) AS rn
  FROM field_activity_reports far
  LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
  WHERE far.assignment_id IS NOT NULL
),
canonical AS (
  SELECT report_id, assignment_id FROM ranked WHERE rn = 1
)
UPDATE field_activity_reports far
SET
  is_superseded = TRUE,
  superseded_by = c.report_id
FROM canonical c
WHERE far.assignment_id = c.assignment_id
  AND far.report_id <> c.report_id
  AND far.assignment_id IS NOT NULL
  AND far.is_superseded = FALSE;

UPDATE field_activity_reports far
SET
  is_superseded = FALSE,
  superseded_by = NULL
FROM (
  SELECT report_id FROM (
    SELECT
      far2.report_id,
      ROW_NUMBER() OVER (
        PARTITION BY far2.assignment_id
        ORDER BY
          CASE
            WHEN saa.closeout_report_id IS NOT NULL AND saa.closeout_report_id = far2.report_id THEN 0
            ELSE 1
          END,
          CASE
            WHEN far2.photo IS NOT NULL AND BTRIM(far2.photo) <> '' THEN 0
            ELSE 1
          END,
          far2.created_at DESC NULLS LAST,
          far2.report_id DESC
      ) AS rn
    FROM field_activity_reports far2
    LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far2.assignment_id
    WHERE far2.assignment_id IS NOT NULL
  ) x
  WHERE rn = 1
) keep_rows
WHERE far.report_id = keep_rows.report_id;

-- Point closeout_report_id at the canonical active FAR when missing/stale.
UPDATE sales_area_assignments saa
SET closeout_report_id = far.report_id,
    updated_at = CURRENT_TIMESTAMP
FROM field_activity_reports far
WHERE far.assignment_id = saa.assignment_id
  AND far.is_superseded = FALSE
  AND (
    saa.closeout_report_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM field_activity_reports c
      WHERE c.report_id = saa.closeout_report_id
        AND c.assignment_id = saa.assignment_id
        AND c.is_superseded = FALSE
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_far_one_active_per_assignment
  ON field_activity_reports (assignment_id)
  WHERE assignment_id IS NOT NULL AND is_superseded = FALSE;

CREATE INDEX IF NOT EXISTS idx_far_review_status
  ON field_activity_reports (review_status)
  WHERE assignment_id IS NOT NULL;
