-- =====================================================================
-- CORVEX — Migration 028: Add updated_at to permissions
-- =====================================================================
BEGIN;

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Auto-update trigger
CREATE OR REPLACE TRIGGER trg_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
