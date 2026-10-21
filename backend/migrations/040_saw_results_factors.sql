-- Keep the inputs that produced each SAW score so a saved row can be checked.
-- Score can be 1.000 when every normalized term is 1; DECIMAL(4,4) cannot store that.

ALTER TABLE saw_results
  ALTER COLUMN score TYPE NUMERIC(8, 4);

ALTER TABLE saw_results
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS days_overdue INTEGER,
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS balance_norm NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS days_norm NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS distance_norm NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS cohort_max_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS cohort_max_days INTEGER,
  ADD COLUMN IF NOT EXISTS cohort_min_distance NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS weight_balance NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS weight_days NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS weight_distance NUMERIC(4, 2);
