-- Multi-product stock count sessions (physical inventory verification).

CREATE TABLE IF NOT EXISTS stock_count_headers (
  count_id     SERIAL PRIMARY KEY,
  count_ref    VARCHAR(100) NOT NULL UNIQUE,
  branch_id    INTEGER NOT NULL REFERENCES branches(id),
  counted_by   INTEGER REFERENCES users(id),
  notes        TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'Completed'
               CHECK (status IN ('Completed')),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_count_lines (
  line_id            SERIAL PRIMARY KEY,
  count_id           INTEGER NOT NULL REFERENCES stock_count_headers(count_id) ON DELETE CASCADE,
  product_id         INTEGER NOT NULL REFERENCES products(id),
  system_quantity    INTEGER NOT NULL,
  physical_quantity  INTEGER NOT NULL CHECK (physical_quantity >= 0),
  variance           INTEGER NOT NULL,
  notes              TEXT,
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_count_headers_branch_id ON stock_count_headers (branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count_id ON stock_count_lines (count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_product_id ON stock_count_lines (product_id);
