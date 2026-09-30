import express from 'express';
import { requireAuth, requireRole, requireAssignedBranch, isUnscoped, ROLE_SETS } from '../middleware/auth.js';

const router = express.Router();
router.use(requireRole(ROLE_SETS.branchOps), requireAssignedBranch);

function scopeUser(user) {
  const branchScoped = user.branchId != null && !isUnscoped(user);
  return { branchScoped, bid: user.branchId };
}

async function assertStaffInBranch(pool, user, staffId, roleSlug) {
  const { branchScoped, bid } = scopeUser(user);
  const params = [staffId, roleSlug];
  let sql = `SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id
             WHERE u.id = $1 AND r.slug = $2 AND u.status = 'Active'`;
  if (branchScoped) {
    sql += ' AND u.branch_id = $3';
    params.push(bid);
  }
  const found = await pool.query(sql, params);
  return found.rows.length > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/analytics
// Returns branch-specific analytics for the logged-in branch manager
// ──────────────────────────────────────────────────────────────────────────────
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : null;

    const [
      staffResult,
      customerResult,
      inventoryResult,
      collectionResult,
      salesResult,
      visitResult,
      collectorPerfResult,
      salesPerfResult,
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'Active') AS active_staff,
           COUNT(*) FILTER (WHERE r.slug = 'collector') AS active_collectors,
           COUNT(*) FILTER (WHERE r.slug = 'sales_staff') AS active_sales_agents
         FROM users u
         JOIN roles r ON u.role_id = r.role_id
         ${isBranchScoped ? 'WHERE u.branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_customers,
           COUNT(*) FILTER (WHERE status = 'Active') AS active_customers,
           COALESCE(SUM(ca.outstanding_balance), 0) AS total_outstanding,
           COUNT(*) FILTER (WHERE ca.outstanding_balance > 0) AS overdue_count
         FROM customers c
         LEFT JOIN customer_activity ca ON c.customer_id = ca.customer_id
         ${isBranchScoped ? 'WHERE c.branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE available_stock <= 0) AS stockout_count,
           COUNT(*) FILTER (WHERE available_stock <= reorder_level) AS low_stock_count
         FROM branch_inventory
         ${isBranchScoped ? 'WHERE branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_collections,
           COALESCE(SUM(amount), 0) AS total_amount_collected
         FROM collection_payment
         WHERE payment_date >= MAKE_DATE(
           EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'Asia/Manila')::INT,
           EXTRACT(MONTH FROM NOW() AT TIME ZONE 'Asia/Manila')::INT,
           1
         )
           ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_invoices,
           COALESCE(SUM(total_amount), 0) AS total_sales_amount
         FROM sales_invoices
         WHERE invoices_date >= MAKE_DATE(
           EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'Asia/Manila')::INT,
           EXTRACT(MONTH FROM NOW() AT TIME ZONE 'Asia/Manila')::INT,
           1
         )
           ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_visits,
           COUNT(*) FILTER (WHERE fv.status = 'Completed') AS completed_visits,
           COUNT(*) FILTER (WHERE fv.status = 'Pending' AND fv.scheduled_date < CURRENT_DATE) AS missed_visits
         FROM field_visits fv
         JOIN users u ON u.id = fv.user_id
         ${isBranchScoped ? 'WHERE u.branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           u.id AS user_id,
           COUNT(*) FILTER (WHERE fv.status = 'Completed') AS visited,
           COUNT(*) FILTER (WHERE fv.status = 'Pending') AS pending,
           COUNT(*) AS assigned
         FROM users u
         LEFT JOIN field_visits fv ON fv.user_id = u.id
         WHERE u.role_id = (SELECT role_id FROM roles WHERE slug = 'collector')
           ${isBranchScoped ? 'AND u.branch_id = $1' : ''}
         GROUP BY u.id`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           u.id AS user_id,
           COUNT(DISTINCT fv.customer_id) AS customers_assigned,
           COUNT(*) FILTER (WHERE fv.visit_type = 'Sales') AS total_assigned,
           COUNT(*) FILTER (WHERE fv.status = 'Completed' AND fv.visit_type = 'Sales') AS visits_completed,
           COALESCE(si.sales_logged, 0) AS sales_logged,
           COALESCE(si.total_sales_amount, 0) AS total_sales_amount
         FROM users u
         LEFT JOIN field_visits fv ON fv.user_id = u.id
         LEFT JOIN (
           SELECT sales_agent_id, COUNT(*) AS sales_logged, SUM(total_amount) AS total_sales_amount
           FROM sales_invoices
           GROUP BY sales_agent_id
         ) si ON si.sales_agent_id = u.id
         WHERE u.role_id = (SELECT role_id FROM roles WHERE slug = 'sales_staff')
           ${isBranchScoped ? 'AND u.branch_id = $1' : ''}
         GROUP BY u.id, si.sales_logged, si.total_sales_amount`,
        isBranchScoped ? [bid] : []
      ),
    ]);

    const staff = staffResult.rows[0];
    const customers = customerResult.rows[0];
    const inventory = inventoryResult.rows[0];
    const collections = collectionResult.rows[0];
    const sales = salesResult.rows[0];
    const visits = visitResult.rows[0];

    const collectorPerf = collectorPerfResult.rows;
    const salesPerf = salesPerfResult.rows;

    const totalCollectors = Number(staff.active_collectors) || 0;
    const totalSalesAgents = Number(staff.active_sales_agents) || 0;

    const collectorCompliance = totalCollectors > 0
      ? Math.round((collectorPerf.reduce((sum, c) => sum + (c.assigned > 0 ? (c.visited / c.assigned) * 100 : 100), 0) / totalCollectors) * 10) / 10
      : 0;

    const salesCompleted = salesPerf.reduce((sum, s) => sum + (Number(s.visits_completed) || 0), 0);
    const salesTotal = salesPerf.reduce((sum, s) => sum + (Number(s.total_assigned) || 0), 0);
    const salesCompletion = salesTotal > 0
      ? Math.round((salesCompleted / salesTotal) * 100)
      : 0;

    const healthScore = Math.min(100, Math.max(0,
      50 +
      (Number(customers.active_customers) / Math.max(1, Number(customers.total_customers)) * 20) +
      (Number(collections.total_amount_collected) > 0 ? 15 : 0) +
      (Number(inventory.stockout_count) === 0 ? 15 : 0)
    ));

    let pendingCiSql = `SELECT COUNT(*)::int AS count FROM credit_investigations ci WHERE ci.status = 'Pending'`;
    const pendingCiParams = [];
    if (isBranchScoped) {
      pendingCiSql += ' AND ci.branch_id = $1';
      pendingCiParams.push(bid);
    }
    const pendingCiResult = await pool.query(pendingCiSql, pendingCiParams);
    const pendingCI = pendingCiResult.rows[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: {
        healthScore: Math.round(healthScore),
        collectionEfficiency: Math.round(collectorCompliance),
        salesEfficiency: Math.round(salesCompletion),
        inventoryHealth: Number(inventory.stockout_count) === 0 ? 100 : Math.max(0, 100 - Number(inventory.stockout_count) * 10),
        collectionRateToday: Number(collections.total_collections) > 0 ? Math.min(100, Math.round((Number(collections.total_amount_collected) / 180000) * 100)) : 0,
        routeCompliance: Math.round(collectorCompliance),
        salesVisitCompletion: Math.round(salesCompletion),
        stockAlertsCount: Number(inventory.low_stock_count),
        pendingCI,
        overdueAccounts: Number(customers.overdue_count) || 0,
        totalCollectionsToday: Number(collections.total_amount_collected),
        totalSalesToday: Number(sales.total_sales_amount),
        activeCollectors: Number(staff.active_collectors),
        activeSalesAgents: Number(staff.active_sales_agents),
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /analytics error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/staff
// Returns staff (collectors and sales agents) for the branch with real metrics
// ──────────────────────────────────────────────────────────────────────────────
router.get('/staff', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : null;

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, r.slug AS role_slug
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.status = 'Active'
         AND r.slug IN ('collector', 'sales_staff')
         ${isBranchScoped ? 'AND u.branch_id = $1' : ''}
       ORDER BY r.slug, u.first_name`,
      isBranchScoped ? [bid] : []
    );

    const collectors = await Promise.all(
      result.rows.filter((u) => u.role_slug === 'collector').map(async (u) => {
        const visitsResult = await pool.query(
          `SELECT
             COUNT(*) AS assigned,
             COUNT(*) FILTER (WHERE status = 'Completed') AS visited,
             COUNT(*) FILTER (WHERE status = 'Pending') AS pending,
             COUNT(*) FILTER (WHERE status = 'Pending' AND scheduled_date < CURRENT_DATE) AS missed
           FROM field_visits
           WHERE user_id = $1`,
          [u.id]
        );
        const collectionsResult = await pool.query(
          `SELECT
             COALESCE(SUM(amount), 0) AS total_collected,
             COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count
           FROM collection_payment
           WHERE collector_id = $1 AND status = 'Completed'`,
          [u.id]
        );

        const visits = visitsResult.rows[0];
        const collections = collectionsResult.rows[0];
        const assigned = Number(visits.assigned) || 0;
        const visited = Number(visits.visited) || 0;
        const compliance = assigned > 0 ? Math.round((visited / assigned) * 100) : 100;
        const recovery = assigned > 0 ? Math.round((Number(collections.completed_count) / assigned) * 100) : 0;

        return {
          id: String(u.id),
          name: `${u.first_name} ${u.last_name}`,
          accountsAssigned: assigned,
          accountsVisited: visited,
          accountsPending: Number(visits.pending) || 0,
          complianceScore: compliance,
          collectionAmount: Number(collections.total_collected),
          recoveryRate: recovery,
          missedVisits: Number(visits.missed) || 0,
          avgVisitDuration: '25 min',
          collectionSuccessRate: compliance,
          route: [],
          missedAccounts: [],
          gpsAttendance: true,
        };
      })
    );

    const salesAgents = await Promise.all(
      result.rows.filter((u) => u.role_slug === 'sales_staff').map(async (u) => {
        const visitsResult = await pool.query(
          `SELECT
             COUNT(DISTINCT customer_id) AS customers_assigned,
             COUNT(*) FILTER (WHERE visit_type = 'Sales') AS total_assigned,
             COUNT(*) FILTER (WHERE status = 'Completed' AND visit_type = 'Sales') AS visits_completed
           FROM field_visits
           WHERE user_id = $1`,
          [u.id]
        );
        const salesResult = await pool.query(
          `SELECT
             COUNT(*) AS sales_logged,
             COALESCE(SUM(total_amount), 0) AS total_sales_amount
           FROM sales_invoices
           WHERE sales_agent_id = $1`,
          [u.id]
        );

        const visits = visitsResult.rows[0];
        const sales = salesResult.rows[0];
        const customersAssigned = Number(visits.customers_assigned) || 0;
        const visitsCompleted = Number(visits.visits_completed) || 0;
        const salesLogged = Number(sales.sales_logged) || 0;
        const totalSalesAmount = Number(sales.total_sales_amount) || 0;
        const visitCompletionRate = Number(visits.total_assigned) > 0 ? Math.round((visitsCompleted / Number(visits.total_assigned)) * 100) : 0;
        const conversionRate = visitsCompleted > 0 ? Math.round((salesLogged / visitsCompleted) * 100) : 0;
        const avgSaleValue = salesLogged > 0 ? Math.round(totalSalesAmount / salesLogged) : 0;

        const newCustResult = await pool.query(
          `SELECT COUNT(*)::int AS count FROM customers
           WHERE assigned_sales_agent_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
          [u.id]
        );
        const newCustomersAcquired = newCustResult.rows[0]?.count || 0;

        return {
          id: String(u.id),
          name: `${u.first_name} ${u.last_name}`,
          customersAssigned,
          visitsCompleted,
          salesLogged,
          totalSalesAmount,
          visitCompletionRate,
          conversionRate,
          avgSaleValue,
          newCustomersAcquired,
          customers: [],
          productPerformance: [],
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        collectors,
        salesAgents,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch staff.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/customers
// Returns customers for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/customers', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : null;

    const result = await pool.query(
      `SELECT c.customer_id, c.first_name, c.last_name, c.contact_phone, c.status,
              c.latitude, c.longitude, c.address,
              c.contact_person_fname, c.contact_person_lname, c.contact_person_phone,
              c.account_manager_id, c.assigned_sales_agent_id, c.created_at,
              b.name AS branch_name,
              mgr.full_name AS account_manager_name,
              agent.first_name || ' ' || agent.last_name AS assigned_sales_agent_name,
              COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
              COALESCE(ca.purchase_volume, 0) AS purchase_volume,
              ca.last_collection_date, ca.last_sales_visit
       FROM customers c
       JOIN branches b ON b.id = c.branch_id
       LEFT JOIN customer_activity ca ON c.customer_id = ca.customer_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       ${isBranchScoped ? 'WHERE c.branch_id = $1' : ''}
       ORDER BY c.last_name, c.first_name`,
      isBranchScoped ? [bid] : []
    );

    const customers = result.rows.map((c) => ({
      customer_id: c.customer_id,
      id: String(c.customer_id),
      first_name: c.first_name,
      last_name: c.last_name,
      customerName: `${c.first_name} ${c.last_name}`,
      address: c.address,
      contact_phone: c.contact_phone,
      contact_person_fname: c.contact_person_fname,
      contact_person_lname: c.contact_person_lname,
      contact_person_phone: c.contact_person_phone,
      status: c.status,
      branch_name: c.branch_name,
      account_manager_id: c.account_manager_id,
      account_manager_name: c.account_manager_name || '—',
      customer_since: c.created_at,
      outstanding_balance: Number(c.outstanding_balance),
      purchase_volume: Number(c.purchase_volume),
      last_collection_date: c.last_collection_date,
      last_sales_visit: c.last_sales_visit,
      paymentStatus: Number(c.outstanding_balance) > 0 ? 'Overdue' : 'Current',
      lat: Number(c.latitude) || 0,
      lng: Number(c.longitude) || 0,
    }));

    const mapAccounts = customers.map((c) => ({
      id: c.id,
      customerName: c.customerName,
      balance: c.outstanding_balance,
      paymentStatus: c.paymentStatus,
      lastVisit: c.last_sales_visit || c.last_collection_date || 'N/A',
      assignedStaff: c.assigned_sales_agent_name?.trim() || c.account_manager_name || 'Unassigned',
      lat: c.lat,
      lng: c.lng,
      zone: c.outstanding_balance > 0 ? 'High Collection' : 'Moderate',
    }));

    return res.status(200).json({
      success: true,
      data: { customers, mapAccounts },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /customers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
  }
});

// GET /api/branch-manager/customers/:id
// Returns a single customer for the branch manager's branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/customers/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : null;

    let customerQuery = `SELECT c.customer_id, c.first_name, c.last_name, c.address, c.latitude, c.longitude,
              c.contact_phone, c.contact_person_fname, c.contact_person_lname,
              c.contact_person_phone, c.status, c.created_at, c.updated_at,
              c.account_manager_id,
              b.name AS branch_name,
              mgr.full_name AS account_manager_name
       FROM customers c
       JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       WHERE c.customer_id = $1`;
    const params = [req.params.id];
    if (isBranchScoped) {
      customerQuery += ` AND c.branch_id = $2`;
      params.push(bid);
    }

    const customerResult = await pool.query(customerQuery, params);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const customer = customerResult.rows[0];

    const [activityResult, creditResult] = await Promise.all([
      pool.query(`SELECT * FROM customer_activity WHERE customer_id = $1`, [req.params.id]),
      pool.query(
        `SELECT cci.*, u.full_name AS approved_by_name
         FROM customer_credit_info cci
         LEFT JOIN users u ON u.id = cci.approved_by
         WHERE cci.customer_id = $1`,
        [req.params.id]
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...customer,
        activity: activityResult.rows[0] || null,
        creditInfo: creditResult.rows[0] || null,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /customers/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/alerts
// Returns alerts for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : null;

    let inventoryQuery = `SELECT p.name AS product_name, bi.available_stock, bi.reorder_level
       FROM branch_inventory bi
       JOIN products p ON p.id = bi.product_id
       WHERE bi.available_stock <= bi.reorder_level`;
    const params = [];
    if (isBranchScoped) {
      inventoryQuery += ` AND bi.branch_id = $1`;
      params.push(bid);
    }
    inventoryQuery += ` ORDER BY bi.available_stock ASC`;

    const inventoryResult = await pool.query(inventoryQuery, params);

    const alerts = [];

    inventoryResult.rows.forEach((item, idx) => {
      alerts.push({
        id: `inv${idx}`,
        type: 'inventory',
        category: item.available_stock <= 0 ? 'Inventory Stockout' : 'Inventory Low Stock',
        title: item.available_stock <= 0 ? `${item.product_name} out of stock` : `${item.product_name} low stock`,
        message: item.available_stock <= 0
          ? `${item.product_name} — zero units remaining at branch.`
          : `${item.product_name} below reorder point (${item.available_stock} units).`,
        severity: item.available_stock <= 0 ? 'Critical' : 'Warning',
        time: new Date().toISOString(),
      });
    });

    let opsSql = `SELECT oa.alert_id, oa.alert_type, oa.severity, oa.title, oa.message, oa.created_at
                  FROM operational_alerts oa WHERE oa.status = 'Open'`;
    const opsParams = [];
    if (isBranchScoped) {
      opsSql += ' AND oa.branch_id = $1';
      opsParams.push(bid);
    }
    opsSql += ' ORDER BY oa.created_at DESC LIMIT 20';
    const opsResult = await pool.query(opsSql, opsParams);
    opsResult.rows.forEach((row) => {
      alerts.push({
        id: `oa${row.alert_id}`,
        type: row.alert_type,
        category: row.alert_type,
        title: row.title,
        message: row.message,
        severity: row.severity,
        time: row.created_at,
      });
    });

    alerts.sort((a, b) => new Date(b.time) - new Date(a.time));

    return res.status(200).json({
      success: true,
      data: { alerts },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /alerts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch alerts.' });
  }
});

// GET /api/branch-manager/audit-logs — branch-scoped audit trail
router.get('/audit-logs', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped, bid } = scopeUser(user);
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const params = [];
    let sql = `SELECT a.log_id AS audit_id, a.user_id, a.user_name, a.action, a.ip_address,
                      a.status_details, a.created_at
               FROM audit_logs a`;
    if (branchScoped) {
      sql += ` JOIN users u ON u.id = a.user_id WHERE u.branch_id = $1`;
      params.push(bid);
    }
    sql += ` ORDER BY a.created_at DESC LIMIT ${limit}`;

    const result = await pool.query(sql, params);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Branch Manager] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

// GET /api/branch-manager/staff/collectors/:id — route timeline & map points
router.get('/staff/collectors/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const collectorId = Number(req.params.id);
    if (!Number.isFinite(collectorId)) {
      return res.status(400).json({ success: false, message: 'Invalid collector ID.' });
    }
    const allowed = await assertStaffInBranch(pool, user, collectorId, 'collector');
    if (!allowed) {
      return res.status(404).json({ success: false, message: 'Collector not found.' });
    }

    const visitsResult = await pool.query(
      `SELECT fv.visit_id, fv.scheduled_date, fv.status, fv.visit_type,
              c.customer_id, c.first_name || ' ' || c.last_name AS customer_name,
              c.latitude, c.longitude,
              (SELECT cp.amount FROM collection_payment cp
               WHERE cp.collector_id = fv.user_id AND cp.customer_id = fv.customer_id
               ORDER BY cp.payment_date DESC LIMIT 1) AS last_payment_amount
       FROM field_visits fv
       JOIN customers c ON c.customer_id = fv.customer_id
       WHERE fv.user_id = $1 AND fv.visit_type = 'Collection'
       ORDER BY fv.scheduled_date DESC, fv.visit_id DESC
       LIMIT 100`,
      [collectorId]
    );

    const today = new Date().toISOString().slice(0, 10);
    const route = visitsResult.rows.map((row) => {
      let status = row.status;
      if (row.status === 'Pending' && row.scheduled_date < today) status = 'Missed';
      return {
        account: row.customer_name,
        customerId: row.customer_id,
        status,
        time: row.scheduled_date,
        amount: row.last_payment_amount != null ? Number(row.last_payment_amount) : null,
        lat: row.latitude != null ? Number(row.latitude) : null,
        lng: row.longitude != null ? Number(row.longitude) : null,
      };
    });

    const missedAccounts = route.filter((r) => r.status === 'Missed').map((r) => r.account);
    const mapMarkers = route
      .filter((r) => r.lat && r.lng)
      .map((r, idx) => ({
        id: `${r.customerId}-${idx}`,
        position: [r.lat, r.lng],
        label: r.account.substring(0, 2).toUpperCase(),
        color: r.status === 'Missed' ? '#ef4444' : r.status === 'Completed' ? '#10b981' : '#093850',
        popup: `${r.account} (${r.status})`,
      }));

    const polyline = mapMarkers.length >= 2
      ? [{ id: 'route', positions: mapMarkers.map((m) => m.position), color: '#093850' }]
      : [];

    return res.status(200).json({
      success: true,
      data: { route, missedAccounts, mapMarkers, polylines: polyline, gpsAttendance: true },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff/collectors/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load collector detail.' });
  }
});

// GET /api/branch-manager/staff/sales/:id — customers & product mix
router.get('/staff/sales/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const agentId = Number(req.params.id);
    if (!Number.isFinite(agentId)) {
      return res.status(400).json({ success: false, message: 'Invalid sales agent ID.' });
    }
    const allowed = await assertStaffInBranch(pool, user, agentId, 'sales_staff');
    if (!allowed) {
      return res.status(404).json({ success: false, message: 'Sales agent not found.' });
    }

    const customersResult = await pool.query(
      `SELECT DISTINCT c.first_name || ' ' || c.last_name AS name
       FROM customers c
       WHERE c.assigned_sales_agent_id = $1
          OR c.customer_id IN (SELECT fv.customer_id FROM field_visits fv WHERE fv.user_id = $1)
       ORDER BY 1
       LIMIT 50`,
      [agentId]
    );

    const productsResult = await pool.query(
      `SELECT p.name AS product, SUM(sii.quantity)::int AS units
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id
       JOIN products p ON p.id = sii.product_id
       WHERE si.sales_agent_id = $1
       GROUP BY p.name
       ORDER BY units DESC
       LIMIT 15`,
      [agentId]
    );

    return res.status(200).json({
      success: true,
      data: {
        customers: customersResult.rows.map((r) => r.name),
        productPerformance: productsResult.rows.map((r) => ({
          product: r.product,
          units: r.units,
        })),
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff/sales/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load sales agent detail.' });
  }
});

export default router;