-- A manager records who confirmed, rejected, or reversed a collection.
ALTER TABLE collection_payment ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
ALTER TABLE collection_payment ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE collection_payment ADD COLUMN IF NOT EXISTS review_note TEXT;
