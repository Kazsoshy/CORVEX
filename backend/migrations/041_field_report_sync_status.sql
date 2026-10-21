-- A stored field report has already reached the server.
-- Pending is reserved for a report still sitting on the staff device.

UPDATE field_activity_reports
SET sync_status = 'Synced'
WHERE sync_status = 'Pending';

ALTER TABLE field_activity_reports
  ALTER COLUMN sync_status SET DEFAULT 'Synced';
