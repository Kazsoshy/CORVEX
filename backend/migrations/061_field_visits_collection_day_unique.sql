-- Prevent the same customer from receiving multiple Collection visits on one day
-- (across any collector). Deduplicate existing rows first, keeping the earliest visit.

WITH ranked AS (
  SELECT visit_id,
         customer_id,
         scheduled_date,
         ROW_NUMBER() OVER (
           PARTITION BY customer_id, scheduled_date
           ORDER BY visit_id ASC
         ) AS rn
  FROM field_visits
  WHERE visit_type = 'Collection'
),
keepers AS (
  SELECT customer_id, scheduled_date, visit_id AS keep_visit_id
  FROM ranked
  WHERE rn = 1
),
dupes AS (
  SELECT r.visit_id AS dupe_visit_id, k.keep_visit_id
  FROM ranked r
  JOIN keepers k
    ON k.customer_id = r.customer_id
   AND k.scheduled_date = r.scheduled_date
  WHERE r.rn > 1
)
UPDATE field_activity_reports far
SET visit_id = d.keep_visit_id
FROM dupes d
WHERE far.visit_id = d.dupe_visit_id;

WITH ranked AS (
  SELECT visit_id,
         ROW_NUMBER() OVER (
           PARTITION BY customer_id, scheduled_date
           ORDER BY visit_id ASC
         ) AS rn
  FROM field_visits
  WHERE visit_type = 'Collection'
)
DELETE FROM field_visits fv
USING ranked r
WHERE fv.visit_id = r.visit_id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_field_visits_collection_customer_day
ON field_visits (customer_id, scheduled_date)
WHERE visit_type = 'Collection';
