export function deriveStockStatus(availableStock, reorderLevel) {
  const available = Number(availableStock) || 0;
  const reorder = Number(reorderLevel) || 0;
  if (available <= 0) return 'Out of Stock';
  if (reorder > 0 && available <= reorder * 0.3) return 'Critical Stock';
  if (reorder > 0 && available <= reorder) return 'Low Stock';
  return 'Sufficient';
}

export async function getBranchInventoryRow(client, branchId, productId) {
  const result = await client.query(
    `SELECT inventory_id, branch_id, product_id, available_stock, reorder_level, stock_status
     FROM branch_inventory
     WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId]
  );
  return result.rows[0] || null;
}

export async function upsertBranchInventoryStock(client, {
  branchId,
  productId,
  delta,
  reorderLevel,
}) {
  const existing = await getBranchInventoryRow(client, branchId, productId);
  const reorder = reorderLevel != null
    ? Number(reorderLevel)
    : Number(existing?.reorder_level) || 5;

  if (!existing) {
    if (delta < 0) {
      throw new Error('INSUFFICIENT_STOCK');
    }
    const available = delta;
    const status = deriveStockStatus(available, reorder);
    await client.query(
      `INSERT INTO branch_inventory (branch_id, product_id, available_stock, quantity, reorder_level, status, stock_status, last_updated)
       VALUES ($1, $2, $3, $3, $4, $5, $5, CURRENT_TIMESTAMP)`,
      [branchId, productId, available, reorder, status]
    );
    return available;
  }

  const nextStock = Number(existing.available_stock) + Number(delta);
  if (nextStock < 0) {
    throw new Error('INSUFFICIENT_STOCK');
  }
  const status = deriveStockStatus(nextStock, reorder);
  const updated = await client.query(
    `UPDATE branch_inventory
     SET available_stock = $1,
         quantity = $1,
         reorder_level = COALESCE($2, reorder_level),
         status = $3,
         stock_status = $3,
         last_updated = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE branch_id = $4 AND product_id = $5
     RETURNING available_stock`,
    [nextStock, reorderLevel != null ? reorder : null, status, branchId, productId]
  );
  return updated.rows[0]?.available_stock ?? nextStock;
}

export async function insertStockMovement(client, {
  performedBy,
  productId,
  branchId,
  quantity,
  type,
  movementRef,
  movementDate,
}) {
  await client.query(
    `INSERT INTO stock_movements (performed_by, product_id, branch_id, quantity, type, movement_ref, movement_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [performedBy, productId, branchId, quantity, type, movementRef, movementDate]
  );
}

export async function logWarehouseAudit(pool, userId, action, detail, ipAddress = '127.0.0.1') {
  const userRow = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email, 'User') AS name FROM users WHERE id = $1`,
    [userId]
  );
  const userName = userRow.rows[0]?.name || 'User';
  await pool.query(
    `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, userName, action, ipAddress, detail.slice(0, 150)]
  );
}
