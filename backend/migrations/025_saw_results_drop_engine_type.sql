-- SAW results are collector/collection priority only; engine_type is redundant.
DELETE FROM saw_results WHERE engine_type = 'Sales';

ALTER TABLE saw_results DROP COLUMN IF EXISTS engine_type;
