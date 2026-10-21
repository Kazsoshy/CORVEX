-- One local record can occupy only one queue row per user.
DELETE FROM offline_sync_queue older
USING offline_sync_queue newer
WHERE older.user_id = newer.user_id
  AND older.table_name = newer.table_name
  AND older.record_reference = newer.record_reference
  AND older.sync_queue_id < newer.sync_queue_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_sync_queue_user_record
  ON offline_sync_queue (user_id, table_name, record_reference);
