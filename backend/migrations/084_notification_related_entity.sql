-- Deep-link metadata for notification click navigation.
-- related_id is text so invoice numbers and numeric PKs both work.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_entity VARCHAR(50);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_notifications_related
  ON notifications (related_entity, related_id)
  WHERE related_entity IS NOT NULL AND related_id IS NOT NULL;
