-- branch_inventory: add created_at; align last_updated with updated_at
ALTER TABLE branch_inventory
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE branch_inventory
SET
  created_at = COALESCE(updated_at, last_updated, created_at),
  updated_at = COALESCE(updated_at, last_updated, created_at),
  last_updated = COALESCE(updated_at, last_updated, created_at);

-- inventory_transfers: ensure audit columns exist and reflect business dates when seeded
ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE inventory_transfers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE inventory_transfers
SET
  created_at = COALESCE(
    created_at,
    (submitted_date::timestamp + TIME '09:00:00'),
    CURRENT_TIMESTAMP
  ),
  updated_at = COALESCE(
    updated_at,
    (completed_date::timestamp + TIME '17:00:00'),
    (submitted_date::timestamp + TIME '12:00:00'),
    created_at
  )
WHERE submitted_date IS NOT NULL;
