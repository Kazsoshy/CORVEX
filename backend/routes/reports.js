import express from 'express';
import { requireAuth, requireBranchScope } from '../middleware/auth.js';

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/collection
// Returns daily collection data for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/collection', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const result = await pool.query(
      `SELECT 
         TO_CHAR(payment_date, 'Dy') AS day,
         COALESCE(SUM(amount), 0) AS amount
       FROM collection_payment
       WHERE payment_date >= CURRENT_DATE - INTERVAL '7 days'
         ${isBranchScoped ? 'AND branch_id = $1' : ''}
       GROUP BY TO_CHAR(payment_date, 'Dy'), payment_date
       ORDER BY MIN(payment_date)`,
      isBranchScoped ? [bid] : []
    );

    const daily = days.map((day) => {
      const found = result.rows.find((r) => r.day === day);
      return {
        day,
        amount: found ? Number(found.amount) : 0,
        target: 180000,
      };
    });

    const totalCollected = daily.reduce((sum, d) => sum + d.amount, 0);
    const totalTarget = daily.reduce((sum, d) => sum + d.target, 0);
    const collectionRate = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        daily,
        summary: {
          totalCollected,
          totalTarget,
          collectionRate,
          daysWithCollections: daily.filter((d) => d.amount > 0).length,
        },
      },
    });
  } catch (err) {
    console.error('[Reports] GET /collection error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch collection data.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/sales
// Returns weekly sales data for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/sales', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const result = await pool.query(
      `SELECT 
         TO_CHAR(invoices_date, 'Dy') AS day,
         COUNT(*) AS invoices,
         COALESCE(SUM(total_amount), 0) AS actual
       FROM sales_invoices
       WHERE invoices_date >= CURRENT_DATE - INTERVAL '7 days'
         ${isBranchScoped ? 'AND branch_id = $1' : ''}
       GROUP BY TO_CHAR(invoices_date, 'Dy'), invoices_date
       ORDER BY MIN(invoices_date)`,
      isBranchScoped ? [bid] : []
    );

    const weekly = days.map((day) => {
      const found = result.rows.find((r) => r.day === day);
      return {
        day,
        actual: found ? Number(found.actual) : 0,
        target: 230000,
        invoices: found ? Number(found.invoices) : 0,
      };
    });

    const totalActual = weekly.reduce((sum, d) => sum + d.actual, 0);
    const totalTarget = weekly.reduce((sum, d) => sum + d.target, 0);
    const salesEfficiency = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        weekly,
        summary: {
          totalActual,
          totalTarget,
          salesEfficiency,
          totalInvoices: weekly.reduce((sum, d) => sum + d.invoices, 0),
        },
      },
    });
  } catch (err) {
    console.error('[Reports] GET /sales error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch sales data.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/inventory
// Returns inventory status breakdown for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/inventory', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const statusResult = await pool.query(
      `SELECT
         CASE 
           WHEN available_stock <= 0 THEN 'Out of Stock'
           WHEN available_stock <= reorder_level THEN 'Low Stock'
           ELSE 'Sufficient'
         END AS stock_status,
         COUNT(*) AS count
       FROM branch_inventory
       ${isBranchScoped ? 'WHERE branch_id = $1' : ''}
       GROUP BY stock_status`,
      isBranchScoped ? [bid] : []
    );

    const lowStockResult = await pool.query(
      `SELECT p.product_name AS product_name, p.sku, bi.available_stock, bi.reorder_level,
         CASE 
           WHEN bi.available_stock <= 0 THEN 'Out of Stock'
           WHEN bi.available_stock <= bi.reorder_level THEN 'Low Stock'
           ELSE 'Sufficient'
         END AS status
       FROM branch_inventory bi
       JOIN products p ON p.product_id = bi.product_id
       WHERE bi.available_stock <= bi.reorder_level
         ${isBranchScoped ? 'AND bi.branch_id = $1' : ''}
       ORDER BY bi.available_stock ASC`,
      isBranchScoped ? [bid] : []
    );

    const summary = {
      sufficient: 0,
      low: 0,
      critical: 0,
      outOfStock: 0,
    };
    statusResult.rows.forEach((r) => {
      if (r.stock_status === 'Sufficient') summary.sufficient = Number(r.count);
      else if (r.stock_status === 'Low Stock') summary.low = Number(r.count);
      else if (r.stock_status === 'Out of Stock') summary.outOfStock = Number(r.count);
      else summary.critical = Number(r.count);
    });

    const totalProducts = Object.values(summary).reduce((a, b) => a + b, 0);
    const healthPct = totalProducts > 0 ? Math.round((summary.sufficient / totalProducts) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary,
        healthPct,
        lowStockItems: lowStockResult.rows,
        totalProducts,
        alertsCount: summary.low + summary.critical + summary.outOfStock,
      },
    });
  } catch (err) {
    console.error('[Reports] GET /inventory error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch inventory data.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/delinquency
// Returns delinquency trend data for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/delinquency', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'];
    const delinquency = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (i + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const result = await pool.query(
        `SELECT
           COUNT(*) AS overdue_accounts,
           COUNT(*) FILTER (WHERE outstanding_balance > 0) AS rate_count
         FROM customers c
         LEFT JOIN customer_activity ca ON c.customer_id = ca.customer_id
         WHERE c.status = 'Active'
           AND (ca.last_collection_date < $1 OR ca.last_collection_date IS NULL)
           ${isBranchScoped ? 'AND c.branch_id = $2' : ''}`,
        isBranchScoped ? [weekStart.toISOString().split('T')[0], bid] : [weekStart.toISOString().split('T')[0]]
      );

      const row = result.rows[0];
      const totalCustomers = await pool.query(
        `SELECT COUNT(*) AS count FROM customers WHERE status = 'Active' ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      );
      const total = Number(totalCustomers.rows[0].count);
      const overdue = Number(row.overdue_accounts);
      const rate = total > 0 ? Math.round((overdue / total) * 100) : 0;

      delinquency.push({
        week: weeks[6 - i],
        accounts: overdue,
        rate,
      });
    }

    const totalOverdue = delinquency.reduce((sum, d) => sum + d.accounts, 0);
    const avgRate = delinquency.length > 0
      ? Math.round(delinquency.reduce((sum, d) => sum + d.rate, 0) / delinquency.length)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        delinquency,
        summary: {
          totalOverdue,
          avgRate,
          trend: delinquency.length >= 2 && delinquency[delinquency.length - 1].accounts > delinquency[0].accounts ? 'increasing' : 'stable',
        },
      },
    });
  } catch (err) {
    console.error('[Reports] GET /delinquency error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch delinquency data.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/compliance
// Returns weekly compliance trend per collector for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/compliance', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const collectorsResult = await pool.query(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE r.slug = 'collector' AND u.status = 'Active'
         ${isBranchScoped ? 'AND u.branch_id = $1' : ''}
       ORDER BY u.first_name`,
      isBranchScoped ? [bid] : []
    );

    const weeks = ['W1', 'W2', 'W3', 'W4'];
    const compliance = [];

    for (const collector of collectorsResult.rows) {
      const collectorWeeks = [];
      const today = new Date();

      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (i + 1) * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const result = await pool.query(
          `SELECT
             COUNT(*) AS assigned,
             COUNT(*) FILTER (WHERE status = 'Completed') AS completed
           FROM field_visits
           WHERE user_id = $1
             AND scheduled_date >= $2
             AND scheduled_date < $3`,
          [collector.id, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]]
        );

        const row = result.rows[0];
        const assigned = Number(row.assigned) || 0;
        const completed = Number(row.completed) || 0;
        const rate = assigned > 0 ? Math.round((completed / assigned) * 100) : 100;

        collectorWeeks.push({ week: weeks[3 - i], rate });
      }

      compliance.push({
        name: collector.name,
        data: collectorWeeks,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        compliance,
        weeks,
      },
    });
  } catch (err) {
    console.error('[Reports] GET /compliance error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch compliance data.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/kpi
// Returns overall KPI summary for the branch
// ──────────────────────────────────────────────────────────────────────────────
router.get('/kpi', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const [
      staffResult,
      customerResult,
      inventoryResult,
      collectionResult,
      salesResult,
    ] = await Promise.all([
      pool.query(
         `SELECT
            COUNT(*) FILTER (WHERE r.slug = 'collector') AS active_collectors,
            COUNT(*) FILTER (WHERE r.slug = 'sales_staff') AS active_sales_agents
          FROM users u
          JOIN roles r ON u.role_id = r.role_id
          WHERE u.status = 'Active'
            ${isBranchScoped ? 'AND u.branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_customers,
           COUNT(*) FILTER (WHERE c.status = 'Active') AS active_customers,
           COALESCE(SUM(ca.outstanding_balance), 0) AS total_outstanding
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
         WHERE payment_date >= CURRENT_DATE - INTERVAL '7 days'
           ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_invoices,
           COALESCE(SUM(total_amount), 0) AS total_sales_amount
         FROM sales_invoices
         WHERE invoices_date >= CURRENT_DATE - INTERVAL '7 days'
           ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
    ]);

    const staff = staffResult.rows[0];
    const customers = customerResult.rows[0];
    const inventory = inventoryResult.rows[0];
    const collections = collectionResult.rows[0];
    const sales = salesResult.rows[0];

    const healthScore = Math.min(100, Math.max(0,
      50 +
      (Number(customers.active_customers) / Math.max(1, Number(customers.total_customers)) * 20) +
      (Number(collections.total_amount_collected) > 0 ? 15 : 0) +
      (Number(inventory.stockout_count) === 0 ? 15 : 0)
    ));

    return res.status(200).json({
      success: true,
      data: {
        healthScore: Math.round(healthScore),
        activeCollectors: Number(staff.active_collectors) || 0,
        activeSalesAgents: Number(staff.active_sales_agents) || 0,
        totalCustomers: Number(customers.total_customers) || 0,
        activeCustomers: Number(customers.active_customers) || 0,
        totalOutstanding: Number(customers.total_outstanding) || 0,
        stockAlertsCount: Number(inventory.low_stock_count) + Number(inventory.stockout_count),
        totalCollectionsWeek: Number(collections.total_collections) || 0,
        totalCollectionsAmount: Number(collections.total_amount_collected) || 0,
        totalSalesWeek: Number(sales.total_invoices) || 0,
        totalSalesAmount: Number(sales.total_sales_amount) || 0,
        collectionRate: collections.total_collections > 0 ? Math.round((collections.total_amount_collected / 180000) * 100) : 0,
        salesEfficiency: sales.total_sales_amount > 0 ? Math.round((sales.total_sales_amount / 230000) * 100) : 0,
        inventoryHealth: Number(inventory.stockout_count) === 0 ? 100 : Math.max(0, 100 - Number(inventory.stockout_count) * 10),
      },
    });
  } catch (err) {
    console.error('[Reports] GET /kpi error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch KPI data.' });
  }
});

export default router;
