import { insertStockMovement, upsertBranchInventoryStock } from './branchInventoryStock.js';

export function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Normalize request body lines: [{ product_id, quantity }, ...] */
export function parseDocumentLines(body) {
  const raw = Array.isArray(body?.lines) ? body.lines : null;
  if (raw?.length) {
    const map = new Map();
    for (const row of raw) {
      const productId = Number(row.product_id ?? row.productId);
      const quantity = Number(row.quantity ?? row.qty);
      if (!Number.isFinite(productId) || productId <= 0) continue;
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      map.set(productId, (map.get(productId) || 0) + quantity);
    }
    return [...map.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
  }

  // Legacy single-SKU body
  const productId = Number(body?.product_id ?? body?.productId);
  const quantity = Number(body?.quantity ?? body?.qty);
  if (Number.isFinite(productId) && productId > 0 && Number.isFinite(quantity) && quantity > 0) {
    return [{ product_id: productId, quantity }];
  }
  return [];
}

/** Manila calendar year for document numbering (PREFIX-YYYY-####). */
export function documentRefYear(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
    }).format(date)
  );
}

/**
 * Next sequential document ref: PREFIX-YYYY-####
 * Uses max existing sequence for the year (not row COUNT) to avoid collisions/reuse.
 * table/column are internal constants only.
 */
export async function nextDocumentRef(client, {
  prefix,
  table,
  column,
}) {
  const safePrefix = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const safeTable = String(table || '').replace(/[^a-z0-9_]/gi, '');
  const safeColumn = String(column || '').replace(/[^a-z0-9_]/gi, '');
  if (!safePrefix || !safeTable || !safeColumn) {
    throw new Error('Invalid document ref generator arguments.');
  }

  const year = documentRefYear();
  const like = `${safePrefix}-${year}-%`;
  const result = await client.query(
    `SELECT ${safeColumn} AS ref FROM ${safeTable} WHERE ${safeColumn} ILIKE $1`,
    [like]
  );

  let maxSeq = 0;
  const re = new RegExp(`^${safePrefix}-${year}-(\\d+)$`, 'i');
  for (const row of result.rows) {
    const match = String(row.ref || '').trim().match(re);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]) || 0);
  }

  return `${safePrefix}-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
}

export async function nextTransferRef(client) {
  return nextDocumentRef(client, {
    prefix: 'TRF',
    table: 'inventory_transfers',
    column: 'transfer_ref',
  });
}

export async function nextRestockRef(client) {
  return nextDocumentRef(client, {
    prefix: 'RST',
    table: 'restock_headers',
    column: 'restock_ref',
  });
}

/** Supplier delivery document id — always system-assigned (never typed by staff). */
export async function nextDeliveryRef(client) {
  return nextDocumentRef(client, {
    prefix: 'DR',
    table: 'restock_headers',
    column: 'delivery_ref',
  });
}

export function movementRefForRestock(restockRef, productId) {
  return `MOV-${restockRef}-${Number(productId)}`;
}

export function movementRefForTransfer(transferRef, direction, productId) {
  const dir = String(direction || '').toUpperCase() === 'IN' ? 'IN' : 'OUT';
  return `MOV-${transferRef}-${dir}-${Number(productId)}`;
}

export function movementRefForStockCount(countRef, productId) {
  return `MOV-${countRef}-${Number(productId)}`;
}

/**
 * Qty reserved on outbound transfers that have not completed/rejected.
 * Counts multi-line transfer lines, plus legacy header-only transfers (no lines yet).
 */
export const PENDING_OUTBOUND_SQL = `
  SELECT COALESCE(SUM(qty), 0)::int AS reserved
  FROM (
    SELECT l.quantity AS qty
    FROM inventory_transfer_lines l
    JOIN inventory_transfers t ON t.transfer_id = l.transfer_id
    WHERE t.source_branch_id = $1
      AND l.product_id = $2
      AND t.status IN ('Pending Approval', 'Submitted', 'Approved')
    UNION ALL
    SELECT t.quantity AS qty
    FROM inventory_transfers t
    WHERE t.source_branch_id = $1
      AND t.product_id = $2
      AND t.status IN ('Pending Approval', 'Submitted', 'Approved')
      AND t.quantity IS NOT NULL
      AND t.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_transfer_lines l2 WHERE l2.transfer_id = t.transfer_id
      )
  ) reserved_rows
`;

/** On hand minus qty already committed on pending/approved outbound transfers. */
export async function getAvailableToTransfer(client, branchId, productId) {
  const stock = await client.query(
    `SELECT COALESCE(available_stock, 0)::int AS available_stock
     FROM branch_inventory
     WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId]
  );
  const onHand = stock.rows[0] ? Number(stock.rows[0].available_stock) : 0;
  const pending = await client.query(PENDING_OUTBOUND_SQL, [branchId, productId]);
  const reserved = Number(pending.rows[0]?.reserved) || 0;
  return Math.max(0, onHand - reserved);
}

export async function nextStockCountRef(client) {
  return nextDocumentRef(client, {
    prefix: 'SC',
    table: 'stock_count_headers',
    column: 'count_ref',
  });
}

export async function loadTransferLines(client, transferId) {
  const result = await client.query(
    `SELECT
       l.line_id,
       l.product_id,
       l.quantity,
       p.name AS product_name,
       p.sku
     FROM inventory_transfer_lines l
     JOIN products p ON p.id = l.product_id
     WHERE l.transfer_id = $1
     ORDER BY p.name`,
    [transferId]
  );
  if (result.rows.length) return result.rows;

  // Legacy single-SKU headers may predate inventory_transfer_lines.
  // Backfill one line so detail/complete stay consistent with header qty.
  const legacy = await client.query(
    `SELECT transfer_id, product_id, quantity
     FROM inventory_transfers
     WHERE transfer_id = $1
       AND product_id IS NOT NULL
       AND quantity IS NOT NULL
       AND quantity > 0`,
    [transferId]
  );
  if (!legacy.rows.length) return [];

  const row = legacy.rows[0];
  await client.query(
    `INSERT INTO inventory_transfer_lines (transfer_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (transfer_id, product_id) DO NOTHING`,
    [transferId, row.product_id, row.quantity]
  );

  const again = await client.query(
    `SELECT
       l.line_id,
       l.product_id,
       l.quantity,
       p.name AS product_name,
       p.sku
     FROM inventory_transfer_lines l
     JOIN products p ON p.id = l.product_id
     WHERE l.transfer_id = $1
     ORDER BY p.name`,
    [transferId]
  );
  return again.rows;
}

export async function loadRestockLines(client, restockId) {
  const result = await client.query(
    `SELECT
       l.line_id,
       l.product_id,
       l.quantity,
       p.name AS product_name,
       p.sku
     FROM restock_lines l
     JOIN products p ON p.id = l.product_id
     WHERE l.restock_id = $1
     ORDER BY p.name`,
    [restockId]
  );
  return result.rows;
}

export function summarizeLines(lines) {
  const lineCount = lines.length;
  const totalUnits = lines.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const first = lines[0];
  return {
    line_count: lineCount,
    total_quantity: totalUnits,
    product_name: lineCount === 1
      ? (first?.product_name || 'Product')
      : `${first?.product_name || 'Product'} +${lineCount - 1} more`,
    sku: lineCount === 1 ? (first?.sku || null) : null,
    quantity: totalUnits,
  };
}

/** Apply restock line quantities to branch stock + movements (after BM approve). */
export async function postRestockStock(client, {
  restockRef,
  deliveryRef,
  branchId,
  supplierId,
  receivedDate,
  postedBy,
  lines,
}) {
  const snapshots = [];
  for (const line of lines) {
    const product = await client.query(
      `SELECT reorder_point FROM products WHERE id = $1`,
      [line.product_id]
    );
    const reorder = product.rows[0]?.reorder_point ?? 5;
    await client.query(
      `INSERT INTO restocks (product_id, branch_id, delivery_ref, supplier_id, quantity, received_date)
       VALUES ($1, $2, $3, $4, $5, $6::date)`,
      [line.product_id, branchId, deliveryRef, supplierId, line.quantity, receivedDate]
    );
    const stockSnapshot = await upsertBranchInventoryStock(client, {
      branchId,
      productId: line.product_id,
      delta: line.quantity,
      reorderLevel: reorder,
    });
    snapshots.push(stockSnapshot);
    await insertStockMovement(client, {
      performedBy: postedBy,
      productId: line.product_id,
      branchId,
      quantity: line.quantity,
      type: 'Restock',
      movementRef: movementRefForRestock(restockRef, line.product_id),
      movementDate: receivedDate,
    });
  }
  return snapshots;
}

/** Apply non-zero stock-count variances to branch stock + movements. */
export async function postStockCountAdjustments(client, {
  countRef,
  branchId,
  postedBy,
  lines,
}) {
  const snapshots = [];
  for (const line of lines) {
    const variance = Number(line.variance);
    if (!variance) continue;
    const snap = await upsertBranchInventoryStock(client, {
      branchId,
      productId: line.product_id,
      delta: variance,
      reorderLevel: line.reorder_level,
    });
    snapshots.push(snap);
    await insertStockMovement(client, {
      performedBy: postedBy,
      productId: line.product_id,
      branchId,
      quantity: variance,
      type: 'Stock Count Adjustment',
      movementRef: movementRefForStockCount(countRef, line.product_id),
      movementDate: manilaToday(),
    });
  }
  return snapshots;
}

/** Source warehouse: Transfer Out only (stock leaves source). */
export async function shipTransferStock(client, transferRow, lines, userId) {
  const sourceId = transferRow.source_branch_id;
  const transferRef = transferRow.transfer_ref;
  const today = manilaToday();
  const snapshots = [];

  for (const line of lines) {
    const productId = Number(line.product_id);
    const quantity = Number(line.quantity);
    const stock = await client.query(
      `SELECT COALESCE(available_stock, 0)::int AS available_stock
       FROM branch_inventory WHERE branch_id = $1 AND product_id = $2`,
      [sourceId, productId]
    );
    const onHand = stock.rows[0] ? Number(stock.rows[0].available_stock) : 0;
    if (quantity > onHand) {
      const name = line.product_name || `product ${productId}`;
      const err = new Error(
        `Insufficient stock to ship ${transferRef}: ${name} needs ${quantity} but source has ${onHand}. No stock was moved.`
      );
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }
  }

  for (const line of lines) {
    const productId = Number(line.product_id);
    const quantity = Number(line.quantity);
    const product = await client.query(`SELECT reorder_point FROM products WHERE id = $1`, [productId]);
    const reorder = product.rows[0]?.reorder_point ?? 5;
    const sourceSnapshot = await upsertBranchInventoryStock(client, {
      branchId: sourceId,
      productId,
      delta: -quantity,
      reorderLevel: reorder,
    });
    await insertStockMovement(client, {
      performedBy: userId,
      productId,
      branchId: sourceId,
      quantity: -quantity,
      type: 'Transfer Out',
      movementRef: movementRefForTransfer(transferRef, 'OUT', productId),
      movementDate: today,
    });
    snapshots.push(sourceSnapshot);
  }

  return snapshots[0] || null;
}

/** Destination warehouse: Transfer In only (stock arrives at destination). */
export async function receiveTransferStock(client, transferRow, lines, userId) {
  const destId = transferRow.destination_branch_id;
  const transferRef = transferRow.transfer_ref;
  const today = manilaToday();
  const snapshots = [];

  for (const line of lines) {
    const productId = Number(line.product_id);
    const quantity = Number(line.quantity);
    const product = await client.query(`SELECT reorder_point FROM products WHERE id = $1`, [productId]);
    const reorder = product.rows[0]?.reorder_point ?? 5;
    const destSnapshot = await upsertBranchInventoryStock(client, {
      branchId: destId,
      productId,
      delta: quantity,
      reorderLevel: reorder,
    });
    await insertStockMovement(client, {
      performedBy: userId,
      productId,
      branchId: destId,
      quantity,
      type: 'Transfer In',
      movementRef: movementRefForTransfer(transferRef, 'IN', productId),
      movementDate: today,
    });
    snapshots.push(destSnapshot);
  }

  return snapshots[0] || null;
}

/** Legacy helper: ship + receive in one step (kept for scripts/tests). Prefer ship/receive. */
export async function completeTransferStockMulti(client, transferRow, lines, userId) {
  await shipTransferStock(client, transferRow, lines, userId);
  return receiveTransferStock(client, transferRow, lines, userId);
}
