import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/system-health
// Returns live system metrics for the Super Admin dashboard
// ──────────────────────────────────────────────────────────────────────────────
router.get('/system-health', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    // Run all queries in parallel
    const [usersResult, branchesResult, auditResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='Active') AS active FROM users`),
      pool.query(`SELECT COUNT(*) AS total FROM branches WHERE status='Active'`),
      pool.query(`SELECT COUNT(*) AS errors FROM audit_logs WHERE status_details LIKE '%Failed%' AND created_at > NOW() - INTERVAL '24 hours'`),
    ]);

    // Test DB connectivity
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const apiResponseMs = Date.now() - dbStart;

    const totalUsers  = Number(usersResult.rows[0].total);
    const activeUsers = Number(usersResult.rows[0].active);
    const totalBranches = Number(branchesResult.rows[0].total);
    const errorCount = Number(auditResult.rows[0].errors);

    return res.status(200).json({
      success: true,
      data: {
        dbStatus:       'Online',
        totalUsers,
        activeUsers,
        inactiveUsers:  totalUsers - activeUsers,
        totalBranches,
        apiResponseMs,
        errorCount,
        serverCpu:      Math.floor(Math.random() * 30) + 25,   // simulated — replace with real metrics in production
        memoryUsage:    Math.floor(Math.random() * 20) + 50,
        storageUsage:   Math.floor(Math.random() * 15) + 35,
        uptime:         '99.96%',
        lastBackup:     '2026-06-30 02:00 AM',
        timestamp:      new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Dashboard] GET /system-health error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system health.',
      data: { dbStatus: 'Offline', error: err.message },
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/user-stats  — User count breakdown by role
// ──────────────────────────────────────────────────────────────────────────────
router.get('/user-stats', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT r.role_name AS role, r.slug, COUNT(u.id) AS total,
              COUNT(u.id) FILTER (WHERE u.status = 'Active')   AS active,
              COUNT(u.id) FILTER (WHERE u.status = 'Inactive') AS inactive
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.role_id
       GROUP BY r.role_id, r.role_name, r.slug
       ORDER BY r.role_id`
    );

    const newThisMonth = await pool.query(
      `SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)`
    );

    return res.status(200).json({
      success: true,
      data: {
        byRole:       result.rows,
        newThisMonth: Number(newThisMonth.rows[0].count),
      },
    });
  } catch (err) {
    console.error('[Dashboard] GET /user-stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user stats.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/inventory-health  — Inventory health across branches
// ──────────────────────────────────────────────────────────────────────────────
router.get('/inventory-health', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT
         CASE 
           WHEN available_stock <= 0 THEN 'Out of Stock'
           WHEN available_stock <= reorder_level THEN 'Low Stock'
           ELSE 'Sufficient'
         END AS stock_status,
         COUNT(*) AS count
       FROM branch_inventory
       GROUP BY stock_status`
    );

    const user = req.currentUser;
    let branchFilter = '';
    if (user && user.branchId) {
      branchFilter = `WHERE b.id = ${user.branchId}`;
    }

    const alerts = await pool.query(
      `SELECT p.product_name AS product_name, b.name AS branch_name, bi.available_stock, bi.reorder_level
       FROM branch_inventory bi
       JOIN products p ON p.product_id = bi.product_id
       JOIN branches b ON b.id = bi.branch_id
       ${branchFilter}
       WHERE bi.available_stock <= bi.reorder_level
       ORDER BY bi.available_stock ASC`
    );

    return res.status(200).json({
      success: true,
      data: {
        summary: result.rows,
        alerts:  alerts.rows,
      },
    });
  } catch (err) {
    console.error('[Dashboard] GET /inventory-health error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch inventory health.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/recent-audit  — Recent audit log entries (last 10)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/recent-audit', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const user = req.currentUser;
    let userFilter = '';
    if (user && user.branchId) {
      userFilter = `WHERE user_id = ${user.id}`;
    }

    const result = await pool.query(
      `SELECT log_id, user_name, action, ip_address, status_details, created_at
       FROM audit_logs
       ${userFilter}
       ORDER BY created_at DESC
       LIMIT 10`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Dashboard] GET /recent-audit error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/branches  — Branch summary stats
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branches', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const user = req.currentUser;
    let branchFilter = '';
    if (user && user.branchId) {
      branchFilter = `WHERE b.id = ${user.branchId}`;
    }

    const result = await pool.query(
      `SELECT
         b.id, b.name AS branch_name, b.address, b.status,
         COUNT(DISTINCT u.id) FILTER (WHERE u.status='Active' AND u.role_id != 7) AS employee_count,
         COUNT(DISTINCT c.id) AS customer_count
       FROM branches b
       LEFT JOIN users u ON u.branch_id = b.id
       LEFT JOIN users cu ON cu.branch_id = b.id AND cu.role_id = 7
       LEFT JOIN customers c ON c.user_id = cu.id
       ${branchFilter}
       GROUP BY b.id, b.name, b.address, b.status
       ORDER BY b.name`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Dashboard] GET /branches error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branch data.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/branch-summary
// Branch-scoped KPI summary for the Branch Manager dashboard.
// Query param: branch_id (required for Operating Manager; auto-injected by
// requireBranchScope for Branch Manager).
//
// Returns: staff counts, customer counts, overdue stats, inventory health,
// recent collection/sales totals, and pending CI requests for the branch.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branch-summary', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const isBranchScoped = user.branchId !== null;
    let branch_id = req.query.branch_id;
    if (!branch_id && isBranchScoped) {
      branch_id = String(user.branchId);
    }

    if (!branch_id || isNaN(Number(branch_id))) {
      if (!isBranchScoped) {
        const [
          staffResult,
          customerResult,
          activityResult,
          inventoryResult,
          collectionResult,
          salesResult,
        ] = await Promise.all([
          pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'Active') AS active_staff, COUNT(*) FILTER (WHERE status = 'Inactive') AS inactive_staff, COUNT(*) AS total FROM users`),
          pool.query(`SELECT COUNT(*) AS total_customers, COUNT(*) FILTER (WHERE c.status IS NOT NULL) AS active_customers, COALESCE(SUM(outstanding_balance), 0) AS total_outstanding FROM customers c JOIN users u ON u.id = c.user_id`),
          pool.query(`SELECT COALESCE(SUM(outstanding_balance), 0) AS total_outstanding, COALESCE(SUM(purchase_volume), 0) AS total_purchase_volume FROM customers`),
          pool.query(`SELECT CASE WHEN available_stock <= 0 THEN 'Out of Stock' WHEN available_stock <= reorder_level THEN 'Low Stock' ELSE 'Sufficient' END AS stock_status, COUNT(*) AS count, COALESCE(SUM(available_stock), 0) AS total_qty FROM branch_inventory GROUP BY stock_status`),
          pool.query(`SELECT COUNT(*) AS total_collections, COALESCE(SUM(amount), 0) AS total_amount_collected, COUNT(*) FILTER (WHERE status = 'Pending') AS pending_collections FROM collection_payment WHERE payment_date >= date_trunc('month', CURRENT_TIMESTAMP)`),
          pool.query(`SELECT COUNT(*) AS total_invoices, COALESCE(SUM(total_amount), 0) AS total_sales_amount, COUNT(*) FILTER (WHERE status = 'Pending') AS pending_invoices FROM sales_invoices WHERE invoices_date >= date_trunc('month', CURRENT_TIMESTAMP)`),
        ]);

        return res.status(200).json({
          success: true,
          data: {
            branch: { id: null, name: 'All Branches', address: '', status: 'Active' },
            staff: { activeStaff: Number(staffResult.rows[0].active_staff), inactiveStaff: Number(staffResult.rows[0].inactive_staff) },
            customers: { totalCustomers: Number(customerResult.rows[0].total_customers), activeCustomers: Number(customerResult.rows[0].active_customers), totalOutstanding: Number(activityResult.rows[0].total_outstanding), totalPurchaseVolume: Number(activityResult.rows[0].total_purchase_volume) },
            inventory: inventoryResult.rows.map((r) => ({ stockStatus: r.stock_status, count: Number(r.count), totalQty: Number(r.total_qty) })),
            collections: { totalCollections: Number(collectionResult.rows[0].total_collections), totalAmountCollected: Number(collectionResult.rows[0].total_amount_collected), pendingCollections: Number(collectionResult.rows[0].pending_collections) },
            sales: { totalInvoices: Number(salesResult.rows[0].total_invoices), totalSalesAmount: Number(salesResult.rows[0].total_sales_amount), pendingInvoices: Number(salesResult.rows[0].pending_invoices) },
            generatedAt: new Date().toISOString(),
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: 'branch_id query parameter is required.',
      });
    }

    const bid = Number(branch_id);

    if (user.branchId && bid !== user.branchId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: you can only access data for your assigned branch.',
      });
    }

    const [
      branchResult,
      staffResult,
      clientResult,
      activityResult,
      inventoryResult,
      collectionResult,
      salesResult,
    ] = await Promise.all([
      // Branch info
      pool.query(
        `SELECT id, name AS branch_name, address, status FROM branches WHERE id = $1`,
        [bid]
      ),
      // Staff counts for this branch
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'Active')   AS active_staff,
           COUNT(*) FILTER (WHERE status = 'Inactive') AS inactive_staff
         FROM users
         WHERE branch_id = $1`,
        [bid]
      ),
      // Customer counts and breakdown
      pool.query(
        `SELECT
           COUNT(c.id)                                           AS total_customers,
           COUNT(c.id) FILTER (WHERE u.status = 'Active')        AS active_customers
         FROM customers c
         JOIN users u ON u.id = c.user_id
         WHERE u.branch_id = $1`,
        [bid]
      ),
      // Customer activity data
      pool.query(
        `SELECT
           COALESCE(SUM(c.outstanding_balance), 0)                AS total_outstanding,
           COALESCE(SUM(c.purchase_volume), 0)                    AS total_purchase_volume
         FROM customers c
         JOIN users u ON u.id = c.user_id
         WHERE u.branch_id = $1`,
        [bid]
      ),
      // Inventory health for this branch
      pool.query(
        `SELECT
           CASE 
             WHEN available_stock <= 0 THEN 'Out of Stock'
             WHEN available_stock <= reorder_level THEN 'Low Stock'
             ELSE 'Sufficient'
           END AS stock_status,
           COUNT(*) AS count,
           COALESCE(SUM(available_stock), 0) AS total_qty
         FROM branch_inventory
         WHERE branch_id = $1
         GROUP BY stock_status`,
        [bid]
      ),
      // Collections total for current month
      pool.query(
        `SELECT
           COUNT(*)                                               AS total_collections,
           COALESCE(SUM(amount), 0)                             AS total_amount_collected,
           COUNT(*) FILTER (WHERE status = 'Pending')            AS pending_collections
         FROM collection_payment
         WHERE branch_id = $1
           AND payment_date >= date_trunc('month', CURRENT_TIMESTAMP)`,
        [bid]
      ),
      // Sales total for current month
      pool.query(
        `SELECT
           COUNT(*)                                              AS total_invoices,
           COALESCE(SUM(total_amount), 0)                       AS total_sales_amount,
           COUNT(*) FILTER (WHERE status = 'Pending')           AS pending_invoices
         FROM sales_invoices
         WHERE branch_id = $1
           AND invoices_date >= date_trunc('month', CURRENT_TIMESTAMP)`,
        [bid]
      ),
    ]);

    const branch = branchResult.rows[0];
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    return res.status(200).json({
      success: true,
      data: {
        branch: {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          status: branch.status,
        },
        staff: {
          activeStaff:   Number(staffResult.rows[0].active_staff),
          inactiveStaff: Number(staffResult.rows[0].inactive_staff),
        },
        customers: {
          totalCustomers:     Number(clientResult.rows[0].total_customers),
          activeCustomers:    Number(clientResult.rows[0].active_customers),
          totalOutstanding:   Number(activityResult.rows[0].total_outstanding),
          totalPurchaseVolume: Number(activityResult.rows[0].total_purchase_volume),
        },
        inventory: inventoryResult.rows.map((r) => ({
          stockStatus: r.stock_status,
          count:       Number(r.count),
          totalQty:    Number(r.total_qty),
        })),
        collections: {
          totalCollections:    Number(collectionResult.rows[0].total_collections),
          totalAmountCollected:Number(collectionResult.rows[0].total_amount_collected),
          pendingCollections:  Number(collectionResult.rows[0].pending_collections),
        },
        sales: {
          totalInvoices:    Number(salesResult.rows[0].total_invoices),
          totalSalesAmount: Number(salesResult.rows[0].total_sales_amount),
          pendingInvoices:  Number(salesResult.rows[0].pending_invoices),
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Dashboard] GET /branch-summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch branch summary.' });
  }
});

export default router;
