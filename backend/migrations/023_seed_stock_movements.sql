-- Populate stock_movements from restocks and completed transfers when the table is empty.
DO $$
DECLARE
  v_performer INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM stock_movements) > 0 THEN
    RETURN;
  END IF;

  SELECT u.id INTO v_performer
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE r.slug = 'inventory_staff'
  ORDER BY u.id
  LIMIT 1;

  IF v_performer IS NULL THEN
    SELECT id INTO v_performer FROM users ORDER BY id LIMIT 1;
  END IF;

  INSERT INTO stock_movements (performed_by, product_id, branch_id, quantity, type, movement_ref, movement_date)
  SELECT
    v_performer,
    r.product_id,
    r.branch_id,
    r.quantity,
    'Restock',
    'MOV-' || r.delivery_ref,
    r.received_date
  FROM restocks r;

  INSERT INTO stock_movements (performed_by, product_id, branch_id, quantity, type, movement_ref, movement_date)
  SELECT
    v_performer,
    it.product_id,
    it.source_branch_id,
    -it.quantity,
    'Transfer Out',
    'MOV-' || it.transfer_ref || '-OUT',
    COALESCE(it.completed_date, it.submitted_date)
  FROM inventory_transfers it
  WHERE it.status IN ('Completed', 'Approved');

  INSERT INTO stock_movements (performed_by, product_id, branch_id, quantity, type, movement_ref, movement_date)
  SELECT
    v_performer,
    it.product_id,
    it.destination_branch_id,
    it.quantity,
    'Transfer In',
    'MOV-' || it.transfer_ref || '-IN',
    COALESCE(it.completed_date, it.submitted_date)
  FROM inventory_transfers it
  WHERE it.status = 'Completed';
END $$;
