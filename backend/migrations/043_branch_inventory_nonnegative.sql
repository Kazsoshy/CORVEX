-- Shelf quantity cannot go below zero.
-- stock_movements.quantity stays signed: a sale is stored as a negative movement.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM branch_inventory
    WHERE available_stock < 0
       OR (quantity IS NOT NULL AND quantity < 0)
  ) THEN
    RAISE EXCEPTION 'branch_inventory already has a negative quantity';
  END IF;
END $$;

ALTER TABLE branch_inventory
  DROP CONSTRAINT IF EXISTS branch_inventory_available_stock_nonnegative;

ALTER TABLE branch_inventory
  ADD CONSTRAINT branch_inventory_available_stock_nonnegative
  CHECK (available_stock >= 0);

ALTER TABLE branch_inventory
  DROP CONSTRAINT IF EXISTS branch_inventory_quantity_nonnegative;

ALTER TABLE branch_inventory
  ADD CONSTRAINT branch_inventory_quantity_nonnegative
  CHECK (quantity IS NULL OR quantity >= 0);
