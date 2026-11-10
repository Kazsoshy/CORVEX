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
  notifyRestockDecision,
  notifyRestockRecorded,
  notifyRestockSubmitted,
  notifyStockCountDecision,
  notifyStockCountSubmitted,
  notifyTransferCompleted,
  notifyTransferDecision,
  notifyTransferShipped,
  notifyTransferSubmitted,
} from '../lib/inventoryTransferNotifications.js';
import {
  getAvailableToTransfer,
  loadRestockLines,
  loadTransferLines,
  manilaToday,
  nextDeliveryRef,
  nextRestockRef,
  nextStockCountRef,
  nextTransferRef,
  parseDocumentLines,
  postRestockStock,
  postStockCountAdjustments,
  receiveTransferStock,
  shipTransferStock,
  summarizeLines,
} from '../lib/inventoryDocuments.js';
import { publishStockAlerts } from '../lib/operationalNotifications.js';
import { normalizeProductName, productNameConflict, productNameTaken } from '../lib/productName.js';
import {
  parseMovementDocument,
  selectMatchingGroups,
} from '../lib/stockMovementGroups.js';

const TRANSFER_APPROVER_ROLES = new Set(['branch_manager', 'operating_manager', 'super_admin']);
/** Stock mutations (restock / count / transfer create / product create) — warehouse only.
 *  OM/BM approve designated documents; they do not create routine warehouse receipts. */
const INVENTORY_WRITER_ROLES = ['inventory_staff', 'super_admin'];
const INVENTORY_APPROVER_ROLES = ['branch_manager', 'operating_manager', 'super_admin'];

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
      if (String(status).toLowerCase() === 'pending') {
        conditions.push(`it.status IN ('Pending Approval', 'Submitted')`);
      } else {
        conditions.push(`it.status = $${pIdx++}`);
        params.push(status);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         it.transfer_id, it.transfer_ref, it.status, it.notes,
         it.source_branch_id, it.destination_branch_id, it.submitted_by,
         it.submitted_date, it.completed_date, it.approval_info,
         it.created_at, it.updated_at,
         sb.name AS source_branch,
         db.name AS destination_branch,
         sub.full_name AS submitted_by_name,
         apv.full_name AS approved_by_name,
         CASE
           WHEN COALESCE(agg.line_count, 0) > 0 THEN agg.line_count
           WHEN it.product_id IS NOT NULL AND COALESCE(it.quantity, 0) > 0 THEN 1
           ELSE 0
         END::int AS line_count,
         CASE
           WHEN COALESCE(agg.line_count, 0) > 0 THEN agg.total_quantity
           ELSE COALESCE(it.quantity, 0)
         END::int AS quantity,
         CASE
           WHEN COALESCE(agg.line_count, 0) > 0 THEN agg.total_quantity
           ELSE COALESCE(it.quantity, 0)
         END::int AS total_quantity,
         CASE
           WHEN COALESCE(agg.line_count, 0) > 1 THEN agg.first_product_name || ' +' || (agg.line_count - 1)::text || ' more'
           WHEN COALESCE(agg.line_count, 0) = 1 THEN agg.first_product_name
           ELSE lp.name
         END AS product_name,
         CASE
           WHEN COALESCE(agg.line_count, 0) = 1 THEN agg.first_sku
           WHEN COALESCE(agg.line_count, 0) = 0 THEN lp.sku
           ELSE NULL
         END AS sku
       FROM inventory_transfers it
       JOIN branches sb ON sb.id = it.source_branch_id
       JOIN branches db ON db.id = it.destination_branch_id
       LEFT JOIN users sub ON sub.id = it.submitted_by
       LEFT JOIN users apv ON apv.id = it.approved_by
       LEFT JOIN products lp ON lp.id = it.product_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS line_count,
           COALESCE(SUM(l.quantity), 0)::int AS total_quantity,
           (ARRAY_AGG(p.name ORDER BY p.name))[1] AS first_product_name,
           (ARRAY_AGG(p.sku ORDER BY p.name))[1] AS first_sku
         FROM inventory_transfer_lines l
         JOIN products p ON p.id = l.product_id
         WHERE l.transfer_id = it.transfer_id
       ) agg ON TRUE
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
         it.transfer_id, it.transfer_ref, it.status, it.notes,
         it.product_id, it.quantity AS header_quantity,
         it.source_branch_id, it.destination_branch_id, it.submitted_by,
         it.submitted_date, it.completed_date, it.approval_info, it.created_at, it.updated_at,
         sb.name AS source_branch,
         db.name AS destination_branch,
         sub.full_name AS submitted_by_name,
         apv.full_name AS approved_by_name
       FROM inventory_transfers it
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

    const lines = await loadTransferLines(pool, result.rows[0].transfer_id);
    const summary = summarizeLines(lines);
    // Prefer live lines; if still empty, surface header qty honestly (do not invent products).
    const payload = {
      ...result.rows[0],
      ...summary,
      lines,
    };
    if (!lines.length && Number(result.rows[0].header_quantity) > 0) {
      payload.total_quantity = Number(result.rows[0].header_quantity);
      payload.quantity = Number(result.rows[0].header_quantity);
      payload.line_count = 0;
    }
    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (err) {
    console.error('[Inventory] GET /transfers/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch transfer.' });
  }
});

const TRANSFER_STATUSES = new Set([
  'Pending Approval',
  'Submitted',
  'Approved',
  'Shipped',
  'Received',
  'Completed', // legacy alias of Received
  'Rejected',
]);

function assertTransferStatusChange(user, currentStatus, nextStatus, transferRow) {
  const role = user.roleSlug;
  const pending = ['Pending Approval', 'Submitted'];
  const finalizeStatuses = new Set(['Received', 'Completed']);

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

  if (nextStatus === 'Shipped') {
    if (currentStatus !== 'Approved') {
      return {
        ok: false,
        status: 400,
        message: 'Transfer must be approved before source warehouse can ship.',
      };
    }
    if (role !== 'inventory_staff' && role !== 'super_admin') {
      return {
        ok: false,
        status: 403,
        message: 'Only warehouse staff at the source branch can ship transfers. Managers approve only.',
      };
    }
    if (role === 'inventory_staff'
      && Number(user.branchId) !== Number(transferRow.source_branch_id)) {
      return {
        ok: false,
        status: 403,
        message: 'Only warehouse staff at the source branch can confirm shipment.',
      };
    }
    return { ok: true };
  }

  if (finalizeStatuses.has(nextStatus)) {
    // Legacy clients sending Completed after Approved: treat as ship+receive is blocked;
    // they must use Shipped then Received. Allow Completed only as alias of Received.
    const fromShipped = currentStatus === 'Shipped';
    if (!fromShipped) {
      return {
        ok: false,
        status: 400,
        message: 'Transfer must be Shipped before destination warehouse can receive. Source ships first.',
      };
    }
    if (role !== 'inventory_staff' && role !== 'super_admin') {
      return {
        ok: false,
        status: 403,
        message: 'Only warehouse staff at the destination branch can receive transfers. Managers approve only.',
      };
    }
    if (role === 'inventory_staff'
      && Number(user.branchId) !== Number(transferRow.destination_branch_id)) {
      return {
        ok: false,
        status: 403,
        message: 'Only warehouse staff at the destination branch can confirm receipt.',
      };
    }
    return { ok: true };
  }

  return { ok: false, status: 400, message: 'Invalid or unsupported status change.' };
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

    const isReceive = status === 'Received' || status === 'Completed';
    const persistedStatus = status === 'Completed' ? 'Received' : status;
    const receiveNotes = String(req.body.receive_notes || approvalInfo || '').trim() || null;
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
      let lines = [];
      let stockSnapshot = null;

      if (status === 'Shipped' && transferRow.status !== 'Shipped') {
        lines = await loadTransferLines(client, transferId);
        if (!lines.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Transfer has no product lines to ship.' });
        }
        stockSnapshot = await shipTransferStock(client, transferRow, lines, user.id);
      }

      if (isReceive && transferRow.status !== 'Received' && transferRow.status !== 'Completed') {
        lines = await loadTransferLines(client, transferId);
        if (!lines.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Transfer has no product lines to receive.' });
        }
        stockSnapshot = await receiveTransferStock(client, transferRow, lines, user.id);
      }

      const result = await client.query(
        `UPDATE inventory_transfers
         SET status = $1,
             approved_by = COALESCE($2, approved_by),
             approval_info = COALESCE($3, approval_info),
             shipped_by = CASE WHEN $1 = 'Shipped' THEN $6 ELSE shipped_by END,
             shipped_at = CASE WHEN $1 = 'Shipped' THEN CURRENT_TIMESTAMP ELSE shipped_at END,
             received_by = CASE WHEN $1 = 'Received' THEN $6 ELSE received_by END,
             received_at = CASE WHEN $1 = 'Received' THEN CURRENT_TIMESTAMP ELSE received_at END,
             receive_notes = CASE WHEN $1 = 'Received' THEN COALESCE($7, receive_notes) ELSE receive_notes END,
             completed_date = CASE WHEN $1 = 'Received' THEN $4::date ELSE completed_date END,
             updated_at = CURRENT_TIMESTAMP
         WHERE transfer_id = $5
         RETURNING transfer_id, transfer_ref, status, approval_info, completed_date,
                   shipped_at, received_at, updated_at`,
        [
          persistedStatus,
          setApprover,
          approvalInfo ? String(approvalInfo).trim() : null,
          isReceive ? manilaToday() : null,
          transferId,
          user.id,
          receiveNotes,
        ]
      );

      await client.query('COMMIT');
      if (stockSnapshot) await publishStockAlerts(pool, [stockSnapshot]);

      if (status === 'Approved' || status === 'Rejected') {
        await notifyTransferDecision(pool, {
          submitterId: transferRow.submitted_by,
          transferRef: transferRow.transfer_ref,
          status,
          rejectionReason: approvalInfo,
        });
      }
      if (status === 'Shipped') {
        if (!lines.length) lines = await loadTransferLines(pool, transferId);
        const summary = summarizeLines(lines);
        const srcName = await pool.query(`SELECT name FROM branches WHERE id = $1`, [transferRow.source_branch_id]);
        await notifyTransferShipped(pool, {
          transferRef: transferRow.transfer_ref,
          productName: summary.product_name,
          lineCount: summary.line_count,
          totalQuantity: summary.total_quantity,
          destinationBranchId: transferRow.destination_branch_id,
          sourceBranchName: srcName.rows[0]?.name,
        });
      }
      if (isReceive) {
        if (!lines.length) lines = await loadTransferLines(pool, transferId);
        const summary = summarizeLines(lines);
        await notifyTransferCompleted(pool, {
          transferRef: transferRow.transfer_ref,
          productName: summary.product_name,
          lineCount: summary.line_count,
          totalQuantity: summary.total_quantity,
          destinationBranchId: transferRow.destination_branch_id,
        });
      }

      await logWarehouseAudit(
        pool,
        user.id,
        `Transfer ${persistedStatus}`,
        transferRow.transfer_ref,
        req.ip
      );

      const userMessage =
        persistedStatus === 'Received'
          ? 'Transfer received. Destination stock updated.'
          : status === 'Shipped'
            ? 'Transfer shipped. Source stock deducted. Destination warehouse can confirm receipt.'
            : status === 'Approved'
              ? 'Transfer approved. Source warehouse can confirm shipment.'
              : `Transfer ${String(persistedStatus).toLowerCase()}.`;

      return res.status(200).json({
        success: true,
        message: userMessage,
        data: result.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === 'INSUFFICIENT_STOCK' || err.message === 'INSUFFICIENT_STOCK' || /Insufficient stock/i.test(err.message || '')) {
        return res.status(400).json({
          success: false,
          message: err.message && err.message !== 'INSUFFICIENT_STOCK'
            ? err.message
            : 'Insufficient stock to ship transfer. No stock was moved.',
        });
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
    const { search, product_id, supplier_id, date_from, date_to, status } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (!isUnscoped(user)) {
      if (user.branchId == null) {
        return res.status(403).json({ success: false, message: 'No branch assigned.' });
      }
      conditions.push(`h.branch_id = $${pIdx++}`);
      params.push(user.branchId);
    }

    if (supplier_id && Number.isFinite(Number(supplier_id))) {
      conditions.push(`h.supplier_id = $${pIdx++}`);
      params.push(Number(supplier_id));
    }

    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(`h.status = $${pIdx++}`);
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        conditions.push(`h.status = ANY($${pIdx++}::text[])`);
        params.push(statuses);
      }
    }

    if (date_from) {
      conditions.push(`h.received_date >= $${pIdx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`h.received_date <= $${pIdx++}`);
      params.push(date_to);
    }

    const q = String(search || '').trim();
    if (q) {
      conditions.push(`(
        h.delivery_ref ILIKE $${pIdx}
        OR h.restock_ref ILIKE $${pIdx}
        OR s.supplier_name ILIKE $${pIdx}
      )`);
      params.push(`%${q}%`);
      pIdx++;
    }

    if (product_id && Number.isFinite(Number(product_id))) {
      conditions.push(`EXISTS (
        SELECT 1 FROM restock_lines rl
        WHERE rl.restock_id = h.restock_id AND rl.product_id = $${pIdx}
      )`);
      params.push(Number(product_id));
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         h.restock_id, h.restock_ref, h.delivery_ref, h.received_date, h.notes, h.created_at,
         h.branch_id, h.supplier_id, h.recorded_by, h.status,
         h.submitted_at, h.approved_at, h.posted_at, h.decision_remarks,
         b.name AS branch_name,
         s.supplier_name,
         rec.full_name AS recorded_by_name,
         COALESCE(agg.line_count, 0)::int AS line_count,
         COALESCE(agg.total_quantity, 0)::int AS quantity,
         COALESCE(agg.total_quantity, 0)::int AS total_quantity,
         CASE
           WHEN COALESCE(agg.line_count, 0) <= 1 THEN agg.first_product_name
           ELSE agg.first_product_name || ' +' || (agg.line_count - 1)::text || ' more'
         END AS product_name,
         CASE WHEN COALESCE(agg.line_count, 0) = 1 THEN agg.first_sku ELSE NULL END AS sku
       FROM restock_headers h
       JOIN branches b ON b.id = h.branch_id
       JOIN suppliers s ON s.suppliers_id = h.supplier_id
       LEFT JOIN users rec ON rec.id = h.recorded_by
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS line_count,
           COALESCE(SUM(l.quantity), 0)::int AS total_quantity,
           (ARRAY_AGG(p.name ORDER BY p.name))[1] AS first_product_name,
           (ARRAY_AGG(p.sku ORDER BY p.name))[1] AS first_sku
         FROM restock_lines l
         JOIN products p ON p.id = l.product_id
         WHERE l.restock_id = h.restock_id
       ) agg ON TRUE
       ${where}
       ORDER BY h.received_date DESC, h.restock_id DESC`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
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
         COALESCE(pending.reserved, 0)::int AS pending_outbound,
         GREATEST(0, bi.available_stock - COALESCE(pending.reserved, 0))::int AS available_to_transfer,
         bi.reorder_level,
         bi.stock_status,
         bi.created_at,
         bi.updated_at
       FROM branch_inventory bi
       JOIN branches b          ON b.id               = bi.branch_id
       JOIN products p          ON p.id               = bi.product_id
       LEFT JOIN product_categories pc ON pc.category_id = p.category_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(qty), 0)::int AS reserved
         FROM (
           SELECT l.quantity AS qty
           FROM inventory_transfer_lines l
           JOIN inventory_transfers t ON t.transfer_id = l.transfer_id
           WHERE t.source_branch_id = bi.branch_id
             AND l.product_id = bi.product_id
             AND t.status IN ('Pending Approval', 'Submitted', 'Approved')
           UNION ALL
           SELECT t.quantity AS qty
           FROM inventory_transfers t
           WHERE t.source_branch_id = bi.branch_id
             AND t.product_id = bi.product_id
             AND t.status IN ('Pending Approval', 'Submitted', 'Approved')
             AND t.quantity IS NOT NULL AND t.quantity > 0
             AND NOT EXISTS (
               SELECT 1 FROM inventory_transfer_lines l2 WHERE l2.transfer_id = t.transfer_id
             )
         ) reserved_rows
       ) pending ON TRUE
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
    p.unit_type,
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

function buildMovementFilter({ user, query }) {
  const { type, branch_id, date_from, date_to } = query;
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

  if (date_from) {
    conditions.push(`sm.movement_date >= $${pIdx++}`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`sm.movement_date <= $${pIdx++}`);
    params.push(date_to);
  }

  return {
    scopeBranchId,
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/movements
// Query: type, product_id, branch_id, date_from, date_to, search, flat=1
// Default: grouped by source transaction (restock / transfer / stock count / sale).
// ──────────────────────────────────────────────────────────────────────────────
router.get('/movements', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const flat = String(req.query.flat || '') === '1';
    const { scopeBranchId, where, params } = buildMovementFilter({ user, query: req.query });

    const result = await pool.query(
      `${STOCK_MOVEMENT_SELECT}
       ${where}
       ORDER BY sm.movement_date DESC, sm.created_at DESC, sm.id DESC`,
      params
    );

    if (flat) {
      // Optional product/search filter for flat mode (product detail timelines).
      let rows = result.rows;
      const productId = req.query.product_id ? Number(req.query.product_id) : null;
      const q = String(req.query.search || '').trim().toLowerCase();
      if (Number.isFinite(productId)) {
        rows = rows.filter((r) => Number(r.product_id) === productId);
      }
      if (q) {
        rows = rows.filter((r) => (
          String(r.product_name || '').toLowerCase().includes(q)
          || String(r.sku || '').toLowerCase().includes(q)
          || String(r.movement_ref || '').toLowerCase().includes(q)
        ));
      }
      return res.status(200).json({
        success: true,
        data: rows,
        count: rows.length,
        grouped: false,
        scoped_branch_id: scopeBranchId,
      });
    }

    const groups = selectMatchingGroups(result.rows, {
      search: req.query.search,
      productId: req.query.product_id,
    });

    return res.status(200).json({
      success: true,
      data: groups,
      count: groups.length,
      grouped: true,
      scoped_branch_id: scopeBranchId,
    });
  } catch (err) {
    console.error('[Inventory] GET /movements error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stock movements.' });
  }
});

async function loadMovementGroupSiblings(pool, seedRow, scopeBranchId) {
  const parsed = parseMovementDocument(seedRow);
  const conditions = ['sm.branch_id = $1'];
  const params = [scopeBranchId != null ? scopeBranchId : seedRow.branch_id];
  let pIdx = 2;

  if (parsed.kind === 'restock') {
    // MOV-RST-…-productId, exact RST-…, or MOV-{document_ref}-%
    conditions.push(`(
      sm.movement_ref = $${pIdx}
      OR sm.movement_ref ILIKE $${pIdx + 1}
      OR sm.movement_ref ILIKE $${pIdx + 2}
    )`);
    params.push(
      parsed.document_ref,
      `MOV-${parsed.document_ref}-%`,
      `${parsed.document_ref}-%`
    );
    pIdx += 3;
  } else if (parsed.kind === 'transfer') {
    conditions.push(`(
      sm.movement_ref ILIKE $${pIdx}
      OR sm.movement_ref ILIKE $${pIdx + 1}
    )`);
    params.push(
      `MOV-${parsed.document_ref}-${parsed.direction}-%`,
      `MOV-${parsed.document_ref}-${parsed.direction}`
    );
    pIdx += 2;
  } else if (parsed.kind === 'stock_count') {
    conditions.push(`(sm.movement_ref = $${pIdx} OR sm.movement_ref ILIKE $${pIdx + 1})`);
    params.push(parsed.document_ref, `MOV-${parsed.document_ref}-%`);
    pIdx += 2;
  } else if (parsed.kind === 'sale' || parsed.kind === 'sale_reversal') {
    conditions.push(`sm.movement_ref ILIKE $${pIdx++}`);
    params.push(`${parsed.document_ref}-%`);
  } else {
    conditions.push(`sm.id = $${pIdx++}`);
    params.push(seedRow.movement_id);
  }

  const result = await pool.query(
    `${STOCK_MOVEMENT_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.name, sm.id`,
    params
  );
  return { parsed, lines: result.rows };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/movements/:id
// Returns the transaction group for the movement (siblings + related document).
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
    let scopeBranchId = null;

    if (!isUnscoped(user)) {
      branchClause = ' AND sm.branch_id = $2';
      params.push(user.branchId);
      scopeBranchId = user.branchId;
    }

    const result = await pool.query(
      `${STOCK_MOVEMENT_SELECT}
       WHERE sm.id = $1${branchClause}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movement not found.' });
    }

    const row = result.rows[0];
    if (scopeBranchId == null) scopeBranchId = row.branch_id;

    const { parsed, lines } = await loadMovementGroupSiblings(pool, row, scopeBranchId);
    const unitTypes = [...new Set(lines.map((l) => String(l.unit_type || 'Unit').trim() || 'Unit'))];
    const totalQuantity = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
    const mixedUnits = unitTypes.length > 1;
    const related = await resolveMovementRelatedDocument(pool, row, { includeDetails: true });

    return res.status(200).json({
      success: true,
      data: {
        group_key: parsed.group_key,
        kind: parsed.kind,
        document_ref: parsed.document_ref,
        direction: parsed.direction || null,
        type: parsed.display_type || row.type,
        movement_date: row.movement_date,
        created_at: row.created_at,
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        performed_by: row.performed_by,
        performed_by_name: row.performed_by_name,
        representative_movement_id: row.movement_id,
        product_count: lines.length,
        total_quantity: totalQuantity,
        mixed_units: mixedUnits,
        unit_type: mixedUnits ? null : unitTypes[0],
        unit_types: unitTypes,
        lines,
        related_document: related,
        // Backward-compatible single-line fields (first / seed row)
        movement_id: row.movement_id,
        movement_ref: row.movement_ref,
        product_id: row.product_id,
        product_name: row.product_name,
        sku: row.sku,
        quantity: row.quantity,
      },
    });
  } catch (err) {
    console.error('[Inventory] GET /movements/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stock movement.' });
  }
});

/** Link movement_ref patterns back to restock/transfer/stock-count documents when possible. */
async function resolveMovementRelatedDocument(pool, movement, { includeDetails = false } = {}) {
  const parsed = parseMovementDocument(movement);
  const ref = String(movement?.movement_ref || '');
  const type = String(movement?.type || '');

  if (parsed.kind === 'restock' || type === 'Restock') {
    const restockRef = parsed.document_ref;
    if (restockRef) {
      const found = await pool.query(
        `SELECT
           h.restock_id, h.restock_ref, h.delivery_ref, h.received_date, h.notes, h.created_at,
           h.supplier_id, s.supplier_name,
           h.recorded_by, u.full_name AS recorded_by_name,
           h.branch_id, b.name AS branch_name
         FROM restock_headers h
         LEFT JOIN suppliers s ON s.suppliers_id = h.supplier_id
         LEFT JOIN users u ON u.id = h.recorded_by
         LEFT JOIN branches b ON b.id = h.branch_id
         WHERE h.restock_ref = $1
         LIMIT 1`,
        [restockRef]
      );
      if (found.rows[0]) {
        const header = found.rows[0];
        let lines = [];
        if (includeDetails) {
          const lineRes = await pool.query(
            `SELECT
               l.line_id, l.product_id, l.quantity,
               p.name AS product_name, p.sku, p.unit_type
             FROM restock_lines l
             JOIN products p ON p.id = l.product_id
             WHERE l.restock_id = $1
             ORDER BY p.name`,
            [header.restock_id]
          );
          lines = lineRes.rows;
        }
        return {
          kind: 'restock',
          id: header.restock_id,
          ref: header.restock_ref,
          status: 'Completed',
          supplier_name: header.supplier_name,
          delivery_ref: header.delivery_ref,
          received_date: header.received_date,
          notes: header.notes,
          recorded_by_name: header.recorded_by_name,
          branch_name: header.branch_name,
          lines,
        };
      }
    }
  }

  if (parsed.kind === 'transfer' || type === 'Transfer In' || type === 'Transfer Out') {
    const transferRef = parsed.document_ref;
    if (transferRef) {
      const found = await pool.query(
        `SELECT
           t.transfer_id, t.transfer_ref, t.status, t.notes, t.submitted_date, t.completed_date,
           t.source_branch_id, sb.name AS source_branch,
           t.destination_branch_id, db.name AS destination_branch,
           t.submitted_by, su.full_name AS submitted_by_name,
           t.approved_by, au.full_name AS approved_by_name
         FROM inventory_transfers t
         JOIN branches sb ON sb.id = t.source_branch_id
         JOIN branches db ON db.id = t.destination_branch_id
         LEFT JOIN users su ON su.id = t.submitted_by
         LEFT JOIN users au ON au.id = t.approved_by
         WHERE t.transfer_ref = $1
         LIMIT 1`,
        [transferRef]
      );
      if (found.rows[0]) {
        const header = found.rows[0];
        let lines = [];
        if (includeDetails) {
          lines = await loadTransferLines(pool, header.transfer_id);
        }
        return {
          kind: 'transfer',
          id: header.transfer_id,
          ref: header.transfer_ref,
          status: header.status,
          notes: header.notes,
          submitted_date: header.submitted_date,
          completed_date: header.completed_date,
          source_branch: header.source_branch,
          destination_branch: header.destination_branch,
          source_branch_id: header.source_branch_id,
          destination_branch_id: header.destination_branch_id,
          submitted_by_name: header.submitted_by_name,
          approved_by_name: header.approved_by_name,
          direction: parsed.direction || null,
          lines,
        };
      }
    }
  }

  if (parsed.kind === 'stock_count' || type === 'Stock Count Adjustment') {
    const countRef = parsed.document_ref;
    if (countRef) {
      const found = await pool.query(
        `SELECT
           h.count_id, h.count_ref, h.status, h.notes, h.created_at,
           h.branch_id, b.name AS branch_name,
           h.counted_by, u.full_name AS counted_by_name
         FROM stock_count_headers h
         JOIN branches b ON b.id = h.branch_id
         LEFT JOIN users u ON u.id = h.counted_by
         WHERE h.count_ref = $1
         LIMIT 1`,
        [countRef]
      );
      if (found.rows[0]) {
        const header = found.rows[0];
        let lines = [];
        if (includeDetails) {
          const lineRes = await pool.query(
            `SELECT
               l.line_id, l.product_id, l.system_quantity, l.physical_quantity, l.variance, l.notes,
               p.name AS product_name, p.sku, p.unit_type
             FROM stock_count_lines l
             JOIN products p ON p.id = l.product_id
             WHERE l.count_id = $1
             ORDER BY p.name`,
            [header.count_id]
          );
          lines = lineRes.rows;
        }
        return {
          kind: 'stock_count',
          id: header.count_id,
          ref: header.count_ref,
          status: header.status,
          notes: header.notes,
          created_at: header.created_at,
          branch_name: header.branch_name,
          counted_by_name: header.counted_by_name,
          lines,
        };
      }
    }
  }

  if ((type === 'Sale Deduction' || type === 'Sale Reversal') && ref) {
    return {
      kind: parsed.kind === 'sale_reversal' ? 'sale_reversal' : 'sale_ref',
      id: null,
      ref: parsed.document_ref || ref,
      status: null,
    };
  }

  return null;
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

// GET /api/inventory/dashboard — warehouse staff action queues + recent docs
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const branchId = user.branchId;
    if (branchId == null) {
      return res.status(403).json({ success: false, message: 'No branch assigned.' });
    }

    const needsRestockStatuses = ['Out of Stock', 'Critical Stock', 'Low Stock'];

    const [transferCounts, needsRestock, lowStockSignal, recentTransfers, recentRestocks] =
      await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (
               WHERE status = 'Approved' AND source_branch_id = $1
             )::int AS ready_to_ship,
             COUNT(*) FILTER (
               WHERE status IN ('Pending Approval', 'Submitted') AND source_branch_id = $1
             )::int AS awaiting_approval,
             COUNT(*) FILTER (
               WHERE status = 'Shipped'
                 AND destination_branch_id = $1
                 AND source_branch_id IS DISTINCT FROM $1
             )::int AS incoming
           FROM inventory_transfers
           WHERE source_branch_id = $1 OR destination_branch_id = $1`,
          [branchId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM branch_inventory
           WHERE branch_id = $1
             AND stock_status = ANY($2::text[])`,
          [branchId, needsRestockStatuses]
        ),
        pool.query(
          `SELECT
             p.id AS product_id,
             p.name AS product_name,
             p.sku,
             bi.available_stock,
             bi.reorder_level,
             bi.stock_status
           FROM branch_inventory bi
           JOIN products p ON p.id = bi.product_id
           WHERE bi.branch_id = $1
             AND bi.stock_status = ANY($2::text[])
           ORDER BY
             CASE bi.stock_status
               WHEN 'Out of Stock' THEN 0
               WHEN 'Critical Stock' THEN 1
               WHEN 'Low Stock' THEN 2
               ELSE 3
             END,
             bi.available_stock ASC,
             p.name ASC
           LIMIT 10`,
          [branchId, needsRestockStatuses]
        ),
        pool.query(
          `SELECT
             it.transfer_id,
             it.transfer_ref,
             it.status,
             sb.name AS source_branch,
             db.name AS destination_branch,
             COALESCE(agg.total_quantity, it.quantity, 0)::int AS total_quantity,
             COALESCE(agg.line_count, 0)::int AS line_count,
             CASE
               WHEN COALESCE(agg.line_count, 0) <= 1 THEN agg.first_product_name
               ELSE agg.first_product_name || ' +' || (agg.line_count - 1)::text || ' more'
             END AS product_name
           FROM inventory_transfers it
           JOIN branches sb ON sb.id = it.source_branch_id
           JOIN branches db ON db.id = it.destination_branch_id
           LEFT JOIN LATERAL (
             SELECT
               COUNT(*)::int AS line_count,
               COALESCE(SUM(l.quantity), 0)::int AS total_quantity,
               (ARRAY_AGG(p.name ORDER BY p.name))[1] AS first_product_name
             FROM inventory_transfer_lines l
             JOIN products p ON p.id = l.product_id
             WHERE l.transfer_id = it.transfer_id
           ) agg ON TRUE
           WHERE it.source_branch_id = $1 OR it.destination_branch_id = $1
           ORDER BY it.created_at DESC
           LIMIT 5`,
          [branchId]
        ),
        pool.query(
          `SELECT
             h.restock_id,
             h.restock_ref,
             h.delivery_ref,
             s.supplier_name,
             COALESCE(agg.total_quantity, 0)::int AS quantity,
             h.received_date,
             CASE
               WHEN COALESCE(agg.line_count, 0) <= 1 THEN agg.first_product_name
               ELSE agg.first_product_name || ' +' || (agg.line_count - 1)::text || ' more'
             END AS product_name
           FROM restock_headers h
           JOIN suppliers s ON s.suppliers_id = h.supplier_id
           LEFT JOIN LATERAL (
             SELECT
               COUNT(*)::int AS line_count,
               COALESCE(SUM(l.quantity), 0)::int AS total_quantity,
               (ARRAY_AGG(p.name ORDER BY p.name))[1] AS first_product_name
             FROM restock_lines l
             JOIN products p ON p.id = l.product_id
             WHERE l.restock_id = h.restock_id
           ) agg ON TRUE
           WHERE h.branch_id = $1
           ORDER BY h.received_date DESC, h.restock_id DESC
           LIMIT 5`,
          [branchId]
        ),
      ]);

    const counts = transferCounts.rows[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        summary: {
          readyToShip: counts.ready_to_ship || 0,
          awaitingApproval: counts.awaiting_approval || 0,
          incoming: counts.incoming || 0,
          needsRestock: needsRestock.rows[0]?.count || 0,
        },
        lowStockSignal: lowStockSignal.rows,
        recentTransfers: recentTransfers.rows,
        recentRestocks: recentRestocks.rows,
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
      branchSql = ' AND h.branch_id = $2';
      params.push(user.branchId);
    }
    const result = await pool.query(
      `SELECT h.restock_id, h.restock_ref, h.delivery_ref, h.received_date, h.notes, h.created_at,
              h.branch_id, h.supplier_id, h.recorded_by, h.status,
              h.submitted_by, h.submitted_at, h.approved_by, h.approved_at,
              h.decision_remarks, h.posted_by, h.posted_at,
              b.name AS branch_name, s.supplier_name, s.suppliers_id,
              rec.full_name AS recorded_by_name,
              sub.full_name AS submitted_by_name,
              appr.full_name AS approved_by_name
       FROM restock_headers h
       JOIN branches b ON b.id = h.branch_id
       JOIN suppliers s ON s.suppliers_id = h.supplier_id
       LEFT JOIN users rec ON rec.id = h.recorded_by
       LEFT JOIN users sub ON sub.id = h.submitted_by
       LEFT JOIN users appr ON appr.id = h.approved_by
       WHERE h.restock_id = $1${branchSql}`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Restock not found.' });
    }
    const lines = await loadRestockLines(pool, restockId);
    const summary = summarizeLines(lines);
    return res.status(200).json({
      success: true,
      data: {
        ...result.rows[0],
        ...summary,
        lines,
        product_id: lines[0]?.product_id || null,
      },
    });
  } catch (err) {
    console.error('[Inventory] GET /restocks/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch restock.' });
  }
});

// POST /api/inventory/restocks — create Draft (or submit immediately). Does NOT post stock.
router.post('/restocks', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const supplierId = Number(req.body.supplier_id);
  const receivedDate = req.body.received_date || manilaToday();
  const notes = String(req.body.notes || '').trim();
  const submitNow = Boolean(req.body.submit);
  const supplierPaper = String(
    req.body.supplier_delivery_note
    ?? req.body.supplier_paper_ref
    ?? ''
  ).trim();
  const lines = parseDocumentLines(req.body);

  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  if (!Number.isFinite(supplierId)) {
    return res.status(400).json({ success: false, message: 'Supplier is required.' });
  }
  if (!lines.length) {
    return res.status(400).json({ success: false, message: 'Add at least one product line.' });
  }
  if (!receivedDate) {
    return res.status(400).json({ success: false, message: 'Date received is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const supplier = await client.query(
      `SELECT suppliers_id FROM suppliers
       WHERE suppliers_id = $1 AND COALESCE(status, 'Active') = 'Active'`,
      [supplierId]
    );
    if (!supplier.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Supplier not found or inactive.' });
    }

    for (const line of lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Each line quantity must be a positive number.' });
      }
      const product = await client.query(
        `SELECT id FROM products WHERE id = $1 AND COALESCE(status, 'Active') = 'Active'`,
        [line.product_id]
      );
      if (!product.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: `Product ${line.product_id} not found or inactive.` });
      }
    }

    const restockRef = await nextRestockRef(client);
    const deliveryRef = await nextDeliveryRef(client);
    const combinedNotes = supplierPaper
      ? (notes ? `Supplier delivery: ${supplierPaper}\n${notes}` : `Supplier delivery: ${supplierPaper}`)
      : (notes || null);
    const status = submitNow ? 'Pending Approval' : 'Draft';

    const header = await client.query(
      `INSERT INTO restock_headers (
         restock_ref, branch_id, supplier_id, delivery_ref, received_date, recorded_by, notes,
         status, submitted_by, submitted_at
       ) VALUES (
         $1, $2, $3, $4, $5::date, $6, $7,
         $8, $9, CASE WHEN $8 = 'Pending Approval' THEN CURRENT_TIMESTAMP ELSE NULL END
       )
       RETURNING restock_id, restock_ref, delivery_ref, status`,
      [
        restockRef,
        branchId,
        supplierId,
        deliveryRef,
        receivedDate,
        user.id,
        combinedNotes,
        status,
        submitNow ? user.id : null,
      ]
    );
    const restockId = header.rows[0].restock_id;

    for (const line of lines) {
      await client.query(
        `INSERT INTO restock_lines (restock_id, product_id, quantity) VALUES ($1, $2, $3)`,
        [restockId, line.product_id, line.quantity]
      );
    }

    await client.query('COMMIT');
    const loadedLines = await loadRestockLines(pool, restockId);
    const summary = summarizeLines(loadedLines);

    if (submitNow) {
      const submitterMeta = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
        [user.id]
      );
      await notifyRestockSubmitted(pool, {
        branchId,
        restockRef,
        deliveryRef,
        lineCount: summary.line_count,
        totalQuantity: summary.total_quantity,
        submitterName: submitterMeta.rows[0]?.display_name || 'Warehouse staff',
      });
    }

    await logWarehouseAudit(
      pool,
      user.id,
      submitNow ? 'Restock submitted' : 'Restock draft saved',
      `${restockRef} / ${deliveryRef}: ${summary.line_count} product(s), +${summary.total_quantity} units (${status})`,
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: submitNow
        ? 'Restock submitted for branch manager approval. Stock will post after approval.'
        : 'Restock draft saved. Submit for approval when ready — stock is unchanged until approved.',
      data: {
        ...header.rows[0],
        ...summary,
        lines: loadedLines,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /restocks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save restock.' });
  } finally {
    client.release();
  }
});

// POST /api/inventory/restocks/:id/submit — Draft → Pending Approval
router.post('/restocks/:id/submit', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const restockId = Number(req.params.id);
  if (!Number.isFinite(restockId)) {
    return res.status(400).json({ success: false, message: 'Invalid restock ID.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM restock_headers WHERE restock_id = $1 FOR UPDATE`,
      [restockId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Restock not found.' });
    }
    const row = existing.rows[0];
    if (!isUnscoped(user) && Number(row.branch_id) !== Number(user.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Restock is outside your branch.' });
    }
    if (row.status !== 'Draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot submit restock in status ${row.status}.`,
      });
    }

    const updated = await client.query(
      `UPDATE restock_headers
       SET status = 'Pending Approval',
           submitted_by = $1,
           submitted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE restock_id = $2
       RETURNING *`,
      [user.id, restockId]
    );
    await client.query('COMMIT');

    const loadedLines = await loadRestockLines(pool, restockId);
    const summary = summarizeLines(loadedLines);
    const submitterMeta = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    );
    await notifyRestockSubmitted(pool, {
      branchId: row.branch_id,
      restockRef: row.restock_ref,
      deliveryRef: row.delivery_ref,
      lineCount: summary.line_count,
      totalQuantity: summary.total_quantity,
      submitterName: submitterMeta.rows[0]?.display_name || 'Warehouse staff',
    });
    await logWarehouseAudit(pool, user.id, 'Restock submitted', row.restock_ref, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Restock submitted for approval.',
      data: { ...updated.rows[0], ...summary, lines: loadedLines },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /restocks/:id/submit error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit restock.' });
  } finally {
    client.release();
  }
});

function parseStockCountLines(body) {
  const raw = Array.isArray(body?.lines) ? body.lines : null;
  if (raw?.length) {
    const map = new Map();
    for (const row of raw) {
      const productId = Number(row.product_id ?? row.productId);
      const physical = Number(row.physical_count ?? row.physical_quantity ?? row.quantity);
      const expectedSystem = row.expected_system_quantity != null
        ? Number(row.expected_system_quantity)
        : (row.system_quantity != null ? Number(row.system_quantity) : null);
      const lineNotes = String(row.notes || '').trim();
      if (!Number.isFinite(productId) || productId <= 0) continue;
      if (!Number.isFinite(physical) || physical < 0) continue;
      map.set(productId, {
        product_id: productId,
        physical_quantity: physical,
        expected_system_quantity: Number.isFinite(expectedSystem) ? expectedSystem : null,
        notes: lineNotes,
      });
    }
    return [...map.values()];
  }
  // Legacy single-product body
  const productId = Number(body?.product_id);
  const physical = Number(body?.physical_count);
  if (Number.isFinite(productId) && productId > 0 && Number.isFinite(physical) && physical >= 0) {
    return [{
      product_id: productId,
      physical_quantity: physical,
      expected_system_quantity: body.expected_system_quantity != null
        ? Number(body.expected_system_quantity)
        : null,
      notes: String(body.notes || '').trim(),
    }];
  }
  return [];
}

// GET /api/inventory/stock-counts
router.get('/stock-counts', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const params = [];
    const conditions = [];
    if (!isUnscoped(user)) {
      if (user.branchId == null) {
        return res.status(403).json({ success: false, message: 'No branch assigned.' });
      }
      params.push(user.branchId);
      conditions.push(`h.branch_id = $${params.length}`);
    }
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        params.push(statuses[0]);
        conditions.push(`h.status = $${params.length}`);
      } else if (statuses.length > 1) {
        params.push(statuses);
        conditions.push(`h.status = ANY($${params.length}::text[])`);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT
         h.count_id,
         h.count_ref,
         h.branch_id,
         b.name AS branch_name,
         h.counted_by,
         u.full_name AS counted_by_name,
         h.notes,
         h.status,
         h.decision_remarks,
         h.approved_at,
         h.created_at,
         COALESCE(agg.line_count, 0)::int AS line_count,
         COALESCE(agg.discrepancy_count, 0)::int AS discrepancy_count
       FROM stock_count_headers h
       JOIN branches b ON b.id = h.branch_id
       LEFT JOIN users u ON u.id = h.counted_by
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS line_count,
           COUNT(*) FILTER (WHERE l.variance <> 0)::int AS discrepancy_count
         FROM stock_count_lines l
         WHERE l.count_id = h.count_id
       ) agg ON TRUE
       ${where}
       ORDER BY h.created_at DESC, h.count_id DESC
       LIMIT 200`,
      params
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Inventory] GET /stock-counts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stock counts.' });
  }
});

// GET /api/inventory/stock-counts/:id
router.get('/stock-counts/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const countId = Number(req.params.id);
    const params = [countId];
    let branchSql = '';
    if (!isUnscoped(user)) {
      branchSql = ' AND h.branch_id = $2';
      params.push(user.branchId);
    }
    const header = await pool.query(
      `SELECT
         h.count_id, h.count_ref, h.branch_id, h.counted_by, h.notes, h.status, h.created_at,
         h.approved_by, h.approved_at, h.decision_remarks,
         b.name AS branch_name, u.full_name AS counted_by_name,
         appr.full_name AS approved_by_name
       FROM stock_count_headers h
       JOIN branches b ON b.id = h.branch_id
       LEFT JOIN users u ON u.id = h.counted_by
       LEFT JOIN users appr ON appr.id = h.approved_by
       WHERE h.count_id = $1${branchSql}`,
      params
    );
    if (!header.rows.length) {
      return res.status(404).json({ success: false, message: 'Stock count not found.' });
    }
    const lines = await pool.query(
      `SELECT
         l.line_id, l.product_id, l.system_quantity, l.physical_quantity, l.variance, l.notes,
         p.name AS product_name, p.sku
       FROM stock_count_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.count_id = $1
       ORDER BY p.name`,
      [countId]
    );
    const discrepancyCount = lines.rows.filter((l) => Number(l.variance) !== 0).length;
    return res.status(200).json({
      success: true,
      data: {
        ...header.rows[0],
        line_count: lines.rows.length,
        discrepancy_count: discrepancyCount,
        lines: lines.rows,
      },
    });
  } catch (err) {
    console.error('[Inventory] GET /stock-counts/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stock count.' });
  }
});

// POST /api/inventory/stock-counts — multi-product session (legacy single SKU still accepted)
router.post('/stock-counts', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const sessionNotes = String(req.body.notes || '').trim();
  const lines = parseStockCountLines(req.body);

  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  if (!lines.length) {
    return res.status(400).json({ success: false, message: 'Add at least one product to count.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prepared = [];
    for (const line of lines) {
      const row = await client.query(
        `SELECT available_stock, reorder_level
         FROM branch_inventory
         WHERE branch_id = $1 AND product_id = $2
         FOR UPDATE`,
        [branchId, line.product_id]
      );
      const liveSystem = row.rows[0] ? Number(row.rows[0].available_stock) : 0;
      if (
        line.expected_system_quantity != null
        && Number(line.expected_system_quantity) !== liveSystem
      ) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Stock for product ${line.product_id} changed during counting (was ${line.expected_system_quantity}, now ${liveSystem}). Refresh quantities and try again.`,
          data: {
            product_id: line.product_id,
            expected_system_quantity: line.expected_system_quantity,
            live_system_quantity: liveSystem,
          },
        });
      }
      const variance = line.physical_quantity - liveSystem;
      if (variance !== 0 && !line.notes && !sessionNotes) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Notes are required when any counted product has a variance.',
        });
      }
      prepared.push({
        ...line,
        system_quantity: liveSystem,
        variance,
        reorder_level: row.rows[0]?.reorder_level,
        line_notes: line.notes || sessionNotes || null,
      });
    }

    const discrepancyCount = prepared.filter((l) => l.variance !== 0).length;
    const needsApproval = discrepancyCount > 0;
    const status = needsApproval ? 'Pending Approval' : 'Completed';
    const countRef = await nextStockCountRef(client);
    const header = await client.query(
      `INSERT INTO stock_count_headers (count_ref, branch_id, counted_by, notes, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [countRef, branchId, user.id, sessionNotes || null, status]
    );
    const countId = header.rows[0].count_id;

    for (const line of prepared) {
      await client.query(
        `INSERT INTO stock_count_lines (
           count_id, product_id, system_quantity, physical_quantity, variance, notes
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [countId, line.product_id, line.system_quantity, line.physical_quantity, line.variance, line.line_notes]
      );
    }

    await client.query('COMMIT');

    if (needsApproval) {
      const submitterMeta = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
        [user.id]
      );
      const submitterName = submitterMeta.rows[0]?.display_name || 'Warehouse staff';
      await notifyStockCountSubmitted(pool, {
        branchId,
        countRef,
        discrepancyCount,
        submitterName,
      });
      try {
        const { upsertOpenOperationalAlert } = await import('../lib/operationalAlerts.js');
        await upsertOpenOperationalAlert(pool, {
          branchId,
          alertType: 'Inventory Stock Count Variance',
          severity: discrepancyCount >= 5 ? 'Critical' : 'Warning',
          title: `Stock count variance: ${countRef}`,
          message: `${submitterName} submitted ${countRef} with ${discrepancyCount} variance line(s). Review and decide in Approval Center.`,
          sourceKey: `stock_count:${countId}`,
          entityType: 'stock_count',
          entityId: countId,
          linkPath: 'approval-center',
        });
      } catch (alertErr) {
        console.error('[Inventory] stock count operational alert:', alertErr.message);
      }
    }

    await logWarehouseAudit(
      pool,
      user.id,
      needsApproval ? 'Stock count submitted' : 'Stock count completed',
      `${countRef}: ${prepared.length} product(s), ${discrepancyCount} discrepancy(ies) (${status})`,
      req.ip
    );

    const detailLines = await pool.query(
      `SELECT
         l.line_id, l.product_id, l.system_quantity, l.physical_quantity, l.variance, l.notes,
         p.name AS product_name, p.sku
       FROM stock_count_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.count_id = $1
       ORDER BY p.name`,
      [countId]
    );

    return res.status(201).json({
      success: true,
      message: needsApproval
        ? `Stock count ${countRef} submitted for approval. ${discrepancyCount} variance(s) will post after BM approval.`
        : `Stock count ${countRef} saved. No inventory adjustments needed.`,
      data: {
        ...header.rows[0],
        line_count: prepared.length,
        discrepancy_count: discrepancyCount,
        lines: detailLines.rows,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /stock-counts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit stock count.' });
  } finally {
    client.release();
  }
});

// POST /api/inventory/transfers — multi-line document (also accepts legacy single SKU)
router.post('/transfers', requireAuth, requireRole(INVENTORY_WRITER_ROLES), async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const branchId = user.branchId;
  const destinationBranchId = Number(req.body.destination_branch_id);
  const notes = String(req.body.notes || '').trim();
  const lines = parseDocumentLines(req.body);

  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }
  if (!Number.isFinite(destinationBranchId) || destinationBranchId === Number(branchId)) {
    return res.status(400).json({ success: false, message: 'Valid destination branch is required.' });
  }
  if (!lines.length) {
    return res.status(400).json({ success: false, message: 'Add at least one product line.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const line of lines) {
      const available = await getAvailableToTransfer(client, branchId, line.product_id);
      if (line.quantity > available) {
        const product = await client.query(`SELECT name FROM products WHERE id = $1`, [line.product_id]);
        const name = product.rows[0]?.name || `Product ${line.product_id}`;
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot transfer ${line.quantity} of ${name}. Available to transfer: ${available}.`,
        });
      }
    }

    const transferRef = await nextTransferRef(client);
    const first = lines[0];
    const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
    const header = await client.query(
      `INSERT INTO inventory_transfers (
         transfer_ref, product_id, quantity, source_branch_id, destination_branch_id,
         status, submitted_by, notes, submitted_date
       ) VALUES ($1, $2, $3, $4, $5, 'Pending Approval', $6, $7, $8::date)
       RETURNING transfer_id, transfer_ref, status`,
      [transferRef, first.product_id, totalQty, branchId, destinationBranchId, user.id, notes || null, manilaToday()]
    );
    const transferId = header.rows[0].transfer_id;

    for (const line of lines) {
      await client.query(
        `INSERT INTO inventory_transfer_lines (transfer_id, product_id, quantity)
         VALUES ($1, $2, $3)`,
        [transferId, line.product_id, line.quantity]
      );
    }

    await client.query('COMMIT');

    const loadedLines = await loadTransferLines(pool, transferId);
    const summary = summarizeLines(loadedLines);
    const submitterMeta = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    );

    await notifyTransferSubmitted(pool, {
      sourceBranchId: branchId,
      transferRef,
      productName: summary.product_name,
      quantity: summary.total_quantity,
      lineCount: summary.line_count,
      submitterName: submitterMeta.rows[0]?.display_name || 'Warehouse staff',
    });

    await logWarehouseAudit(
      pool,
      user.id,
      'Transfer submitted',
      `${transferRef} ${summary.line_count} product(s), ${summary.total_quantity} units`,
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: 'Transfer submitted for branch manager approval.',
      data: {
        ...header.rows[0],
        ...summary,
        lines: loadedLines,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Inventory] POST /transfers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create transfer.' });
  } finally {
    client.release();
  }
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
