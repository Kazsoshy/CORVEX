-- Multi-product transfer + restock documents (header + lines).
-- Legacy single-SKU columns on inventory_transfers become nullable after backfill.
-- New restock_headers / restock_lines replace per-SKU restocks rows for writes.

CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
  line_id     SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES inventory_transfers(transfer_id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (transfer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines_transfer_id
  ON inventory_transfer_lines (transfer_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines_product_id
  ON inventory_transfer_lines (product_id);

INSERT INTO inventory_transfer_lines (transfer_id, product_id, quantity)
SELECT it.transfer_id, it.product_id, it.quantity
FROM inventory_transfers it
WHERE it.product_id IS NOT NULL
  AND it.quantity IS NOT NULL
  AND it.quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory_transfer_lines l WHERE l.transfer_id = it.transfer_id
  );

ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  ALTER TABLE inventory_transfers ALTER COLUMN product_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE inventory_transfers ALTER COLUMN quantity DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS restock_headers (
  restock_id    SERIAL PRIMARY KEY,
  restock_ref   VARCHAR(100) NOT NULL UNIQUE,
  branch_id     INTEGER NOT NULL REFERENCES branches(id),
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(suppliers_id),
  delivery_ref  VARCHAR(100) NOT NULL,
  received_date DATE NOT NULL,
  recorded_by   INTEGER REFERENCES users(id),
  notes         TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restock_lines (
  line_id    SERIAL PRIMARY KEY,
  restock_id INTEGER NOT NULL REFERENCES restock_headers(restock_id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (restock_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_restock_headers_branch_id ON restock_headers (branch_id);
CREATE INDEX IF NOT EXISTS idx_restock_headers_supplier_id ON restock_headers (supplier_id);
CREATE INDEX IF NOT EXISTS idx_restock_lines_restock_id ON restock_lines (restock_id);

-- Backfill: group legacy restock rows that share the same delivery document keys.
INSERT INTO restock_headers (restock_ref, branch_id, supplier_id, delivery_ref, received_date, recorded_by, notes, created_at)
SELECT
  'RST-LEGACY-' || MIN(r.restock_id)::text,
  r.branch_id,
  r.supplier_id,
  r.delivery_ref,
  r.received_date,
  NULL,
  'Migrated from single-SKU restocks',
  CURRENT_TIMESTAMP
FROM restocks r
WHERE NOT EXISTS (
  SELECT 1
  FROM restock_headers h
  WHERE h.branch_id = r.branch_id
    AND h.supplier_id = r.supplier_id
    AND h.delivery_ref = r.delivery_ref
    AND h.received_date = r.received_date
)
GROUP BY r.branch_id, r.supplier_id, r.delivery_ref, r.received_date;

INSERT INTO restock_lines (restock_id, product_id, quantity)
SELECT h.restock_id, r.product_id, SUM(r.quantity)::int
FROM restocks r
JOIN restock_headers h
  ON h.branch_id = r.branch_id
 AND h.supplier_id = r.supplier_id
 AND h.delivery_ref = r.delivery_ref
 AND h.received_date = r.received_date
WHERE NOT EXISTS (
  SELECT 1
  FROM restock_lines l
  WHERE l.restock_id = h.restock_id
    AND l.product_id = r.product_id
)
GROUP BY h.restock_id, r.product_id
HAVING SUM(r.quantity) > 0;
