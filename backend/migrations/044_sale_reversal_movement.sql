-- Cancelling a pending sale records a Sale Reversal movement.
-- The original check allowed the deduction type and not the return type.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'stock_movements'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%Sale Deduction%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%Sale Reversal%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE stock_movements DROP CONSTRAINT %I', cname);
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
      CHECK (type IN (
        'Sale Deduction', 'Restock', 'Transfer In', 'Transfer Out',
        'Stock Count Adjustment', 'Damage Write-Off', 'Sale Reversal'
      ));
  END IF;
END $$;
