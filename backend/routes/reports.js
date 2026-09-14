import express from 'express';
import { requireAuth, requireBranchScope } from '../middleware/auth.js';

const router = express.Router();

const MANILA_TIME_ZONE = 'Asia/Manila';

function toManilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseDateString(value) {
  if (!value || typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function dateStringToDate(value) {
  return new Date(`${value}T12:00:00Z`);
}

function addDays(value, days) {
  const date = dateStringToDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toManilaDateString(date);
}

function diffDaysInclusive(startDate, endDate) {
  const start = dateStringToDate(startDate);
  const end = dateStringToDate(endDate);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function startOfWeek(value) {
  const date = dateStringToDate(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(value, offset);
}

function startOfMonth(value) {
  const date = dateStringToDate(value);
  date.setUTCDate(1);
  return toManilaDateString(date);
}

function endOfMonth(value) {
  const date = dateStringToDate(value);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return toManilaDateString(date);
}

function startOfQuarter(value) {
  const date = dateStringToDate(value);
  const month = date.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  date.setUTCMonth(quarterStartMonth, 1);
  return toManilaDateString(date);
}

function endOfQuarter(value) {
  const date = dateStringToDate(value);
  const month = date.getUTCMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  date.setUTCMonth(quarterEndMonth + 1, 0);
  return toManilaDateString(date);
}

function startOfYear(value) {
  const date = dateStringToDate(value);
  date.setUTCMonth(0, 1);
  return toManilaDateString(date);
}

function endOfYear(value) {
  const date = dateStringToDate(value);
  date.setUTCMonth(11, 31);
  return toManilaDateString(date);
}

function addMonths(value, months) {
  const date = dateStringToDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toManilaDateString(date);
}

function addYears(value, years) {
  const date = dateStringToDate(value);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCMonth(month);
  date.setUTCDate(Math.min(day, lastDay));
  return toManilaDateString(date);
}

function resolveAnalyticsWindow(query = {}) {
  const now = toManilaDateString();
  const preset = (query.preset || query.range || 'this_month').toLowerCase();
  const requestedStart = parseDateString(query.start_date || query.startDate);
  const requestedEnd = parseDateString(query.end_date || query.endDate) || requestedStart;

  let startDate = requestedStart;
  let endDate = requestedEnd;
  let label = 'Custom Range';
  const usesPresetWindow = !requestedStart && !requestedEnd;

  if (!startDate || !endDate) {
    switch (preset) {
      case 'today':
        startDate = now;
        endDate = now;
        label = 'Today';
        break;
      case 'yesterday':
        startDate = addDays(now, -1);
        endDate = addDays(now, -1);
        label = 'Yesterday';
        break;
      case 'this_week':
      case 'thisweek':
        startDate = startOfWeek(now);
        endDate = now;
        label = 'This Week';
        break;
      case 'last_week':
      case 'lastweek': {
        const thisWeekStart = startOfWeek(now);
        startDate = addDays(thisWeekStart, -7);
        endDate = addDays(thisWeekStart, -1);
        label = 'Last Week';
        break;
      }
      case 'this_month':
      case 'thismonth':
        startDate = startOfMonth(now);
        endDate = now;
        label = 'This Month';
        break;
      case 'last_month':
      case 'lastmonth': {
        const thisMonthStart = startOfMonth(now);
        startDate = startOfMonth(addDays(thisMonthStart, -1));
        endDate = addDays(thisMonthStart, -1);
        label = 'Last Month';
        break;
      }
      case 'this_quarter':
      case 'thisquarter':
        startDate = startOfQuarter(now);
        endDate = now;
        label = 'This Quarter';
        break;
      case 'last_quarter':
      case 'lastquarter': {
        const thisQuarterStart = startOfQuarter(now);
        endDate = addDays(thisQuarterStart, -1);
        startDate = startOfQuarter(endDate);
        label = 'Last Quarter';
        break;
      }
      case 'this_year':
      case 'thisyear':
        startDate = startOfYear(now);
        endDate = now;
        label = 'This Year';
        break;
      case 'last_year':
      case 'lastyear': {
        const thisYearStart = startOfYear(now);
        endDate = addDays(thisYearStart, -1);
        startDate = startOfYear(endDate);
        label = 'Last Year';
        break;
      }
      case 'last_month_to_date':
        startDate = startOfMonth(addDays(now, -30));
        endDate = now;
        label = 'Last Month to Date';
        break;
      case 'custom':
      default:
        startDate = startDate || startOfMonth(now);
        endDate = endDate || now;
        break;
    }
  }

  if (!startDate) startDate = startOfMonth(now);
  if (!endDate) endDate = now;

  if (dateStringToDate(endDate) < dateStringToDate(startDate)) {
    const swap = startDate;
    startDate = endDate;
    endDate = swap;
  }

  const comparisonEnabled = String(query.compare_to_previous ?? query.compareToPrevious ?? 'true') !== 'false';
  const duration = diffDaysInclusive(startDate, endDate);
  let compareStartDate;
  let compareEndDate;

  if (usesPresetWindow) {
    if (preset === 'this_week' || preset === 'thisweek') {
      compareStartDate = addDays(startDate, -7);
      compareEndDate = addDays(endDate, -7);
    } else if (preset === 'this_month' || preset === 'thismonth') {
      compareStartDate = addMonths(startDate, -1);
      compareEndDate = addMonths(endDate, -1);
    } else if (preset === 'this_quarter' || preset === 'thisquarter') {
      compareStartDate = addMonths(startDate, -3);
      compareEndDate = addMonths(endDate, -3);
    } else if (preset === 'this_year' || preset === 'thisyear') {
      compareStartDate = addYears(startDate, -1);
      compareEndDate = addYears(endDate, -1);
    }
  }

  if (compareStartDate === undefined || compareEndDate === undefined) {
    compareEndDate = addDays(startDate, -1);
    compareStartDate = addDays(compareEndDate, -(duration - 1));
  }

  return {
    preset,
    label,
    startDate,
    endDate,
    comparisonEnabled,
    compareStartDate,
    compareEndDate,
    compareLabel: `Previous ${label.toLowerCase()}`,
  };
}

function buildDateSeries(startDate, endDate, rows, valueKey = 'amount', targetValue = 0) {
  const lookup = new Map(rows.map((row) => [row.day || row.date, Number(row[valueKey] || 0)]));
  const points = [];
  let cursor = dateStringToDate(startDate);
  const finish = dateStringToDate(endDate);

  while (cursor <= finish) {
    const day = toManilaDateString(cursor);
    points.push({
      day,
      label: new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: MANILA_TIME_ZONE }).format(cursor),
      amount: lookup.get(day) || 0,
      target: targetValue,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

function ratio(part, total) {
  if (!total) return 0;
  return Math.round((Number(part) / Number(total)) * 100);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/collection
// Returns daily collection data for the branch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
       WHERE payment_date >= (CURRENT_TIMESTAMP AT TIME ZONE '+08')::DATE - INTERVAL '7 days'
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
    // Cap at 100 — target is a reference line, not a ceiling; actual can exceed it
    const collectionRate = totalTarget > 0 ? Math.min(100, Math.round((totalCollected / totalTarget) * 100)) : 0;

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/sales
// Returns weekly sales data for the branch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
       WHERE invoices_date >= (CURRENT_TIMESTAMP AT TIME ZONE '+08')::DATE - INTERVAL '7 days'
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
    // Cap at 100 — target is a reference line, not a ceiling; actual can exceed it
    const salesEfficiency = totalTarget > 0 ? Math.min(100, Math.round((totalActual / totalTarget) * 100)) : 0;

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/inventory
// Returns inventory status breakdown for the branch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
       GROUP BY 1`,
      isBranchScoped ? [bid] : []
    );

    const lowStockResult = await pool.query(
      `SELECT p.name AS product_name, p.sku, bi.available_stock, bi.reorder_level,
         CASE 
           WHEN bi.available_stock <= 0 THEN 'Out of Stock'
           WHEN bi.available_stock <= bi.reorder_level THEN 'Low Stock'
           ELSE 'Sufficient'
         END AS status
       FROM branch_inventory bi
       JOIN products p ON p.id = bi.product_id
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/delinquency
// Returns delinquency trend data for the branch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/compliance
// Returns weekly compliance trend per collector for the branch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/kpi
// Returns overall KPI summary for the branch
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
         WHERE payment_date >= (CURRENT_TIMESTAMP AT TIME ZONE '+08')::DATE - INTERVAL '7 days'
           ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        isBranchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_invoices,
           COALESCE(SUM(total_amount), 0) AS total_sales_amount
         FROM sales_invoices
         WHERE invoices_date >= (CURRENT_TIMESTAMP AT TIME ZONE '+08')::DATE - INTERVAL '7 days'
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
        overdueCount: Number(customers.overdue_count) || 0,
        totalOutstanding: Number(customers.total_outstanding) || 0,
        stockAlertsCount: Number(inventory.low_stock_count) + Number(inventory.stockout_count),
        totalCollectionsWeek: Number(collections.total_collections) || 0,
        totalCollectionsAmount: Number(collections.total_amount_collected) || 0,
        totalSalesWeek: Number(sales.total_invoices) || 0,
        totalSalesAmount: Number(sales.total_sales_amount) || 0,
        // Cap at 100 — target is a reference, not a ceiling; actual collections can exceed it
        collectionRate: collections.total_collections > 0 ? Math.min(100, Math.round((Number(collections.total_amount_collected) / 180000) * 100)) : 0,
        salesEfficiency: sales.total_sales_amount > 0 ? Math.min(100, Math.round((Number(sales.total_sales_amount) / 230000) * 100)) : 0,
        inventoryHealth: Number(inventory.stockout_count) === 0 ? 100 : Math.max(0, 100 - Number(inventory.stockout_count) * 10),
      },
    });
  } catch (err) {
    console.error('[Reports] GET /kpi error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch KPI data.' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/reports/executive
// Executive Dashboard â€” all descriptive analytics metrics in one request.
// Equations 5, 6, 7, 8, 9 from Section 2.3.3.2. Table 14 branch comparison.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/executive
// Executive Dashboard — all descriptive analytics metrics in one request.
// Equations 5, 6, 7, 8, 9 from Section 2.3.3.2. Table 14 branch comparison.
//
// Root-cause fixes applied:
//   1. Timezone: uses NOW() AT TIME ZONE 'Asia/Manila' so month boundary is
//      correct for Philippine Standard Time (UTC+8).
//   2. Cartesian product: branch_summary uses correlated subqueries instead of
//      multi-table LEFT JOINs, eliminating row-multiplication on SUM/COUNT.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/executive', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : null;

    const branchParam    = isBranchScoped ? [bid] : [];
    const branchWhere    = isBranchScoped ? 'AND branch_id = $1' : '';
    const custBranchWhere = isBranchScoped ? 'AND c.branch_id = $1' : '';

    // Philippine Standard Time month boundary (UTC+8)
    const phMonthStart = `DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila')::DATE`;
    const phMonthPrev  = `(DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '1 month')::DATE`;
    const ph7dAgo      = `((NOW() AT TIME ZONE 'Asia/Manila')::DATE - INTERVAL '7 days')`;

    const [
      collectionsCurrentResult,
      collectionsPreviousResult,
      salesCurrentResult,
      salesPreviousResult,
      outstandingResult,
      customerResult,
      staffResult,
      visitResult,
      collectionTrendResult,
      salesTrendResult,
      branchSummaryResult,
      inventoryBranchResult,
    ] = await Promise.all([

      // Equation 5 — TC = SUM(Ci), current month
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM collection_payment
         WHERE payment_date >= ${phMonthStart}
           ${branchWhere}`,
        branchParam
      ),

      // TC previous month
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM collection_payment
         WHERE payment_date >= ${phMonthPrev}
           AND payment_date  <  ${phMonthStart}
           ${branchWhere}`,
        branchParam
      ),

      // Equation 6 — TS = SUM(Si), current month
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
         FROM sales_invoices
         WHERE invoices_date >= ${phMonthStart}
           ${branchWhere}`,
        branchParam
      ),

      // TS previous month
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM sales_invoices
         WHERE invoices_date >= ${phMonthPrev}
           AND invoices_date  <  ${phMonthStart}
           ${branchWhere}`,
        branchParam
      ),

      // Equation 9 — TOB = SUM(OBi) — from customer_activity directly
      pool.query(
        `SELECT COALESCE(SUM(ca.outstanding_balance), 0) AS total,
                COUNT(*) FILTER (WHERE ca.outstanding_balance > 0) AS overdue_count,
                COUNT(*) AS total_customers
         FROM customer_activity ca
         JOIN customers c ON c.customer_id = ca.customer_id
         WHERE 1=1 ${custBranchWhere}`,
        branchParam
      ),

      // Customer counts
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'Active') AS active
         FROM customers
         WHERE 1=1 ${isBranchScoped ? 'AND branch_id = $1' : ''}`,
        branchParam
      ),

      // Staff counts
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE r.slug = 'collector')   AS collectors,
           COUNT(*) FILTER (WHERE r.slug = 'sales_staff') AS sales_agents
         FROM users u
         JOIN roles r ON u.role_id = r.role_id
         WHERE u.status = 'Active'
           ${isBranchScoped ? 'AND u.branch_id = $1' : ''}`,
        branchParam
      ),

      // Route compliance
      pool.query(
        `SELECT
           COUNT(*) AS total_visits,
           COUNT(*) FILTER (WHERE fv.status = 'Completed') AS completed_visits,
           COUNT(*) FILTER (WHERE fv.visit_type = 'Sales' AND fv.status = 'Completed') AS sales_completed,
           COUNT(*) FILTER (WHERE fv.visit_type = 'Sales') AS sales_total
         FROM field_visits fv
         JOIN users u ON u.id = fv.user_id
         WHERE 1=1 ${isBranchScoped ? 'AND u.branch_id = $1' : ''}`,
        branchParam
      ),

      // Collection trend — daily 7 days
      pool.query(
        `SELECT
           TO_CHAR(payment_date, 'Dy') AS day,
           COALESCE(SUM(amount), 0) AS amount
         FROM collection_payment
         WHERE payment_date >= ${ph7dAgo}
           ${branchWhere}
         GROUP BY payment_date, TO_CHAR(payment_date, 'Dy')
         ORDER BY payment_date`,
        branchParam
      ),

      // Sales trend — daily 7 days
      pool.query(
        `SELECT
           TO_CHAR(invoices_date, 'Dy') AS day,
           COALESCE(SUM(total_amount), 0) AS amount,
           COUNT(*) AS invoices
         FROM sales_invoices
         WHERE invoices_date >= ${ph7dAgo}
           ${branchWhere}
         GROUP BY invoices_date, TO_CHAR(invoices_date, 'Dy')
         ORDER BY invoices_date`,
        branchParam
      ),

      // Table 14 — branch comparison
      // Uses correlated subqueries to avoid Cartesian product
      pool.query(
        `SELECT
           b.id,
           b.name AS branch_name,
           (SELECT COALESCE(SUM(cp.amount), 0)
            FROM collection_payment cp
            WHERE cp.branch_id = b.id
              AND cp.payment_date >= ${phMonthStart}
           ) AS total_collections,
           (SELECT COALESCE(SUM(si.total_amount), 0)
            FROM sales_invoices si
            WHERE si.branch_id = b.id
              AND si.invoices_date >= ${phMonthStart}
           ) AS total_sales,
           (SELECT COALESCE(SUM(ca.outstanding_balance), 0)
            FROM customers c2
            JOIN customer_activity ca ON ca.customer_id = c2.customer_id
            WHERE c2.branch_id = b.id
           ) AS total_outstanding,
           (SELECT COUNT(*) FROM customers c3 WHERE c3.branch_id = b.id) AS customer_count,
           (SELECT COUNT(*) FROM customers c4 WHERE c4.branch_id = b.id AND c4.status = 'Active') AS active_customers
         FROM branches b
         WHERE b.status = 'Active' ${isBranchScoped ? 'AND b.id = $1' : ''}
         ORDER BY b.name`,
        branchParam
      ),

      // Equation 8 — Available Stock by branch
      pool.query(
        `SELECT b.name AS branch_name, b.id AS branch_id,
                COUNT(*) AS product_count,
                COALESCE(SUM(bi.available_stock), 0) AS total_available,
                COUNT(*) FILTER (WHERE bi.available_stock <= 0) AS out_of_stock,
                COUNT(*) FILTER (WHERE bi.available_stock <= bi.reorder_level AND bi.available_stock > 0) AS low_stock
         FROM branch_inventory bi
         JOIN branches b ON b.id = bi.branch_id
         WHERE 1=1 ${isBranchScoped ? 'AND bi.branch_id = $1' : ''}
         GROUP BY b.id, b.name
         ORDER BY b.name`,
        branchParam
      ),
    ]);

    // Scalar calculations
    const Tc     = Number(collectionsCurrentResult.rows[0].total);
    const TcPrev = Number(collectionsPreviousResult.rows[0].total);
    const Ts     = Number(salesCurrentResult.rows[0].total);
    const TsPrev = Number(salesPreviousResult.rows[0].total);
    const Tob    = Number(outstandingResult.rows[0].total);

    const salesGrowthRate = TsPrev > 0
      ? Math.round(((Ts - TsPrev) / TsPrev) * 100 * 10) / 10 : null;
    const collectionGrowthRate = TcPrev > 0
      ? Math.round(((Tc - TcPrev) / TcPrev) * 100 * 10) / 10 : null;

    const totalVisits     = Number(visitResult.rows[0].total_visits)     || 0;
    const completedVisits = Number(visitResult.rows[0].completed_visits)  || 0;
    const salesTotal      = Number(visitResult.rows[0].sales_total)       || 0;
    const salesCompleted  = Number(visitResult.rows[0].sales_completed)   || 0;
    const routeCompliance      = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;
    const salesVisitCompletion = salesTotal  > 0 ? Math.round((salesCompleted  / salesTotal)  * 100) : 0;

    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const collectionByDay = {};
    collectionTrendResult.rows.forEach((r) => { collectionByDay[r.day] = Number(r.amount); });
    const salesByDay = {};
    salesTrendResult.rows.forEach((r) => { salesByDay[r.day] = Number(r.amount); });

    const collectionTrend = DAY_LABELS.map((d) => ({ day: d, amount: collectionByDay[d] || 0, target: 180000 }));
    const salesTrend      = DAY_LABELS.map((d) => ({ day: d, amount: salesByDay[d]      || 0, target: 230000 }));

    const invBranches     = inventoryBranchResult.rows;
    const totalProducts   = invBranches.reduce((s, b) => s + Number(b.product_count), 0);
    const totalOutOfStock = invBranches.reduce((s, b) => s + Number(b.out_of_stock),  0);
    const inventoryHealth = totalProducts > 0 ? Math.round(Math.max(0, 100 - (totalOutOfStock / totalProducts) * 100)) : 100;
    const stockAlerts     = invBranches.reduce((s, b) => s + Number(b.low_stock) + Number(b.out_of_stock), 0);

    return res.status(200).json({
      success: true,
      data: {
        totalCollections:        Tc,
        totalCollectionsCount:   Number(collectionsCurrentResult.rows[0].count),
        totalCollectionsPrevious: TcPrev,
        collectionGrowthRate,
        totalSales:              Ts,
        totalSalesCount:         Number(salesCurrentResult.rows[0].count),
        totalSalesPrevious:      TsPrev,
        salesGrowthRate,
        totalOutstandingBalance: Tob,
        overdueCount:            Number(outstandingResult.rows[0].overdue_count),
        totalCustomersWithActivity: Number(outstandingResult.rows[0].total_customers),
        totalCustomers:  Number(customerResult.rows[0].total),
        activeCustomers: Number(customerResult.rows[0].active),
        activeCollectors:      Number(staffResult.rows[0].collectors),
        activeSalesAgents:     Number(staffResult.rows[0].sales_agents),
        routeCompliance,
        salesVisitCompletion,
        inventoryHealth,
        stockAlerts,
        inventoryByBranch: invBranches.map((b) => ({
          branchId:       Number(b.branch_id),
          branchName:     b.branch_name,
          totalAvailable: Number(b.total_available),
          productCount:   Number(b.product_count),
          outOfStock:     Number(b.out_of_stock),
          lowStock:       Number(b.low_stock),
        })),
        collectionTrend,
        salesTrend,
        branchSummary: branchSummaryResult.rows.map((b) => ({
          branchId:         Number(b.id),
          branchName:       b.branch_name,
          totalCollections: Number(b.total_collections),
          totalSales:       Number(b.total_sales),
          totalOutstanding: Number(b.total_outstanding),
          customerCount:    Number(b.customer_count),
          activeCustomers:  Number(b.active_customers),
        })),
        period:      'current_month',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Reports] GET /executive error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch executive dashboard data.' });
  }
});
// ──────────────────────────────────────────────────────────────────────────────
router.get('/invoices', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);
    const { status, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (isBranchScoped) {
      conditions.push(`si.branch_id = $${pIdx++}`);
      params.push(bid);
    }
    if (status && status !== 'All') {
      conditions.push(`si.status = $${pIdx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(
      `SELECT
         si.sales_invoices_id,
         si.invoice_number,
         si.total_amount,
         si.status,
         si.invoices_date,
         si.due_date,
         si.notes,
         si.created_at,
         si.updated_at,
         si.customer_id,
         si.sales_agent_id,
         si.branch_id,
         si.payment_method_id,
         c.first_name || ' ' || c.last_name AS customer_name,
         agent.full_name                      AS sales_agent_name,
         b.name                               AS branch_name,
         pm.method_name                       AS payment_method
       FROM sales_invoices si
       LEFT JOIN customers c ON c.customer_id = si.customer_id
       LEFT JOIN users agent ON agent.id = si.sales_agent_id
       LEFT JOIN branches b ON b.id = si.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = si.payment_method_id
       ${where}
       ORDER BY si.invoices_date DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, Number(limit), offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sales_invoices si ${where}`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: Number(countResult.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(Number(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch (err) {
    console.error('[Reports] GET /invoices error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch invoices.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/performance-history
// Historical branch performance from performance_summary table.
// Returns total_sales, total_collections, inventory_accuracy grouped by branch
// and date — used for the Executive Dashboard historical trend chart.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/performance-history', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);
    const dateWindow = resolveAnalyticsWindow(req.query);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (isBranchScoped) {
      conditions.push(`ps.branch_id = $${pIdx++}`);
      params.push(bid);
    } else if (Number.isFinite(bid)) {
      conditions.push(`ps.branch_id = $${pIdx++}`);
      params.push(bid);
    }

    if (req.query.start_date || req.query.startDate || req.query.end_date || req.query.endDate || req.query.preset || req.query.range) {
      conditions.push(`ps.generated_at::date BETWEEN $${pIdx++} AND $${pIdx++}`);
      params.push(dateWindow.startDate, dateWindow.endDate);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         ps.branch_id,
         b.name AS branch_name,
         TO_CHAR(ps.generated_at, 'Mon DD') AS period,
         ps.generated_at,
         ps.total_sales,
         ps.total_collections,
         ps.inventory_accuracy
       FROM performance_summary ps
       JOIN branches b ON b.id = ps.branch_id
       ${whereClause}
       ORDER BY ps.generated_at DESC
       LIMIT 30`,
      params
    );

    const branches = [...new Set(result.rows.map((row) => row.branch_name))];
    const periods = [...new Set(result.rows.map((row) => row.period))].reverse();

    const byBranch = branches.map((branchName) => {
      const rows = result.rows.filter((row) => row.branch_name === branchName).reverse();
      return {
        branchName,
        data: rows.map((row) => ({
          period: row.period,
          totalSales: Number(row.total_sales),
          totalCollections: Number(row.total_collections),
          inventoryAccuracy: Number(row.inventory_accuracy),
        })),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        periods,
        byBranch,
        raw: result.rows,
      },
    });
  } catch (err) {
    console.error('[Reports] GET /performance-history error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch performance history.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/operating-manager
// Filtered descriptive analytics payload for the Operations Manager dashboard.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/operating-manager', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const dateWindow = resolveAnalyticsWindow(req.query);

    const branchId = user.branchId !== null
      ? Number(user.branchId)
      : (req.query.branch_id !== undefined && req.query.branch_id !== '' ? Number(req.query.branch_id) : null);

    if (Number.isNaN(branchId)) {
      return res.status(400).json({ success: false, message: 'branch_id must be numeric.' });
    }

    const branchFilter = Number.isFinite(branchId) ? `AND branch_id = ${branchId}` : '';
    const customerBranchFilter = Number.isFinite(branchId) ? `AND c.branch_id = ${branchId}` : '';
    const userBranchFilter = Number.isFinite(branchId) ? `AND u.branch_id = ${branchId}` : '';
    const inventoryBranchFilter = Number.isFinite(branchId) ? `AND bi.branch_id = ${branchId}` : '';
    const branchScopeLabel = Number.isFinite(branchId) ? 'Selected Branch' : 'All Branches';

    const currentWherePayment = `payment_date >= '${dateWindow.startDate}'::date AND payment_date <= '${dateWindow.endDate}'::date`;
    const previousWherePayment = `payment_date >= '${dateWindow.compareStartDate}'::date AND payment_date <= '${dateWindow.compareEndDate}'::date`;
    const currentWhereInvoice = `invoices_date >= '${dateWindow.startDate}'::date AND invoices_date <= '${dateWindow.endDate}'::date`;
    const previousWhereInvoice = `invoices_date >= '${dateWindow.compareStartDate}'::date AND invoices_date <= '${dateWindow.compareEndDate}'::date`;
    const currentWhereVisit = `scheduled_date >= '${dateWindow.startDate}'::date AND scheduled_date <= '${dateWindow.endDate}'::date`;

    const [
      collectionCurrentResult,
      collectionPreviousResult,
      salesCurrentResult,
      salesPreviousResult,
      outstandingResult,
      customerResult,
      staffResult,
      visitResult,
      collectionTrendResult,
      collectionPreviousTrendResult,
      salesTrendResult,
      salesPreviousTrendResult,
      branchSummaryResult,
      inventorySummaryResult,
      topCustomersResult,
      topProductsResult,
      topCategoriesResult,
      visitExceptionResult,
      lowStockResult,
      overdueAgingResult,
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM collection_payment WHERE ${currentWherePayment} ${branchFilter}`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM collection_payment WHERE ${previousWherePayment} ${branchFilter}`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count FROM sales_invoices WHERE ${currentWhereInvoice} ${branchFilter}`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count FROM sales_invoices WHERE ${previousWhereInvoice} ${branchFilter}`),
      pool.query(`SELECT COALESCE(SUM(ca.outstanding_balance), 0) AS total, COUNT(*) FILTER (WHERE ca.outstanding_balance > 0) AS overdue_count, COUNT(*) AS customer_count FROM customer_activity ca JOIN customers c ON c.customer_id = ca.customer_id WHERE 1=1 ${customerBranchFilter}`),
      pool.query(`SELECT COUNT(*) AS total_customers, COUNT(*) FILTER (WHERE c.status = 'Active') AS active_customers, COUNT(*) FILTER (WHERE c.status = 'Inactive') AS inactive_customers FROM customers c WHERE 1=1 ${customerBranchFilter}`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE r.slug = 'collector') AS active_collectors, COUNT(*) FILTER (WHERE r.slug = 'sales_staff') AS active_sales_agents, COUNT(*) FILTER (WHERE r.slug = 'branch_manager') AS branch_managers, COUNT(*) FILTER (WHERE r.slug = 'inventory_staff') AS inventory_staff FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.status = 'Active' ${userBranchFilter}`),
      pool.query(`SELECT COUNT(*) AS total_visits, COUNT(*) FILTER (WHERE fv.status = 'Completed') AS completed_visits, COUNT(*) FILTER (WHERE fv.visit_type = 'Collection') AS collection_visits, COUNT(*) FILTER (WHERE fv.visit_type = 'Sales') AS sales_visits, COUNT(*) FILTER (WHERE fv.visit_type = 'Collection' AND fv.status = 'Completed') AS completed_collection_visits, COUNT(*) FILTER (WHERE fv.visit_type = 'Sales' AND fv.status = 'Completed') AS completed_sales_visits FROM field_visits fv JOIN users u ON u.id = fv.user_id WHERE ${currentWhereVisit.replace(/scheduled_date/g, 'fv.scheduled_date')} ${userBranchFilter}`),
      pool.query(`SELECT TO_CHAR(payment_date, 'YYYY-MM-DD') AS day, COALESCE(SUM(amount), 0) AS amount FROM collection_payment WHERE ${currentWherePayment} ${branchFilter} GROUP BY TO_CHAR(payment_date, 'YYYY-MM-DD') ORDER BY day`),
      pool.query(`SELECT TO_CHAR(payment_date, 'YYYY-MM-DD') AS day, COALESCE(SUM(amount), 0) AS amount FROM collection_payment WHERE ${previousWherePayment} ${branchFilter} GROUP BY TO_CHAR(payment_date, 'YYYY-MM-DD') ORDER BY day`),
      pool.query(`SELECT TO_CHAR(invoices_date, 'YYYY-MM-DD') AS day, COALESCE(SUM(total_amount), 0) AS amount, COUNT(*) AS invoices FROM sales_invoices WHERE ${currentWhereInvoice} ${branchFilter} GROUP BY TO_CHAR(invoices_date, 'YYYY-MM-DD') ORDER BY day`),
      pool.query(`SELECT TO_CHAR(invoices_date, 'YYYY-MM-DD') AS day, COALESCE(SUM(total_amount), 0) AS amount, COUNT(*) AS invoices FROM sales_invoices WHERE ${previousWhereInvoice} ${branchFilter} GROUP BY TO_CHAR(invoices_date, 'YYYY-MM-DD') ORDER BY day`),
      pool.query(`SELECT b.id, b.name AS branch_name, COALESCE((SELECT SUM(cp.amount) FROM collection_payment cp WHERE cp.branch_id = b.id AND ${currentWherePayment.replace(/payment_date/g, 'cp.payment_date')}), 0) AS total_collections, COALESCE((SELECT SUM(si.total_amount) FROM sales_invoices si WHERE si.branch_id = b.id AND ${currentWhereInvoice.replace(/invoices_date/g, 'si.invoices_date')}), 0) AS total_sales, COALESCE((SELECT SUM(ca.outstanding_balance) FROM customers c2 JOIN customer_activity ca ON ca.customer_id = c2.customer_id WHERE c2.branch_id = b.id), 0) AS total_outstanding, (SELECT COUNT(*) FROM customers c3 WHERE c3.branch_id = b.id) AS customer_count, (SELECT COUNT(*) FROM customers c4 WHERE c4.branch_id = b.id AND c4.status = 'Active') AS active_customers, (SELECT COUNT(*) FROM branch_inventory bi WHERE bi.branch_id = b.id AND bi.available_stock <= bi.reorder_level) AS stock_alerts, (SELECT COUNT(*) FROM branch_inventory bi WHERE bi.branch_id = b.id AND bi.available_stock <= 0) AS stockouts, (SELECT COUNT(*) FROM field_visits fv JOIN users u ON u.id = fv.user_id WHERE u.branch_id = b.id AND ${currentWhereVisit.replace(/scheduled_date/g, 'fv.scheduled_date')}) AS total_visits, (SELECT COUNT(*) FROM field_visits fv JOIN users u ON u.id = fv.user_id WHERE u.branch_id = b.id AND fv.status = 'Completed' AND ${currentWhereVisit.replace(/scheduled_date/g, 'fv.scheduled_date')}) AS completed_visits FROM branches b WHERE b.status = 'Active' ${Number.isFinite(branchId) ? `AND b.id = ${branchId}` : ''} ORDER BY b.name`),
      pool.query(`SELECT b.id AS branch_id, b.name AS branch_name, COUNT(*) AS product_count, COALESCE(SUM(bi.available_stock), 0) AS total_available, COUNT(*) FILTER (WHERE bi.available_stock <= 0) AS out_of_stock, COUNT(*) FILTER (WHERE bi.available_stock <= bi.reorder_level AND bi.available_stock > 0) AS low_stock FROM branch_inventory bi JOIN branches b ON b.id = bi.branch_id WHERE 1=1 ${inventoryBranchFilter} GROUP BY b.id, b.name ORDER BY b.name`),
      pool.query(`SELECT c.customer_id, c.first_name || ' ' || c.last_name AS customer_name, b.name AS branch_name, ca.outstanding_balance, ca.purchase_volume, ca.last_collection_date, ca.last_sales_visit, COALESCE(CURRENT_DATE - ca.last_collection_date, 0) AS days_since_collection FROM customer_activity ca JOIN customers c ON c.customer_id = ca.customer_id JOIN branches b ON b.id = c.branch_id WHERE ca.outstanding_balance > 0 ${customerBranchFilter} ORDER BY ca.outstanding_balance DESC LIMIT 10`),
      pool.query(`SELECT p.id AS product_id, p.name AS product_name, COALESCE(pc.category_name, 'Uncategorized') AS category_name, SUM(sii.quantity) AS quantity_sold, COALESCE(SUM(sii.line_total), 0) AS revenue FROM sales_invoice_items sii JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id JOIN products p ON p.id = sii.product_id LEFT JOIN product_categories pc ON pc.category_id = p.category_id WHERE ${currentWhereInvoice.replace(/invoices_date/g, 'si.invoices_date')} ${branchFilter.replace(/branch_id/g, 'si.branch_id')} GROUP BY p.id, p.name, pc.category_name ORDER BY revenue DESC LIMIT 10`),
      pool.query(`SELECT COALESCE(pc.category_name, 'Uncategorized') AS category_name, SUM(sii.quantity) AS quantity_sold, COALESCE(SUM(sii.line_total), 0) AS revenue FROM sales_invoice_items sii JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id JOIN products p ON p.id = sii.product_id LEFT JOIN product_categories pc ON pc.category_id = p.category_id WHERE ${currentWhereInvoice.replace(/invoices_date/g, 'si.invoices_date')} ${branchFilter.replace(/branch_id/g, 'si.branch_id')} GROUP BY pc.category_name ORDER BY revenue DESC`),
      pool.query(`SELECT fv.visit_id, fv.customer_id, fv.user_id, fv.visit_type, fv.scheduled_date, fv.status, c.first_name || ' ' || c.last_name AS customer_name, u.first_name || ' ' || u.last_name AS staff_name, b.name AS branch_name FROM field_visits fv JOIN customers c ON c.customer_id = fv.customer_id JOIN users u ON u.id = fv.user_id JOIN branches b ON b.id = c.branch_id WHERE fv.status = 'Pending' AND fv.scheduled_date >= '${dateWindow.startDate}'::date AND fv.scheduled_date <= '${dateWindow.endDate}'::date ${Number.isFinite(branchId) ? `AND c.branch_id = ${branchId}` : ''} ORDER BY fv.scheduled_date ASC LIMIT 15`),
      pool.query(`SELECT p.name AS product_name, b.name AS branch_name, bi.available_stock, bi.reorder_level, CASE WHEN bi.available_stock <= 0 THEN 'Out of Stock' WHEN bi.available_stock <= bi.reorder_level THEN 'Low Stock' ELSE 'Sufficient' END AS status FROM branch_inventory bi JOIN products p ON p.id = bi.product_id JOIN branches b ON b.id = bi.branch_id WHERE bi.available_stock <= bi.reorder_level ${inventoryBranchFilter} ORDER BY bi.available_stock ASC LIMIT 20`),
      pool.query(`
        SELECT bucket, customer_count, total_balance
        FROM (
          SELECT
            CASE
              WHEN ca.last_collection_date IS NULL THEN 'Never Collected'
              WHEN CURRENT_DATE - ca.last_collection_date <= 30 THEN '0-30 Days'
              WHEN CURRENT_DATE - ca.last_collection_date <= 60 THEN '31-60 Days'
              WHEN CURRENT_DATE - ca.last_collection_date <= 90 THEN '61-90 Days'
              ELSE '90+ Days'
            END AS bucket,
            COUNT(*) AS customer_count,
            COALESCE(SUM(ca.outstanding_balance), 0) AS total_balance
          FROM customer_activity ca
          JOIN customers c ON c.customer_id = ca.customer_id
          WHERE ca.outstanding_balance > 0 ${customerBranchFilter}
          GROUP BY 1
        ) aging
        ORDER BY CASE bucket
          WHEN 'Never Collected' THEN 1
          WHEN '0-30 Days' THEN 2
          WHEN '31-60 Days' THEN 3
          WHEN '61-90 Days' THEN 4
          ELSE 5
        END
      `),
    ]);

    const collectionCurrent = Number(collectionCurrentResult.rows[0]?.total || 0);
    const collectionPrevious = Number(collectionPreviousResult.rows[0]?.total || 0);
    const salesCurrent = Number(salesCurrentResult.rows[0]?.total || 0);
    const salesPrevious = Number(salesPreviousResult.rows[0]?.total || 0);
    const outstandingTotal = Number(outstandingResult.rows[0]?.total || 0);
    const overdueCount = Number(outstandingResult.rows[0]?.overdue_count || 0);
    const totalCustomers = Number(customerResult.rows[0]?.total_customers || 0);
    const activeCustomers = Number(customerResult.rows[0]?.active_customers || 0);
    const activeCollectors = Number(staffResult.rows[0]?.active_collectors || 0);
    const activeSalesAgents = Number(staffResult.rows[0]?.active_sales_agents || 0);
    const routeCompliance = Number(visitResult.rows[0]?.total_visits || 0) > 0 ? Math.round((Number(visitResult.rows[0]?.completed_visits || 0) / Number(visitResult.rows[0]?.total_visits || 1)) * 100) : 0;
    const salesVisitCompletion = Number(visitResult.rows[0]?.sales_visits || 0) > 0 ? Math.round((Number(visitResult.rows[0]?.completed_sales_visits || 0) / Number(visitResult.rows[0]?.sales_visits || 1)) * 100) : 0;

    const collectionSeries = buildDateSeries(dateWindow.startDate, dateWindow.endDate, collectionTrendResult.rows, 'amount', 180000);
    const comparisonCollectionSeries = dateWindow.comparisonEnabled ? buildDateSeries(dateWindow.compareStartDate, dateWindow.compareEndDate, collectionPreviousTrendResult.rows, 'amount', 180000) : [];
    const salesSeries = buildDateSeries(dateWindow.startDate, dateWindow.endDate, salesTrendResult.rows, 'amount', 230000);
    const comparisonSalesSeries = dateWindow.comparisonEnabled ? buildDateSeries(dateWindow.compareStartDate, dateWindow.compareEndDate, salesPreviousTrendResult.rows, 'amount', 230000) : [];

    const branchSummary = branchSummaryResult.rows.map((row) => {
      const collections = Number(row.total_collections || 0);
      const sales = Number(row.total_sales || 0);
      const outstanding = Number(row.total_outstanding || 0);
      const visits = Number(row.total_visits || 0);
      const completedVisits = Number(row.completed_visits || 0);
      const compliance = visits > 0 ? Math.round((completedVisits / visits) * 100) : 0;
      const inventoryRow = inventorySummaryResult.rows.find((entry) => Number(entry.branch_id) === Number(row.id));
      const inventoryHealth = inventoryRow ? Math.round(Math.max(0, 100 - ((Number(inventoryRow.out_of_stock || 0) / Math.max(1, Number(inventoryRow.product_count || 0))) * 100))) : 100;

      return {
        branchId: Number(row.id),
        branchName: row.branch_name,
        totalCollections: collections,
        totalSales: sales,
        totalOutstanding: outstanding,
        customerCount: Number(row.customer_count || 0),
        activeCustomers: Number(row.active_customers || 0),
        routeCompliance: compliance,
        inventoryHealth,
        stockAlerts: Number(row.stock_alerts || 0),
        stockouts: Number(row.stockouts || 0),
        totalVisits: visits,
        completedVisits,
      };
    });

    const totalProducts = inventorySummaryResult.rows.reduce((sum, row) => sum + Number(row.product_count || 0), 0);
    const totalOutOfStock = inventorySummaryResult.rows.reduce((sum, row) => sum + Number(row.out_of_stock || 0), 0);
    const inventoryHealth = totalProducts > 0 ? Math.round(Math.max(0, 100 - ((totalOutOfStock / totalProducts) * 100))) : 100;
    const stockAlerts = inventorySummaryResult.rows.reduce((sum, row) => sum + Number(row.low_stock || 0) + Number(row.out_of_stock || 0), 0);
    const collectionsGrowthRate = dateWindow.comparisonEnabled && collectionPrevious > 0 ? Math.round((((collectionCurrent - collectionPrevious) / collectionPrevious) * 100) * 10) / 10 : null;
    const salesGrowthRate = dateWindow.comparisonEnabled && salesPrevious > 0 ? Math.round((((salesCurrent - salesPrevious) / salesPrevious) * 100) * 10) / 10 : null;
    const performanceScore = Math.max(0, Math.min(100, Math.round((routeCompliance * 0.25) + (salesVisitCompletion * 0.15) + (inventoryHealth * 0.2) + (Math.max(0, 100 - Math.min(100, overdueCount * 5)) * 0.2) + (Math.max(0, 100 - Math.min(100, stockAlerts * 2)) * 0.2))));

    return res.status(200).json({
      success: true,
      data: {
        filters: dateWindow,
        scope: branchScopeLabel,
        summary: {
          totalCollections: collectionCurrent,
          totalCollectionsPrevious: collectionPrevious,
          collectionGrowthRate: collectionsGrowthRate,
          totalSales: salesCurrent,
          totalSalesPrevious: salesPrevious,
          salesGrowthRate,
          totalOutstandingBalance: outstandingTotal,
          overdueCount,
          totalCustomers,
          activeCustomers,
          activeCollectors,
          activeSalesAgents,
          routeCompliance,
          salesVisitCompletion,
          inventoryHealth,
          stockAlerts,
          performanceScore,
        },
        comparison: {
          collectionsChange: collectionsGrowthRate,
          salesChange: salesGrowthRate,
          routeCompliance,
          salesVisitCompletion,
          inventoryHealth,
          outstandingBalance: outstandingTotal,
        },
        trends: {
          collections: collectionSeries,
          collectionsPrevious: comparisonCollectionSeries,
          sales: salesSeries,
          salesPrevious: comparisonSalesSeries,
        },
        branchSummary,
        inventoryByBranch: inventorySummaryResult.rows.map((row) => ({
          branchId: Number(row.branch_id),
          branchName: row.branch_name,
          totalAvailable: Number(row.total_available || 0),
          productCount: Number(row.product_count || 0),
          outOfStock: Number(row.out_of_stock || 0),
          lowStock: Number(row.low_stock || 0),
        })),
        topCustomers: topCustomersResult.rows.map((row) => ({
          customerId: Number(row.customer_id),
          customerName: row.customer_name,
          branchName: row.branch_name,
          outstandingBalance: Number(row.outstanding_balance || 0),
          purchaseVolume: Number(row.purchase_volume || 0),
          lastCollectionDate: row.last_collection_date,
          lastSalesVisit: row.last_sales_visit,
          daysSinceCollection: Number(row.days_since_collection || 0),
        })),
        topProducts: topProductsResult.rows.map((row) => ({
          productId: Number(row.product_id),
          productName: row.product_name,
          categoryName: row.category_name,
          quantitySold: Number(row.quantity_sold || 0),
          revenue: Number(row.revenue || 0),
        })),
        topCategories: topCategoriesResult.rows.map((row) => ({
          categoryName: row.category_name,
          quantitySold: Number(row.quantity_sold || 0),
          revenue: Number(row.revenue || 0),
        })),
        pendingVisits: visitExceptionResult.rows.map((row) => ({
          visitId: Number(row.visit_id),
          customerName: row.customer_name,
          staffName: row.staff_name,
          branchName: row.branch_name,
          visitType: row.visit_type,
          scheduledDate: row.scheduled_date,
          status: row.status,
        })),
        lowStockItems: lowStockResult.rows.map((row) => ({
          productName: row.product_name,
          branchName: row.branch_name,
          availableStock: Number(row.available_stock || 0),
          reorderLevel: Number(row.reorder_level || 0),
          status: row.status,
        })),
        overdueAging: overdueAgingResult.rows.map((row) => ({
          bucket: row.bucket,
          customerCount: Number(row.customer_count || 0),
          totalBalance: Number(row.total_balance || 0),
        })),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Reports] GET /operating-manager error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch operating manager analytics.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/invoices
// Paginated invoices for branch or executive review.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/invoices', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const isBranchScoped = user.branchId !== null;
    const bid = isBranchScoped ? user.branchId : (req.query.branch_id ? Number(req.query.branch_id) : null);
    const { status, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (isBranchScoped) {
      conditions.push(`si.branch_id = $${pIdx++}`);
      params.push(bid);
    }
    if (status && status !== 'All') {
      conditions.push(`si.status = $${pIdx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(
      `SELECT
         si.sales_invoices_id,
         si.invoice_number,
         si.total_amount,
         si.status,
         si.invoices_date,
         si.due_date,
         si.notes,
         si.created_at,
         si.updated_at,
         c.first_name || ' ' || c.last_name AS customer_name,
         agent.full_name                      AS sales_agent_name,
         b.name                               AS branch_name,
         pm.method_name                       AS payment_method
       FROM sales_invoices si
       LEFT JOIN customers c ON c.customer_id = si.customer_id
       LEFT JOIN users agent ON agent.id = si.sales_agent_id
       LEFT JOIN branches b ON b.id = si.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id = si.payment_method_id
       ${where}
       ORDER BY si.invoices_date DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, Number(limit), offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sales_invoices si ${where}`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: Number(countResult.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(Number(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch (err) {
    console.error('[Reports] GET /invoices error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch invoices.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/reports/credit-history
// Returns all credit_history rows with joins for customer name,
// sales invoice number, and collection receipt number.
// Branch-scoped automatically for branch-level roles.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/credit-history', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;

    // Branch scoping: branch-level roles see only their branch's customers
    const branchId = user.branchId !== null
      ? user.branchId
      : (req.query.branch_id ? Number(req.query.branch_id) : null);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (branchId !== null && Number.isFinite(Number(branchId))) {
      conditions.push(`c.branch_id = $${pIdx++}`);
      params.push(Number(branchId));
    }

    // Optional filters from query string
    if (req.query.customer_id) {
      conditions.push(`ch.customer_id = $${pIdx++}`);
      params.push(Number(req.query.customer_id));
    }
    if (req.query.payment_status && req.query.payment_status !== 'All') {
      conditions.push(`ch.payment_status = $${pIdx++}`);
      params.push(req.query.payment_status);
    }
    if (req.query.date_from) {
      conditions.push(`ch.transaction_date >= $${pIdx++}`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`ch.transaction_date <= $${pIdx++}`);
      params.push(req.query.date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         ch.credit_id,
         ch.customer_id,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         b.name   AS branch_name,
         ch.sales_id,
         si.invoice_number,
         ch.collection_id,
         cp.receipt_number,
         ch.previous_balance,
         ch.payment_amount,
         ch.remaining_balance,
         ch.payment_status,
         ch.transaction_date
       FROM credit_history ch
       JOIN customers c    ON c.customer_id            = ch.customer_id
       JOIN branches  b    ON b.id                     = c.branch_id
       LEFT JOIN sales_invoices      si ON si.sales_invoices_id     = ch.sales_id
       LEFT JOIN collection_payment  cp ON cp.collectionpayment_id  = ch.collection_id
       ${where}
       ORDER BY ch.transaction_date DESC, ch.credit_id DESC`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('[Reports] GET /credit-history error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch credit history.' });
  }
});

export default router;