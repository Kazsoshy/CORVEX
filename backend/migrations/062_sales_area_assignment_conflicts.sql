-- Prevent duplicate area/day coverage conflicts for sales canvassing.

-- Same territory cannot be assigned to multiple agents on the same work date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_area_territory_day
ON sales_area_assignments (territory_id, work_date)
WHERE territory_id IS NOT NULL
  AND status IN ('Assigned', 'In Progress', 'Done');

-- Same agent cannot receive the same area name twice on one work date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_area_agent_name_day
ON sales_area_assignments (sales_agent_id, work_date, lower(btrim(area_name)))
WHERE status IN ('Assigned', 'In Progress', 'Done');
