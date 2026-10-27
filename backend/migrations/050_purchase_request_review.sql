ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS agent_reply TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
