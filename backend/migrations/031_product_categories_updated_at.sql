-- Product categories: track last update time
BEGIN;

ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE product_categories
SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_product_categories_updated_at ON product_categories;
CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
