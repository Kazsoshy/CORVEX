-- A product master name can be saved only once.
-- Matching ignores capital letters and spaces around the name.
-- Branch inventory stays unique per branch and product.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM products
    GROUP BY lower(btrim(name))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'products already has duplicate names';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_name_lower_unique
  ON products (lower(btrim(name)));
