import express from 'express';
import { requireAuth, requireRole, requireAssignedBranch, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import {
  alignCentralInventory,
  deriveStockStatus,
  insertStockMovement,
  logWarehouseAudit,
  upsertBranchInventoryStock,
} from '../lib/branchInventoryStock.js';
import {
  notifyTransferCompleted,
  notifyTransferDecision,
  notifyTransferSubmitted,
} from '../lib/inventoryTransferNotifications.js';
import { publishStockAlerts } from '../lib/operationalNotifications.js';
import { normalizeProductName, productNameConflict, productNameTaken } from '../lib/productName.js';

const TRANSFER_APPROVER_ROLES = new Set(['branch_manager', 'operating_manager', 'super_admin']);
/** Stock mutations (restock / count / transfer create / product create) — not branch managers. */
const INVENTORY_WRITER_ROLES = ['inventory_staff', 'operating_manager', 'super_admin'];

const router = express.Router();
router.use(requireRole(ROLE_SETS.inventory), requireAssignedBranch);

router.get('/central', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const scopedBranchId = isUnscoped(req.currentUser) ? null : req.currentUser.branchId;
    const branchParams = scopedBranchId != null ? [scopedBranchId] : [];
    const branchOnlySql = scopedBranchId != null ? 'AND b.id = $1' : '';
    const movementBranchSql = scopedBranchId != null ? 'AND sm.branch_id = $1' : '';
    const alertBranchSql = scopedBranchId != null ? 'AND bi.branch_id = $1' : '';

    const [productsResult, metricsResult, byBranchResult, alertsResult, movementsResult] = await Promise.all([
      pool.query(
        `SELECT p.id AS product_id,
                p.name AS product_name,
                p.sku,
                COALESCE(ci.total_quantity, 0)::int AS central_quantity,
                COALESCE(ci.branch_count, 0)::int AS branch_count,
                ci.updated_at AS centralized_at,
                COALESCE(SUM(bi.available_stock), 0)::int AS branch_total,
                COUNT(bi.inventory_id)::int AS inventory_rows,
                COUNT(*) FILTER (
                  WHERE bi.available_stock <= 0
                     OR bi.stock_status IN ('Out of Stock', 'Critical Stock', 'Low Stock')
                     OR (bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level)
                )::int AS alert_rows,
                (
                  SELECT COALESCE(json_agg(
                    json_build_object(
                      'branch_id', b.id,
                      'branch_name', b.name,
                      'available_stock', stock.available_stock,
                      'reorder_level', stock.reorder_level,
                      'stock_status', stock.stock_status
                    )
                    ORDER BY b.name
                  ), '[]'::json)
                  FROM branches b
                  LEFT JOIN branch_inventory stock
                    ON stock.branch_id = b.id AND stock.product_id = p.id
                  WHERE b.status = 'Active'
                    ${scopedBranchId != null ? 'AND b.id = $1' : ''}
                ) AS branches
         FROM products p
         LEFT JOIN central_inventory ci ON ci.product_id = p.id
         LEFT JOIN branch_inventory bi ON bi.product_id = p.id
           ${scopedBranchId != null ? 'AND bi.branch_id = $1' : ''}
         WHERE COALESCE(p.status, 'Active') = 'Active'
         GROUP BY p.id, p.name, p.sku, ci.total_quantity, ci.branch_count, ci.updated_at
         ORDER BY p.name`,
        branchParams
      ),
      pool.query(
        scopedBranchId != null
          ? `SELECT
               COALESCE((SELECT SUM(available_stock)::int FROM branch_inventory WHERE branch_id = $1), 0) AS total_stock,
               COALESCE((SELECT SUM(available_stock)::int FROM branch_inventory WHERE branch_id = $1), 0) AS central_total,
               (SELECT COUNT(*)::int FROM branch_inventory WHERE branch_id = $1) AS products_tracked,
               (
                 SELECT COUNT(*)::int FROM branch_inventory
                 WHERE branch_id = $1
                   AND available_stock > 0
                   AND (
                     stock_status IN ('Low Stock', 'Critical Stock')
                     OR (reorder_level > 0 AND available_stock <= reorder_level)
                   )
               ) AS low_stock,
               (
                 SELECT COUNT(*)::int FROM branch_inventory
                 WHERE branch_id = $1
                   AND (available_stock <= 0 OR stock_status = 'Out of Stock')
               ) AS out_of_stock,
               1 AS branches_with_stock,
               1 AS active_branches,
               (
                 SELECT COUNT(*)::int FROM branch_inventory WHERE branch_id = $1
               ) AS aligned_products`
          : `SELECT
           COALESCE((SELECT SUM(available_stock)::int FROM branch_inventory), 0) AS total_stock,
           COALESCE((SELECT SUM(total_quantity)::int FROM central_inventory), 0) AS central_total,
           (SELECT COUNT(*)::int FROM products WHERE COALESCE(status, 'Active') = 'Active') AS products_tracked,
           (
             SELECT COUNT(*)::int FROM branch_inventory
             WHERE available_stock > 0
               AND (
                 stock_status IN ('Low Stock', 'Critical Stock')
                 OR (reorder_level > 0 AND available_stock <= reorder_level)
               )
           ) AS low_stock,
           (
             SELECT COUNT(*)::int FROM branch_inventory
             WHERE available_stock <= 0 OR stock_status = 'Out of Stock'
           ) AS out_of_stock,
           (SELECT COUNT(DISTINCT branch_id)::int FROM branch_inventory) AS branches_with_stock,
           (SELECT COUNT(*)::int FROM branches WHERE status = 'Active') AS active_branches,
           (
             SELECT COUNT(*)::int
             FROM products p
             LEFT JOIN central_inventory ci ON ci.product_id = p.id
             LEFT JOIN (
               SELECT product_id, SUM(available_stock)::int AS branch_total
               FROM branch_inventory
               GROUP BY product_id
             ) bt ON bt.product_id = p.id
             WHERE COALESCE(p.status, 'Active') = 'Active'
               AND COALESCE(ci.total_quantity, 0) = COALESCE(bt.branch_total, 0)
           ) AS aligned_products`,
        branchParams
      ),
      pool.query(
        `SELECT
           b.id AS branch_id,
           b.name AS branch_name,
           b.address,
           b.region,
           COALESCE(SUM(bi.available_stock), 0)::int AS total_units,
           COUNT(bi.inventory_id)::int AS products_stocked,
           COUNT(*) FILTER (
             WHERE bi.available_stock > 0
               AND (
                 bi.stock_status IN ('Low Stock', 'Critical Stock')
                 OR (bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level)
               )
           )::int AS low_stock,
           COUNT(*) FILTER (
             WHERE bi.available_stock <= 0 OR bi.stock_status = 'Out of Stock'
           )::int AS out_of_stock,
           COALESCE((
             SELECT string_agg(DISTINCT area, ', ' ORDER BY area)
             FROM (
               SELECT TRIM(unnest(string_to_array(COALESCE(t.coverage_area, ''), ','))) AS area
               FROM territories t
               WHERE t.branch_id = b.id
                 AND NULLIF(TRIM(t.coverage_area), '') IS NOT NULL
             ) areas
             WHERE area <> ''
           ), NULLIF(TRIM(b.region), ''), NULLIF(TRIM(b.address), ''), 'Coverage pending') AS areas_covered
         FROM branches b
         LEFT JOIN branch_inventory bi ON bi.branch_id = b.id
         WHERE b.status = 'Active'
           ${branchOnlySql}
         GROUP BY b.id, b.name, b.address, b.region
         ORDER BY total_units DESC, b.name`,
        branchParams
      ),
      pool.query(
        `SELECT
           bi.inventory_id,
           bi.branch_id,
           b.name AS branch_name,
           bi.product_id,
           p.name AS product_name,
           p.sku,
           bi.available_stock,
           bi.reorder_level,
           COALESCE(
             NULLIF(bi.stock_status, ''),
             CASE
               WHEN bi.available_stock <= 0 THEN 'Out of Stock'
               WHEN bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level THEN 'Low Stock'
               ELSE 'Sufficient'
             END
           ) AS stock_status,
           bi.updated_at
         FROM branch_inventory bi
         JOIN products p ON p.id = bi.product_id
         JOIN branches b ON b.id = bi.branch_id
         WHERE (
              bi.available_stock <= 0
              OR bi.stock_status IN ('Out of Stock', 'Critical Stock', 'Low Stock')
              OR (bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level)
           )
           ${alertBranchSql}
         ORDER BY
           CASE
             WHEN bi.available_stock <= 0 OR bi.stock_status = 'Out of Stock' THEN 0
             WHEN bi.stock_status = 'Critical Stock' THEN 1
             ELSE 2
           END,
           bi.available_stock ASC
         LIMIT 25`,
        branchParams
      ),
      pool.query(
        `SELECT
           sm.id AS movement_id,
           sm.movement_ref,
           sm.type,
           sm.quantity,
           sm.movement_date,
           sm.created_at,
           p.name AS product_name,
           b.name AS branch_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         LEFT JOIN branches b ON b.id = sm.branch_id
         WHERE 1=1
           ${movementBranchSql}
         ORDER BY sm.created_at DESC NULLS LAST, sm.id DESC
         LIMIT 12`,
        branchParams
      ),
    ]);

    const data = productsResult.rows.map((row) => {
      const branchTotal = Number(row.branch_total) || 0;
      const centralQuantity = scopedBranchId != null
        ? branchTotal
        : Number(row.central_quantity) || 0;
      return {
        ...row,
        central_quantity: centralQuantity,
        branch_count: scopedBranchId != null ? (branchTotal > 0 || Number(row.inventory_rows) > 0 ? 1 : 0) : Number(row.branch_count) || 0,
        branch_total: branchTotal,
        aligned: centralQuantity === branchTotal,
      };
    });

    const metrics = metricsResult.rows[0] || {};
    const totalStock = Number(metrics.total_stock) || 0;
    const byBranch = byBranchResult.rows.map((row) => {
      const units = Number(row.total_units) || 0;
      return {
        ...row,
        total_units: units,
        share_pct: totalStock > 0 ? Math.round((units / totalStock) * 1000) / 10 : 0,
      };
    });

    return res.json({
      success: true,
      data,
      byBranch,
      alerts: alertsResult.rows,
      recentMovements: movementsResult.rows,
      summary: {
        products: data.length,
        aligned: data.filter((row) => row.aligned).length,
        totalStock,
        centralTotal: Number(metrics.central_total) || 0,
        productsTracked: Number(metrics.products_tracked) || data.length,
        lowStock: Number(metrics.low_stock) || 0,
        outOfStock: Number(metrics.out_of_stock) || 0,
        branchesWithStock: Number(metrics.branches_with_stock) || 0,
        activeBranches: Number(metrics.active_branches) || byBranch.length,
        alignedProducts: Number(metrics.aligned_products) || data.filter((row) => row.aligned).length,
        lastSyncedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Inventory] GET /central error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load central inventory.' });
  }
});

// Rebuild central_inventory from live branch_inventory (single source of truth).
router.post('/central/realign', requireAuth, requireRole(['operating_manager', 'super_admin', 'inventory_staff']), async (req, res) => {
  const pool = req.app.locals.pool;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO central_inventory (product_id, total_quantity, branch_count, updated_at)
       SELECT p.id,
              COALESCE(SUM(bi.available_stock), 0),
              COUNT(bi.inventory_id)::int,
              CURRENT_TIMESTAMP
       FROM products p
       LEFT JOIN branch_inventory bi ON bi.product_id = p.id
       GROUP BY p.id
       ON CONFLICT (product_id) DO UPDATE
         SET total_quantity = EXCLUDED.total_quantity,
             branch_count = EXCLUDED.branch_count,
             updated_at = CURRENT_TIMESTAMP`
    );
    // Drop orphan central rows for deleted products (FK usually handles this).
    await client.query(
      `DELETE FROM central_inventory ci
       WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ci.product_id)`
    );
    const check = await client.query(
      `SELECT COUNT(*)::int AS products,
              COUNT(*) FILTER (
                WHERE COALESCE(ci.total_quantity, 0) = COALESCE(bt.branch_total, 0)
              )::int AS aligned
       FROM products p
       LEFT JOIN central_inventory ci ON ci.product_id = p.id
       LEFT JOIN (
         SELECT product_id, SUM(available_stock)::int AS branch_total
         FROM branch_inventory
         GROUP BY product_id
       ) bt ON bt.product_id = p.id`
    );
    await logWarehouseAudit(
      client,
      req.currentUser.id,
      'Central Inventory Realign',
      `Rebuilt central totals for ${check.rows[0]?.products || 0} products`
    );
    await client.query('COMMIT');
    return res.json({
      success: true,
      message: 'Central inventory realigned from branch stock.',
      summary: {
        products: Number(check.rows[0]?.products) || 0,
        aligned: Number(check.rows[0]?.aligned) || 0,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /central/realign error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to realign central inventory.' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory-transfers
// ──────────────────────────────────────────────────────────────────────────────
router.get('/transfers', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { status } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (!isUnscoped(user)) {
      conditions.push(`(it.source_branch_id = $${pIdx} OR it.destination_branch_id = $${pIdx})`);
      params.push(user.branchId);
      pIdx++;
    }
    if (status && status !== 'All') {
      conditions.push(`it.status = $${pIdx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         it.transfer_id, it.transfer_ref, it.quantity, it.status,
         it.source_branch_id, it.destination_branch_id, it.submitted_by,
         it.submitted_date, it.completed_date, it.approval_info,
         it.created_at, it.updated_at,
         p.name AS product_name, p.sku,
         sb.name AS source_branch,
         db.name AS destination_branch,
         sub.full_name AS submitted_by_name,
         apv.full_name AS approved_by_name
       FROM inventory_transfers it
       JOIN products p ON p.id = it.product_id
       JOIN branches sb ON sb.id = it.source_branch_id
       JOIN branches db ON db.id = it.destination_branch_id
       LEFT JOIN users sub ON sub.id = it.submitted_by
       LEFT JOIN users apv ON apv.id = it.approved_by
       ${where}
       ORDER BY it.created_at DESC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /transfers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transfers.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory-transfers/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/transfers/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT
         it.transfer_id, it.transfer_ref, it.quantity, it.status,
         it.source_branch_id, it.destination_branch_id, it.submitted_by,
         it.submitted_date, it.completed_date, it.approval_info, it.created_at, it.updated_at,
         p.name AS product_name, p.sku,
         sb.name AS source_branch,
         db.name AS destination_branch,
         sub.full_name AS submitted_by_name,
         apv.full_name AS approved_by_name
       FROM inventory_transfers it
       JOIN products p ON p.id = it.product_id
       JOIN branches sb ON sb.id = it.source_branch_id
       JOIN branches db ON db.id = it.destination_branch_id
       LEFT JOIN users sub ON sub.id = it.submitted_by
       LEFT JOIN users apv ON apv.id = it.approved_by
       WHERE it.transfer_id = $1
         AND ($2::int IS NULL OR it.source_branch_id = $2 OR it.destination_branch_id = $2)`,
      [req.params.id, isUnscoped(req.currentUser) ? null : req.currentUser.branchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Inventory] GET /transfers/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transfer.' });
  }
});

const TRANSFER_STATUSES = new Set([
  'Pending Approval',
  'Submitted',
  'Approved',
  'Completed',
  'Rejected',
]);

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function assertTransferStatusChange(user, currentStatus, nextStatus, transferRow) {
  const role = user.roleSlug;
  const pending = ['Pending Approval', 'Submitted'];

  if (nextStatus === 'Approved' || nextStatus === 'Rejected') {
    if (!TRANSFER_APPROVER_ROLES.has(role)) {
      return {
        ok: false,
        status: 403,
        message: 'Only branch or operating managers can approve or reject transfers. Warehouse staff submit requests only.',
      };
    }
    if (!pending.includes(currentStatus)) {
      return {
        ok: false,
        status: 400,
        message: `Cannot set ${nextStatus} when transfer is already ${currentStatus}.`,
      };
    }
    return { ok: true };
  }

  if (nextStatus === 'Completed') {
    if (currentStatus !== 'Approved') {
      return {
        ok: false,
        status: 400,
        message: 'Transfer must be approved before stock can be moved. Wait for manager approval.',
      };
    }
    if (role === 'inventory_staff') {
      if (user.branchId !== transferRow.source_branch_id) {
        return {
          ok: false,
          status: 403,
          message: 'Only warehouse staff at the source branch can confirm shipment and complete this transfer.',
        };
      }
    } else if (!TRANSFER_APPROVER_ROLES.has(role)) {
      return { ok: false, status: 403, message: 'Not authorized to complete transfers.' };
    }
    return { ok: true };
  }

  return { ok: false, status: 400, message: 'Invalid or unsupported status change.' };
}

async function completeTransferStock(client, transferRow, userId) {
  const {
    product_id: productId,
    quantity,
    source_branch_id: sourceId,
    destination_branch_id: destId,
    transfer_ref: transferRef,
  } = transferRow;
  const product = await client.query(`SELECT reorder_point FROM products WHERE id = $1`, [productId]);
  const reorder = product.rows[0]?.reorder_point ?? 5;
  const today = manilaToday();

  const sourceSnapshot = await upsertBranchInventoryStock(client, {
    branchId: sourceId,
    productId,
    delta: -quantity,
    reorderLevel: reorder,
  });
  await upsertBranchInventoryStock(client, {
    branchId: destId,
    productId,
    delta: quantity,
    reorderLevel: reorder,
  });

  await insertStockMovement(client, {
    performedBy: userId,
    productId,
    branchId: sourceId,
    quantity: -quantity,
    type: 'Transfer Out',
    movementRef: `MOV-${transferRef}-OUT`,
    movementDate: today,
  });
  await insertStockMovement(client, {
    performedBy: userId,
    productId,
    branchId: destId,
    quantity,
    type: 'Transfer In',
    movementRef: `MOV-${transferRef}-IN`,
    movementDate: today,
  });
  return sourceSnapshot;
}

// PATCH /api/inventory/transfers/:id — approve or reject (org / inventory roles)
router.patch('/transfers/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const transferId = Number(req.params.id);
    const { status, approval_info: approvalInfo } = req.body;

    if (!Number.isFinite(transferId)) {
      return res.status(400).json({ success: false, message: 'Invalid transfer ID.' });
    }
    if (!TRANSFER_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid transfer status.' });
    }

    const existing = await pool.query(
      `SELECT transfer_id, source_branch_id, destination_branch_id, status AS current_status
       FROM inventory_transfers WHERE transfer_id = $1`,
      [transferId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }
    const row = existing.rows[0];
    if (!isUnscoped(user)
      && row.source_branch_id !== user.branchId
      && row.destination_branch_id !== user.branchId) {
      return res.status(403).json({ success: false, message: 'Transfer is outside your branch scope.' });
    }

    const completedDate = status === 'Completed' ? manilaToday() : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fullRow = await client.query(
        `SELECT * FROM inventory_transfers WHERE transfer_id = $1 FOR UPDATE`,
        [transferId]
      );
      if (!fullRow.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Transfer not found.' });
      }
      const transferRow = fullRow.rows[0];
      if (!isUnscoped(user)
        && transferRow.source_branch_id !== user.branchId
        && transferRow.destination_branch_id !== user.branchId
        && !TRANSFER_APPROVER_ROLES.has(user.roleSlug)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'Transfer is outside your branch scope.' });
      }

      const gate = assertTransferStatusChange(user, transferRow.status, status, transferRow);
      if (!gate.ok) {
        await client.query('ROLLBACK');
        return res.status(gate.status).json({ success: false, message: gate.message });
      }

      if (status === 'Rejected' && !String(approvalInfo || '').trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
      }

      const setApprover = status === 'Approved' || status === 'Rejected' ? user.id : transferRow.approved_by;

      const result = await client.query(
        `UPDATE inventory_transfers
         SET status = $1,
             approved_by = COALESCE($2, approved_by),
             approval_info = COALESCE($3, approval_info),
             completed_date = COALESCE($4, completed_date),
             updated_at = CURRENT_TIMESTAMP
         WHERE transfer_id = $5
         RETURNING transfer_id, transfer_ref, status, approval_info, completed_date, updated_at`,
        [status, setApprover, approvalInfo ? String(approvalInfo).trim() : null, completedDate, transferId]
      );

      let sourceSnapshot = null;
      if (status === 'Completed' && transferRow.status !== 'Completed') {
        sourceSnapshot = await completeTransferStock(client, transferRow, user.id);
      }

      await client.query('COMMIT');
      if (sourceSnapshot) await publishStockAlerts(pool, [sourceSnapshot]);

      if (status === 'Approved' || status === 'Rejected') {
        await notifyTransferDecision(pool, {
          submitterId: transferRow.submitted_by,
          transferRef: transferRow.transfer_ref,
          status,
          rejectionReason: approvalInfo,
        });
      }
      if (status === 'Completed') {
        const productRow = await pool.query(`SELECT name FROM products WHERE id = $1`, [transferRow.product_id]);
        await notifyTransferCompleted(pool, {
          transferRef: transferRow.transfer_ref,
          productName: productRow.rows[0]?.name || 'Product',
          destinationBranchId: transferRow.destination_branch_id,
        });
      }

      await logWarehouseAudit(
        pool,
        user.id,
        `Transfer ${status}`,
        transferRow.transfer_ref,
        req.ip
      );

      const userMessage =
        status === 'Completed'
          ? 'Transfer completed and stock updated at both branches.'
          : status === 'Approved'
            ? 'Transfer approved. Source warehouse can confirm shipment to complete.'
            : `Transfer ${status.toLowerCase()}.`;

      return res.status(200).json({
        success: true,
        message: userMessage,
        data: result.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.message === 'INSUFFICIENT_STOCK') {
        return res.status(400).json({ success: false, message: 'Insufficient stock to complete transfer.' });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Inventory] PATCH /transfers/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update transfer.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/restocks
// ──────────────────────────────────────────────────────────────────────────────
router.get('/restocks', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const scopedBranchId = isUnscoped(user) ? null : user.branchId;
    const branchWhere = scopedBranchId ? 'WHERE r.branch_id = $1' : '';
    const params = scopedBranchId ? [scopedBranchId] : [];

    const result = await pool.query(
      `SELECT
         r.restock_id, r.delivery_ref, r.quantity, r.received_date,
         p.name AS product_name, p.sku,
         b.name AS branch_name,
         s.supplier_name
       FROM restocks r
       JOIN products p ON p.id = r.product_id
       JOIN branches b ON b.id = r.branch_id
       JOIN suppliers s ON s.suppliers_id = r.supplier_id
       ${branchWhere}
       ORDER BY r.received_date DESC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /restocks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch restocks.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/branch-inventory
// Returns the full branch_inventory table with all schema columns,
// joined with product name and branch name. Branch-scoped for non-OM roles.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branch-inventory', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Branch-scope: only OM / super_admin may see all branches.
    // Branch managers / warehouse staff always see their assigned branch only.
    if (!isUnscoped(user)) {
      if (user.branchId == null) {
        return res.status(403).json({
          success: false,
          message: 'No branch assigned. Cannot view branch inventory.',
        });
      }
      conditions.push(`bi.branch_id = $${pIdx++}`);
      params.push(Number(user.branchId));
    } else if (req.query.branch_id) {
      const branchId = Number(req.query.branch_id);
      if (Number.isFinite(branchId)) {
        conditions.push(`bi.branch_id = $${pIdx++}`);
        params.push(branchId);
      }
    }

    if (req.query.status && req.query.status !== 'All') {
      conditions.push(`bi.stock_status = $${pIdx++}`);
      params.push(req.query.status);
    }

    // Hide archived catalog products from operational inventory lists.
    // OM manages archived SKUs under Inventory → Products, not here.
    conditions.push(`COALESCE(p.status, 'Active') = 'Active'`);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         bi.inventory_id AS branch_inventory_id,
         bi.branch_id,
         b.name   AS branch_name,
         bi.product_id,
         p.name   AS product_name,
         p.sku,
         pc.category_name,
         bi.available_stock,
         bi.reorder_level,
         bi.stock_status,
         bi.created_at,
         bi.updated_at
       FROM branch_inventory bi
       JOIN branches b          ON b.id               = bi.branch_id
       JOIN products p          ON p.id               = bi.product_id
       LEFT JOIN product_categories pc ON pc.category_id = p.category_id
       ${where}
       ORDER BY b.name, p.name`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('[Inventory] GET /branch-inventory error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branch inventory.' });
  }
});

const STOCK_MOVEMENT_SELECT = `
  SELECT
    sm.id AS movement_id,
    sm.movement_ref,
    sm.product_id,
    p.name AS product_name,
    p.sku,
    sm.quantity,
    sm.type,
    sm.movement_date,
    sm.created_at,
    sm.branch_id,
    b.name AS branch_name,
    sm.performed_by,
    u.full_name AS performed_by_name
  FROM stock_movements sm
  JOIN products p ON p.id = sm.product_id
  LEFT JOIN branches b ON b.id = sm.branch_id
  LEFT JOIN users u ON u.id = sm.performed_by
`;

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/movements
// Query: type, product_id, branch_id, date_from, date_to
// ──────────────────────────────────────────────────────────────────────────────
router.get('/movements', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { type, product_id, branch_id, date_from, date_to } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    const scopeBranchId = !isUnscoped(user)
      ? user.branchId
      : (branch_id ? Number(branch_id) : null);

    if (scopeBranchId !== null && Number.isFinite(Number(scopeBranchId))) {
      conditions.push(`sm.branch_id = $${pIdx++}`);
      params.push(Number(scopeBranchId));
    }

    if (type && type !== 'All') {
      conditions.push(`sm.type = $${pIdx++}`);
      params.push(type);
    }

    if (product_id && Number.isFinite(Number(product_id))) {
      conditions.push(`sm.product_id = $${pIdx++}`);
      params.push(Number(product_id));
    }

    if (date_from) {
      conditions.push(`sm.movement_date >= $${pIdx++}`);
      params.push(date_from);
    }

    if (date_to) {
      conditions.push(`sm.movement_date <= $${pIdx++}`);
      params.push(date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `${STOCK_MOVEMENT_SELECT}
       ${where}
       ORDER BY sm.movement_date DESC, sm.id DESC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[Inventory] GET /movements error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stock movements.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/movements/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/movements/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const movementId = Number(req.params.id);

    if (!Number.isFinite(movementId)) {
      return res.status(400).json({ success: false, message: 'Invalid movement id.' });
    }

    const params = [movementId];
    let branchClause = '';

    if (!isUnscoped(user)) {
      branchClause = ' AND sm.branch_id = $2';
      params.push(user.branchId);
    }

    const result = await pool.query(
      `${STOCK_MOVEMENT_SELECT}
       WHERE sm.id = $1${branchClause}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movement not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Inventory] GET /movements/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stock movement.' });
  }
});

function nextTransferRef(pool) {
  return pool.query(`SELECT COUNT(*)::int AS c FROM inventory_transfers`).then((r) => {
    const n = (r.rows[0]?.c || 0) + 1;
    return `TRF-${String(n).padStart(5, '0')}`;
  });
}

// GET /api/inventory/branches — active branch names for transfer destinations.
// Names only (no stock/customers). Branch staff need other branches as destinations.
router.get('/branches', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      `SELECT id AS branch_id, name AS branch_name FROM branches WHERE status = 'Active' ORDER BY name`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /branches error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load branches.' });
  }
});

// GET /api/inventory/dashboard — warehouse staff KPIs
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const branchId = user.branchId;
    const today = manilaToday();
    if (branchId == null) {
      return res.status(403).json({ success: false, message: 'No branch assigned.' });
    }

    const [products, health, movementsToday, pendingTransfers, recentTransfers, recentRestocks, topMoving] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE stock_status IN ('Low Stock', 'Critical Stock', 'Out of Stock'))::int AS low_alerts
           FROM branch_inventory WHERE branch_id = $1`,
          [branchId]
        ),
        pool.query(
          `SELECT stock_status, COUNT(*)::int AS count
           FROM branch_inventory WHERE branch_id = $1
           GROUP BY stock_status`,
          [branchId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM stock_movements
           WHERE branch_id = $1 AND movement_date = $2::date`,
          [branchId, today]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM inventory_transfers
           WHERE (source_branch_id = $1 OR destination_branch_id = $1)
             AND status IN ('Pending Approval', 'Submitted')`,
          [branchId]
        ),
        pool.query(
          `SELECT it.transfer_id, it.transfer_ref, it.status, p.name AS product_name
           FROM inventory_transfers it
           JOIN products p ON p.id = it.product_id
           WHERE it.source_branch_id = $1 OR it.destination_branch_id = $1
           ORDER BY it.created_at DESC LIMIT 5`,
          [branchId]
        ),
        pool.query(
          `SELECT r.restock_id, r.delivery_ref, r.quantity, r.received_date, p.name AS product_name
           FROM restocks r
           JOIN products p ON p.id = r.product_id
           WHERE r.branch_id = $1
           ORDER BY r.received_date DESC LIMIT 5`,
          [branchId]
        ),
        pool.query(
          `SELECT p.name, COUNT(*)::int AS movements
           FROM stock_movements sm
           JOIN products p ON p.id = sm.product_id
           WHERE sm.branch_id = $1 AND sm.movement_date >= $2::date - 30
           GROUP BY p.name ORDER BY movements DESC LIMIT 5`,
          [branchId, today]
        ),
      ]);

    const healthMap = { sufficient: 0, low: 0, critical: 0, outOfStock: 0 };
    for (const row of health.rows) {
      const s = String(row.stock_status || '');
      if (s === 'Sufficient') healthMap.sufficient = row.count;
      else if (s === 'Low Stock') healthMap.low = row.count;
      else if (s === 'Critical Stock') healthMap.critical = row.count;
      else if (s === 'Out of Stock') healthMap.outOfStock = row.count;
    }

    const alerts = await pool.query(
      `SELECT p.id AS product_id, p.name AS product_name, p.sku, bi.available_stock, bi.stock_status, b.name AS branch_name
       FROM branch_inventory bi
       JOIN products p ON p.id = bi.product_id
       JOIN branches b ON b.id = bi.branch_id
       WHERE bi.branch_id = $1 AND bi.stock_status IN ('Critical Stock', 'Out of Stock', 'Low Stock')
       ORDER BY bi.available_stock ASC LIMIT 10`,
      [branchId]
    );

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalProducts: products.rows[0]?.total || 0,
          lowStockAlerts: products.rows[0]?.low_alerts || 0,
          pendingRestocks: 0,
          movementsToday: movementsToday.rows[0]?.count || 0,
          pendingTransfers: pendingTransfers.rows[0]?.count || 0,
        },
        inventoryHealth: healthMap,
        criticalProducts: alerts.rows,
        recentTransfers: recentTransfers.rows,
        recentRestocks: recentRestocks.rows,
        topMovingProducts: topMoving.rows,
        quickProductId: alerts.rows[0]?.product_id || null,
      },
    });
  } catch (err) {
    console.error('[Inventory] GET /dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load warehouse dashboard.' });
  }
});

// GET /api/inventory/restocks/:id
router.get('/restocks/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const restockId = Number(req.params.id);
    const params = [restockId];
    let branchSql = '';
    if (!isUnscoped(user)) {
      branchSql = ' AND r.branch_id = $2';
      params.push(user.branchId);
    }
    const result = await pool.query(
      `SELECT r.restock_id, r.delivery_ref, r.quantity, r.received_date, r.product_id, r.branch_id,
              p.name AS product_name, p.sku, b.name AS branch_name, s.supplier_name, s.suppliers_id
       FROM restocks r
       JOIN products p ON p.id = r.product_id
       JOIN branches b ON b.id = r.branch_id
       JOIN suppliers s ON s.suppliers_id = r.supplier_id
       WHERE r.restock_id = $1${branchSql}`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Restock not found.' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Inventory] GET /restocks/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch restock.' });
  }
});

// POST /api/inventory/restocks
router.post('/restocks', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const productId = Number(req.body.product_id);
  const supplierId = Number(req.body.supplier_id);
  const quantity = Number(req.body.quantity);
  const deliveryRef = String(req.body.delivery_ref || '').trim();
  const receivedDate = req.body.received_date || manilaToday();

  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  if (!Number.isFinite(productId) || !Number.isFinite(supplierId) || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Product, supplier, and positive quantity are required.' });
  }
  if (!deliveryRef) {
    return res.status(400).json({ success: false, message: 'Delivery reference is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = await client.query(
      `SELECT id, reorder_point FROM products WHERE id = $1`,
      [productId]
    );
    if (!product.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const restock = await client.query(
      `INSERT INTO restocks (product_id, branch_id, delivery_ref, supplier_id, quantity, received_date)
       VALUES ($1, $2, $3, $4, $5, $6::date)
       RETURNING restock_id, delivery_ref`,
      [productId, branchId, deliveryRef, supplierId, quantity, receivedDate]
    );

    const stockSnapshot = await upsertBranchInventoryStock(client, {
      branchId,
      productId,
      delta: quantity,
      reorderLevel: product.rows[0].reorder_point,
    });

    const movRef = `MOV-${deliveryRef}`;
    await insertStockMovement(client, {
      performedBy: user.id,
      productId,
      branchId,
      quantity,
      type: 'Restock',
      movementRef: movRef,
      movementDate: receivedDate,
    });

    await client.query('COMMIT');
    await publishStockAlerts(pool, [stockSnapshot]);
    await logWarehouseAudit(pool, user.id, 'Restock recorded', `${deliveryRef} +${quantity} units`, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Restock recorded and inventory updated.',
      data: restock.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /restocks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record restock.' });
  } finally {
    client.release();
  }
});

// POST /api/inventory/stock-counts
router.post('/stock-counts', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const productId = Number(req.body.product_id);
  const physicalCount = Number(req.body.physical_count);
  const notes = String(req.body.notes || '').trim();

  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  if (!Number.isFinite(productId) || !Number.isFinite(physicalCount) || physicalCount < 0) {
    return res.status(400).json({ success: false, message: 'Valid product and physical count are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await client.query(
      `SELECT available_stock, reorder_level FROM branch_inventory WHERE branch_id = $1 AND product_id = $2`,
      [branchId, productId]
    );
    const systemQty = row.rows[0] ? Number(row.rows[0].available_stock) : 0;
    const variance = physicalCount - systemQty;
    if (variance !== 0 && !notes) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Notes required when variance exists.' });
    }

    let stockSnapshot = null;
    if (variance !== 0) {
      stockSnapshot = await upsertBranchInventoryStock(client, {
        branchId,
        productId,
        delta: variance,
        reorderLevel: row.rows[0]?.reorder_level,
      });
      const ref = `CNT-${Date.now()}`;
      await insertStockMovement(client, {
        performedBy: user.id,
        productId,
        branchId,
        quantity: variance,
        type: 'Stock Count Adjustment',
        movementRef: ref,
        movementDate: manilaToday(),
      });
    }

    await client.query('COMMIT');
    if (stockSnapshot) await publishStockAlerts(pool, [stockSnapshot]);
    await logWarehouseAudit(
      pool,
      user.id,
      'Stock count',
      `Product ${productId}: system ${systemQty}, physical ${physicalCount}${notes ? ` — ${notes}` : ''}`,
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: variance === 0 ? 'Stock count recorded (no adjustment).' : 'Stock count adjustment applied.',
      data: { systemQty, physicalCount, variance },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /stock-counts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit stock count.' });
  } finally {
    client.release();
  }
});

// POST /api/inventory/transfers
router.post('/transfers', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const productId = Number(req.body.product_id);
  const destinationBranchId = Number(req.body.destination_branch_id);
  const quantity = Number(req.body.quantity);
  const notes = String(req.body.notes || '').trim();

  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  if (!Number.isFinite(productId) || !Number.isFinite(destinationBranchId) || destinationBranchId === branchId) {
    return res.status(400).json({ success: false, message: 'Valid product and destination branch are required.' });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Quantity must be positive.' });
  }

  const stock = await pool.query(
    `SELECT available_stock FROM branch_inventory WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId]
  );
  const available = stock.rows[0] ? Number(stock.rows[0].available_stock) : 0;
  if (quantity > available) {
    return res.status(400).json({
      success: false,
      message: `Cannot transfer more than available stock (${available} units).`,
    });
  }

  const transferRef = await nextTransferRef(pool);
  const result = await pool.query(
    `INSERT INTO inventory_transfers (
       transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
       status, submitted_by, approval_info, submitted_date
     ) VALUES ($1, $2, $3, $4, $5, 'Pending Approval', $6, $7, $8::date)
     RETURNING transfer_id, transfer_ref, status`,
    [transferRef, productId, quantity, branchId, destinationBranchId, user.id, notes || null, manilaToday()]
  );

  const [productMeta, submitterMeta] = await Promise.all([
    pool.query(`SELECT name FROM products WHERE id = $1`, [productId]),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    ),
  ]);

  await notifyTransferSubmitted(pool, {
    sourceBranchId: branchId,
    transferRef,
    productName: productMeta.rows[0]?.name || 'Product',
    quantity,
    submitterName: submitterMeta.rows[0]?.display_name || 'Warehouse staff',
  });

  await logWarehouseAudit(pool, user.id, 'Transfer submitted', `${transferRef} qty ${quantity}`, req.ip);

  return res.status(201).json({
    success: true,
    message: 'Transfer submitted for branch manager approval.',
    data: result.rows[0],
  });
});

// GET /api/inventory/audit-logs
router.get('/audit-logs', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const result = await pool.query(
      `SELECT log_id, action, status_details AS detail, created_at AS timestamp
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [user.id]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load audit logs.' });
  }
});

// POST /api/inventory/products — create product + optional branch stock
router.post('/products', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const {
    name,
    sku,
    category_id: categoryId,
    description,
    unit_price: unitPrice,
    unit_type: unitType,
    reorder_point: reorderPoint,
    supplier_id: supplierId,
    initial_quantity: initialQuantity,
    image_url: imageUrl,
  } = req.body;

  if (!normalizeProductName(name) || !sku) {
    return res.status(400).json({ success: false, message: 'Name and SKU are required.' });
  }
  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  const normalizedImage = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null;
  if (normalizedImage && !(normalizedImage.startsWith('data:image/') || /^https?:\/\//i.test(normalizedImage))) {
    return res.status(400).json({ success: false, message: 'image_url must be an image upload or URL.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productName = normalizeProductName(name);
    if (await productNameTaken(client, productName)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'A product with this name already exists.' });
    }
    const dup = await client.query(`SELECT id FROM products WHERE sku = $1`, [sku.toUpperCase().trim()]);
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'SKU already exists.' });
    }

    const created = await client.query(
      `INSERT INTO products (name, sku, category_id, description, unit_price, unit_type, supplier_id, reorder_point, status, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active', $9)
       RETURNING id AS product_id`,
      [
        productName,
        String(sku).toUpperCase().trim(),
        categoryId ? Number(categoryId) : null,
        description || null,
        Number(unitPrice) || 0,
        unitType || 'Unit',
        supplierId ? Number(supplierId) : null,
        Number(reorderPoint) || 5,
        normalizedImage,
      ]
    );
    const productId = created.rows[0].product_id;
    const qty = Number(initialQuantity) || 0;
    let stockSnapshot = null;
    if (qty > 0) {
      stockSnapshot = await upsertBranchInventoryStock(client, {
        branchId,
        productId,
        delta: qty,
        reorderLevel: Number(reorderPoint) || 5,
      });
    } else {
      await alignCentralInventory(client, productId);
    }

    await client.query('COMMIT');
    if (stockSnapshot) await publishStockAlerts(pool, [stockSnapshot]);
    await logWarehouseAudit(pool, user.id, 'Product created', `${name} (${sku})`, req.ip);

    return res.status(201).json({ success: true, message: 'Product created.', data: { product_id: productId } });
  } catch (err) {
    await client.query('ROLLBACK');
    const nameConflict = productNameConflict(err);
    if (nameConflict) return res.status(409).json({ success: false, message: nameConflict });
    console.error('[Inventory] POST /products error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create product.' });
  } finally {
    client.release();
  }
});

export default router;
