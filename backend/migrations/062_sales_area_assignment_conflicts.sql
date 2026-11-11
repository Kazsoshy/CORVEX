-- Prevent duplicate area/day coverage conflicts for sales canvassing.
-- Seed data (053) may assign the same territory to multiple agents on one day;
-- remove those conflicts before creating unique indexes.

-- Keep one row per territory/day among active statuses
DELETE FROM sales_area_assignments a
USING sales_area_assignments b
WHERE a.territory_id IS NOT NULL
  AND a.status IN ('Assigned', 'In Progress', 'Done')
  AND b.status IN ('Assigned', 'In Progress', 'Done')
  AND a.territory_id = b.territory_id
  AND a.work_date = b.work_date
  AND a.assignment_id > b.assignment_id;

-- Keep one row per agent/day/area name among active statuses
DELETE FROM sales_area_assignments a
USING sales_area_assignments b
WHERE a.status IN ('Assigned', 'In Progress', 'Done')
  AND b.status IN ('Assigned', 'In Progress', 'Done')
  AND a.sales_agent_id = b.sales_agent_id
  AND a.work_date = b.work_date
  AND lower(btrim(a.area_name)) = lower(btrim(b.area_name))
  AND a.assignment_id > b.assignment_id;

-- Same territory cannot be assigned to multiple agents on the same work date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_area_territory_day
ON sales_area_assignments (territory_id, work_date)
WHERE territory_id IS NOT NULL
  AND status IN ('Assigned', 'In Progress', 'Done');

-- Same agent cannot receive the same area name twice on one work date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_area_agent_name_day
ON sales_area_assignments (sales_agent_id, work_date, lower(btrim(area_name)))
WHERE status IN ('Assigned', 'In Progress', 'Done');
