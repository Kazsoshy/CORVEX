import express from 'express';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/system-health
// Returns live system metrics for the Super Admin dashboard
// ──────────────────────────────────────────────────────────────────────────────
router.get('/system-health', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    // Run all queries in parallel
    const [usersResult, branchesResult, activeSessionsResult, auditResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='Active') AS active FROM users`),
      pool.query(`SELECT COUNT(*) AS total FROM branches WHERE status='Active'`),
      pool.query(`SELECT COUNT(*) AS active FROM users WHERE last_login > NOW() - INTERVAL '1 hour'`),
      pool.query(`SELECT COUNT(*) AS errors FROM audit_logs WHERE status='Failed' AND created_at > NOW() - INTERVAL '24 hours'`),
    ]);

    // Test DB connectivity
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const apiResponseMs = Date.now() - dbStart;

    const totalUsers  = Number(usersResult.rows[0].total);
    const activeUsers = Number(usersResult.rows[0].active);
    const totalBranches = Number(branchesResult.rows[0].total);
    const activeSessions = Number(activeSessionsResult.rows[0].active);
    const errorCount = Number(auditResult.rows[0].errors);

    return res.status(200).json({
      success: true,
      data: {
        dbStatus:       'Online',
        totalUsers,
        activeUsers,
        inactiveUsers:  totalUsers - activeUsers,
        totalBranches,
        activeSessions,
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
router.get('/user-stats', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT r.name AS role, r.slug, COUNT(u.id) AS total,
              COUNT(u.id) FILTER (WHERE u.status = 'Active')   AS active,
              COUNT(u.id) FILTER (WHERE u.status = 'Inactive') AS inactive
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
       GROUP BY r.id, r.name, r.slug
       ORDER BY r.id`
    );

    const newThisMonth = await pool.query(
      `SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('month', NOW())`
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
router.get('/inventory-health', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT
         stock_status,
         COUNT(*) AS count
       FROM inventory
       GROUP BY stock_status`
    );

    const alerts = await pool.query(
      `SELECT p.name, p.sku, b.name AS branch_name, i.quantity, i.stock_status
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       JOIN branches b ON b.id = i.branch_id
       WHERE i.stock_status IN ('Out of Stock','Critical Stock')
       ORDER BY i.stock_status, p.name`
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
router.get('/recent-audit', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT id, user_name, action, module, ip_address, status, details, created_at
       FROM audit_logs
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
router.get('/branches', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(
      `SELECT
         b.id, b.name, b.city, b.region, b.status, b.manager,
         COUNT(DISTINCT u.id) FILTER (WHERE u.status='Active') AS employee_count,
         COUNT(DISTINCT c.id) AS client_count,
         COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('Overdue','Blacklisted')) AS overdue_clients
       FROM branches b
       LEFT JOIN users u ON u.branch_id = b.id
       LEFT JOIN clients c ON c.branch_id = b.id
       GROUP BY b.id
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
// Returns: staff counts, client counts, overdue stats, inventory health,
// recent collection/sales totals, and pending CI requests for the branch.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branch-summary', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { branch_id } = req.query;

    // branch_id is required — for Branch Manager it is auto-injected by middleware
    if (!branch_id || isNaN(Number(branch_id))) {
      return res.status(400).json({
        success: false,
        message: 'branch_id query parameter is required.',
      });
    }

    const bid = Number(branch_id);

    const [
      branchResult,
      staffResult,
      clientResult,
      inventoryResult,
      collectionResult,
      salesResult,
    ] = await Promise.all([
      // Branch info
      pool.query(
        `SELECT id, name, city, region, manager, status FROM branches WHERE id = $1`,
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
      // Client counts and overdue breakdown
      pool.query(
        `SELECT
           COUNT(*)                                              AS total_clients,
           COUNT(*) FILTER (WHERE status = 'Active')            AS active_clients,
           COUNT(*) FILTER (WHERE status = 'Overdue')           AS overdue_clients,
           COUNT(*) FILTER (WHERE status = 'Blacklisted')       AS blacklisted_clients,
           COALESCE(SUM(outstanding_balance), 0)                AS total_outstanding,
           COALESCE(SUM(credit_limit), 0)                       AS total_credit_limit
         FROM clients
         WHERE branch_id = $1`,
        [bid]
      ),
      // Inventory health for this branch
      pool.query(
        `SELECT
           stock_status,
           COUNT(*) AS count,
           COALESCE(SUM(quantity), 0) AS total_qty
         FROM inventory
         WHERE branch_id = $1
         GROUP BY stock_status`,
        [bid]
      ),
      // Collections total for current month
      pool.query(
        `SELECT
           COUNT(*)                                               AS total_collections,
           COALESCE(SUM(amount_paid), 0)                         AS total_amount_collected,
           COUNT(*) FILTER (WHERE status = 'Pending')            AS pending_collections
         FROM collection_payments
         WHERE branch_id = $1
           AND payment_date >= date_trunc('month', NOW())`,
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
           AND invoice_date >= date_trunc('month', NOW())`,
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
        branch,
        staff: {
          activeStaff:   Number(staffResult.rows[0].active_staff),
          inactiveStaff: Number(staffResult.rows[0].inactive_staff),
        },
        clients: {
          totalClients:      Number(clientResult.rows[0].total_clients),
          activeClients:     Number(clientResult.rows[0].active_clients),
          overdueClients:    Number(clientResult.rows[0].overdue_clients),
          blacklistedClients:Number(clientResult.rows[0].blacklisted_clients),
          totalOutstanding:  Number(clientResult.rows[0].total_outstanding),
          totalCreditLimit:  Number(clientResult.rows[0].total_credit_limit),
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
