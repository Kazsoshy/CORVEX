/**
 * Branch Manager Dashboard command-center analytics.
 * Shared formulas with Reports / KPI:
 *   Collection Rate  = confirmed collections ÷ (daily collection target × days)
 *   Sales vs Target  = counted invoice revenue ÷ (daily sales target × days)
 *   Inventory Health = Sufficient ÷ eligible branch_inventory rows
 *   Stock Alerts     = Low + Critical + Out (mutually exclusive bands)
 *   Overdue Accounts = OVERDUE_CUSTOMER_SQL (unpaid past-due invoice)
 *   Visit Completion = completed visits ÷ assigned visits in period (N/A if 0 assigned)
 *   Pending CI       = Approval Center queue (Pending + Revision Requested)
 */

import {
  inventoryHealthPercent,
  rateAgainstDailyTarget,
  stockAlertsCount,
  STOCK_STATUS_CASE_SQL,
  STOCK_STATUS_CASE_SQL_BI,
} from './inventoryHealth.js';
import { readPerformanceTargets } from './performanceTargets.js';
import { readCreditExposure } from './creditExposure.js';
import { OVERDUE_CUSTOMER_SQL as OVERDUE_CUSTOMER } from './customerStanding.js';

const COUNTED_INVOICE_STATUS = `status IN ('Confirmed', 'Pending Review')`;

function manilaTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) {
    return {
      changePct: null,
      direction: cur === 0 ? 'flat' : 'n/a',
    };
  }
  const changePct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return {
    changePct,
    direction: changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat',
  };
}

function visitRate(completed, total) {
  const assigned = Number(total) || 0;
  if (assigned <= 0) return null;
  return Math.round(((Number(completed) || 0) / assigned) * 1000) / 10;
}

const OVERDUE_INVOICE_CTE = `
  overdue_invoices AS (
    SELECT
      si.sales_invoices_id,
      si.customer_id,
      GREATEST(si.total_amount - COALESCE(paid.paid, 0), 0)::float AS overdue_amount,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - si.due_date::date)::int AS days_overdue
    FROM sales_invoices si
    JOIN customers c ON c.customer_id = si.customer_id
    LEFT JOIN (
      SELECT sales_id, SUM(payment_amount)::float AS paid
      FROM credit_history
      WHERE sales_id IS NOT NULL
      GROUP BY sales_id
    ) paid ON paid.sales_id = si.sales_invoices_id
    WHERE c.branch_id = $1
      AND si.status IN ('Confirmed', 'Pending Review')
      AND si.due_date IS NOT NULL
      AND si.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
      AND COALESCE(paid.paid, 0) < si.total_amount
  )
`;

/**
 * @param {import('pg').Pool} pool
 * @param {number} branchId
 */
export async function loadBranchDashboardAnalytics(pool, branchId) {
  const bid = Number(branchId);
  if (!Number.isInteger(bid) || bid <= 0) {
    throw new Error('Assigned branch required.');
  }

  const today = manilaTodayYmd();
  const currentStart = addDaysYmd(today, -6);
  const previousEnd = addDaysYmd(today, -7);
  const previousStart = addDaysYmd(today, -13);
  const params = [bid];
  const periodParams = [bid, currentStart, today];
  const prevParams = [bid, previousStart, previousEnd];

  const targets = await readPerformanceTargets(pool);

  const [
    collections7d,
    collectionsPrev7d,
    collectionsToday,
    sales7d,
    salesPrev7d,
    salesToday,
    staffResult,
    customerResult,
    inventoryResult,
    pendingCiResult,
    visits7d,
    todayDispatch,
    pendingVisits,
    overdueAging,
    topOverdue,
    stockAttention,
    collectionChart,
    salesChart,
    credit,
  ] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM collection_payment
       WHERE branch_id = $1
         AND status = 'Completed'
         AND payment_date >= $2::date
         AND payment_date <= $3::date`,
      periodParams
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM collection_payment
       WHERE branch_id = $1
         AND status = 'Completed'
         AND payment_date >= $2::date
         AND payment_date <= $3::date`,
      prevParams
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM collection_payment
       WHERE branch_id = $1
         AND status = 'Completed'
         AND payment_date = $2::date`,
      [bid, today]
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float AS total
       FROM sales_invoices
       WHERE branch_id = $1
         AND ${COUNTED_INVOICE_STATUS}
         AND invoices_date >= $2::date
         AND invoices_date <= $3::date`,
      periodParams
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float AS total
       FROM sales_invoices
       WHERE branch_id = $1
         AND ${COUNTED_INVOICE_STATUS}
         AND invoices_date >= $2::date
         AND invoices_date <= $3::date`,
      prevParams
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float AS total
       FROM sales_invoices
       WHERE branch_id = $1
         AND ${COUNTED_INVOICE_STATUS}
         AND invoices_date = $2::date`,
      [bid, today]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE u.status = 'Active' AND r.slug = 'collector')::int AS active_collectors,
         COUNT(*) FILTER (WHERE u.status = 'Active' AND r.slug = 'sales_staff')::int AS active_sales_agents
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.branch_id = $1`,
      params
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_customers,
         COUNT(*) FILTER (WHERE c.status = 'Active')::int AS active_customers,
         COALESCE(SUM(ca.outstanding_balance), 0)::float AS total_outstanding,
         COUNT(*) FILTER (WHERE ${OVERDUE_CUSTOMER})::int AS overdue_count
       FROM customers c
       LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
       WHERE c.branch_id = $1`,
      params
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS product_count,
         COUNT(*) FILTER (WHERE (${STOCK_STATUS_CASE_SQL}) = 'Out of Stock')::int AS stockout_count,
         COUNT(*) FILTER (WHERE (${STOCK_STATUS_CASE_SQL}) = 'Low Stock')::int AS low_stock_count,
         COUNT(*) FILTER (WHERE (${STOCK_STATUS_CASE_SQL}) = 'Critical Stock')::int AS critical_count,
         COUNT(*) FILTER (WHERE (${STOCK_STATUS_CASE_SQL}) = 'Sufficient')::int AS sufficient_count
       FROM branch_inventory
       WHERE branch_id = $1`,
      params
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM credit_investigations ci
       WHERE ci.branch_id = $1
         AND ci.status IN ('Pending', 'Revision Requested')`,
      params
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE fv.visit_type = 'Collection')::int AS collector_assigned,
         COUNT(*) FILTER (WHERE fv.visit_type = 'Collection' AND fv.status = 'Completed')::int AS collector_completed,
         COUNT(*) FILTER (WHERE fv.visit_type = 'Sales')::int AS sales_assigned,
         COUNT(*) FILTER (WHERE fv.visit_type = 'Sales' AND fv.status = 'Completed')::int AS sales_completed
       FROM field_visits fv
       JOIN users u ON u.id = fv.user_id
       WHERE u.branch_id = $1
         AND fv.scheduled_date >= $2::date
         AND fv.scheduled_date <= $3::date`,
      periodParams
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS assigned,
         COUNT(*) FILTER (WHERE fv.status = 'Completed')::int AS completed,
         COUNT(*) FILTER (WHERE fv.status IN ('Scheduled', 'In Progress', 'Pending'))::int AS remaining
       FROM field_visits fv
       JOIN users u ON u.id = fv.user_id
       WHERE u.branch_id = $1
         AND fv.scheduled_date = $2::date`,
      [bid, today]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE fv.status IN ('Scheduled', 'In Progress', 'Pending')
             AND fv.scheduled_date = $2::date
         )::int AS pending_today,
         COUNT(*) FILTER (
           WHERE fv.status IN ('Scheduled', 'In Progress', 'Pending')
             AND fv.scheduled_date < $2::date
         )::int AS missed_or_overdue,
         COUNT(*) FILTER (
           WHERE fv.status IN ('Scheduled', 'In Progress', 'Pending')
             AND fv.scheduled_date > $2::date
             AND fv.scheduled_date <= $2::date + INTERVAL '7 days'
         )::int AS upcoming
       FROM field_visits fv
       JOIN users u ON u.id = fv.user_id
       WHERE u.branch_id = $1`,
      [bid, today]
    ),
    pool.query(
      `WITH ${OVERDUE_INVOICE_CTE}
       SELECT
         CASE
           WHEN days_overdue <= 7 THEN '0-7'
           WHEN days_overdue <= 30 THEN '8-30'
           WHEN days_overdue <= 60 THEN '31-60'
           ELSE '60+'
         END AS bucket,
         COUNT(*)::int AS invoice_count,
         COUNT(DISTINCT customer_id)::int AS customer_count,
         COALESCE(SUM(overdue_amount), 0)::float AS overdue_amount
       FROM overdue_invoices
       GROUP BY 1
       ORDER BY MIN(days_overdue)`,
      params
    ),
    pool.query(
      `WITH ${OVERDUE_INVOICE_CTE},
       rolled AS (
         SELECT
           customer_id,
           SUM(overdue_amount)::float AS overdue_amount,
           MAX(days_overdue)::int AS days_overdue
         FROM overdue_invoices
         GROUP BY customer_id
       )
       SELECT
         c.customer_id,
         c.customer_code,
         TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS customer_name,
         COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance,
         r.overdue_amount,
         r.days_overdue,
         TRIM(CONCAT(COALESCE(sa.first_name, ''), ' ', COALESCE(sa.last_name, ''))) AS sales_agent_name
       FROM rolled r
       JOIN customers c ON c.customer_id = r.customer_id
       LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
       LEFT JOIN users sa ON sa.id = c.assigned_sales_agent_id
       WHERE c.branch_id = $1
       ORDER BY r.overdue_amount DESC, r.days_overdue DESC, customer_name ASC
       LIMIT 5`,
      params
    ),
    pool.query(
      `SELECT
         p.id AS product_id,
         p.sku,
         COALESCE(NULLIF(TRIM(p.name), ''), p.sku, 'Product') AS product_name,
         COALESCE(bi.available_stock, 0)::float AS available_stock,
         COALESCE(bi.reorder_level, 0)::float AS reorder_level,
         (${STOCK_STATUS_CASE_SQL_BI}) AS stock_status
       FROM branch_inventory bi
       JOIN products p ON p.id = bi.product_id
       WHERE bi.branch_id = $1
         AND (${STOCK_STATUS_CASE_SQL_BI}) IN ('Out of Stock', 'Critical Stock', 'Low Stock')
       ORDER BY
         CASE (${STOCK_STATUS_CASE_SQL_BI})
           WHEN 'Out of Stock' THEN 0
           WHEN 'Critical Stock' THEN 1
           ELSE 2
         END,
         COALESCE(bi.available_stock, 0) ASC,
         product_name ASC
       LIMIT 8`,
      params
    ),
    pool.query(
      `SELECT d.day::date AS date,
              COALESCE(SUM(cp.amount), 0)::float AS actual
       FROM generate_series($2::date, $3::date, '1 day') AS d(day)
       LEFT JOIN collection_payment cp
         ON cp.payment_date::date = d.day::date
        AND cp.status = 'Completed'
        AND cp.branch_id = $1
       GROUP BY d.day
       ORDER BY d.day`,
      periodParams
    ),
    pool.query(
      `SELECT d.day::date AS date,
              COALESCE(SUM(si.total_amount), 0)::float AS actual
       FROM generate_series($2::date, $3::date, '1 day') AS d(day)
       LEFT JOIN sales_invoices si
         ON si.invoices_date::date = d.day::date
        AND si.status IN ('Confirmed', 'Pending Review')
        AND si.branch_id = $1
       GROUP BY d.day
       ORDER BY d.day`,
      periodParams
    ),
    readCreditExposure(pool, bid),
  ]);

  const collectionsAmount7d = Number(collections7d.rows[0]?.total) || 0;
  const collectionsAmountPrev7d = Number(collectionsPrev7d.rows[0]?.total) || 0;
  const salesAmount7d = Number(sales7d.rows[0]?.total) || 0;
  const salesAmountPrev7d = Number(salesPrev7d.rows[0]?.total) || 0;
  const collectionRate = rateAgainstDailyTarget(collectionsAmount7d, targets.collectionDaily, 7);
  const salesEfficiency = rateAgainstDailyTarget(salesAmount7d, targets.salesDaily, 7);
  const collectionTarget7d = Math.round(Number(targets.collectionDaily) * 7 * 100) / 100;
  const salesTarget7d = Math.round(Number(targets.salesDaily) * 7 * 100) / 100;

  const inventory = inventoryResult.rows[0] || {};
  const customers = customerResult.rows[0] || {};
  const staff = staffResult.rows[0] || {};
  const visits = visits7d.rows[0] || {};
  const dispatch = todayDispatch.rows[0] || { assigned: 0, completed: 0, remaining: 0 };
  const fieldPending = pendingVisits.rows[0] || {
    pending_today: 0,
    missed_or_overdue: 0,
    upcoming: 0,
  };

  const alerts = stockAlertsCount({
    low: inventory.low_stock_count,
    critical: inventory.critical_count,
    outOfStock: inventory.stockout_count,
  });

  const overdueExposureRow = await pool.query(
    `WITH ${OVERDUE_INVOICE_CTE}
     SELECT COALESCE(SUM(overdue_amount), 0)::float AS amount
     FROM overdue_invoices`,
    params
  );

  const collectionsPoP = pctChange(collectionsAmount7d, collectionsAmountPrev7d);
  const salesPoP = pctChange(salesAmount7d, salesAmountPrev7d);
  const creditUtilization = credit.totalCreditLimit > 0
    ? Math.round((Number(credit.creditUsed) / Number(credit.totalCreditLimit)) * 1000) / 10
    : null;

  const agingOrder = ['0-7', '8-30', '31-60', '60+'];
  const agingMap = Object.fromEntries((overdueAging.rows || []).map((row) => [row.bucket, row]));
  const overdueAgingBuckets = agingOrder.map((bucket) => ({
    bucket,
    invoiceCount: Number(agingMap[bucket]?.invoice_count) || 0,
    customerCount: Number(agingMap[bucket]?.customer_count) || 0,
    overdueAmount: Number(agingMap[bucket]?.overdue_amount) || 0,
  }));

  const collectorVisitCompletion = visitRate(visits.collector_completed, visits.collector_assigned);
  const salesVisitCompletion = visitRate(visits.sales_completed, visits.sales_assigned);

  return {
    asOfDate: today,
    period: {
      label: 'Last 7 Days',
      currentStart,
      currentEnd: today,
      previousStart,
      previousEnd,
      days: 7,
    },
    // Financial
    totalCollectionsToday: Number(collectionsToday.rows[0]?.total) || 0,
    collectionsAmount7d,
    collectionRate,
    collectionRateToday: collectionRate,
    collectionEfficiency: collectionRate,
    collectionTargetDaily: targets.collectionDaily,
    collectionTarget7d,
    totalSalesToday: Number(salesToday.rows[0]?.total) || 0,
    salesAmount7d,
    salesEfficiency,
    salesTargetDaily: targets.salesDaily,
    salesTarget7d,
    collectionsPeriodComparison: {
      currentAmount: collectionsAmount7d,
      previousAmount: collectionsAmountPrev7d,
      ...collectionsPoP,
      currentStart,
      currentEnd: today,
      previousStart,
      previousEnd,
    },
    salesPeriodComparison: {
      currentAmount: salesAmount7d,
      previousAmount: salesAmountPrev7d,
      ...salesPoP,
      currentStart,
      currentEnd: today,
      previousStart,
      previousEnd,
    },
    // Credit / risk
    overdueAccounts: Number(customers.overdue_count) || 0,
    overdueCount: Number(customers.overdue_count) || 0,
    overdueExposure: Number(overdueExposureRow.rows[0]?.amount) || 0,
    totalOutstanding: Number(customers.total_outstanding) || 0,
    pendingCI: Number(pendingCiResult.rows[0]?.count) || 0,
    pendingCreditInvestigations: Number(pendingCiResult.rows[0]?.count) || 0,
    totalCreditLimit: credit.totalCreditLimit,
    creditUsed: credit.creditUsed,
    creditRemaining: credit.creditRemaining,
    creditUtilization,
    // Inventory
    inventoryHealth: inventoryHealthPercent(inventory.sufficient_count, inventory.product_count),
    inventoryHealthyCount: Number(inventory.sufficient_count) || 0,
    inventoryEligibleCount: Number(inventory.product_count) || 0,
    stockAlertsCount: alerts,
    stockAlerts: alerts,
    // Field ops
    activeCollectors: Number(staff.active_collectors) || 0,
    activeSalesAgents: Number(staff.active_sales_agents) || 0,
    visitCompletionRate: collectorVisitCompletion,
    collectorVisitCompletion,
    routeCompliance: collectorVisitCompletion,
    collectorVisitsCompleted: Number(visits.collector_completed) || 0,
    collectorVisitsTotal: Number(visits.collector_assigned) || 0,
    salesVisitCompletion,
    salesVisitsCompleted: Number(visits.sales_completed) || 0,
    salesVisitsTotal: Number(visits.sales_assigned) || 0,
    todayDispatch: {
      assigned: Number(dispatch.assigned) || 0,
      completed: Number(dispatch.completed) || 0,
      remaining: Number(dispatch.remaining) || 0,
    },
    pendingFieldVisits: {
      pendingToday: Number(fieldPending.pending_today) || 0,
      missedOrOverdue: Number(fieldPending.missed_or_overdue) || 0,
      upcoming: Number(fieldPending.upcoming) || 0,
    },
    // Risk panels
    overdueAging: overdueAgingBuckets,
    topOverdueCustomers: (topOverdue.rows || []).map((row) => ({
      customerId: row.customer_id,
      customerCode: row.customer_code,
      customerName: row.customer_name || row.customer_code || `Customer ${row.customer_id}`,
      outstandingBalance: Number(row.outstanding_balance) || 0,
      overdueAmount: Number(row.overdue_amount) || 0,
      daysOverdue: Number(row.days_overdue) || 0,
      salesAgentName: row.sales_agent_name?.trim() || null,
    })),
    inventoryAttention: (stockAttention.rows || []).map((row) => ({
      productId: row.product_id,
      sku: row.sku,
      productName: row.product_name,
      availableStock: Number(row.available_stock) || 0,
      reorderLevel: Number(row.reorder_level) || 0,
      stockStatus: row.stock_status,
    })),
    collectionChart: (collectionChart.rows || []).map((r) => ({
      date: r.date,
      actual: Number(r.actual) || 0,
      target: targets.collectionDaily,
    })),
    salesChart: (salesChart.rows || []).map((r) => ({
      date: r.date,
      actual: Number(r.actual) || 0,
      target: targets.salesDaily,
    })),
    // Snapshot only — no fabricated historical overdue census
    overdueTrend: [
      {
        label: 'As of now',
        count: Number(customers.overdue_count) || 0,
        asOfDate: today,
      },
    ],
    periodDays: 7,
    periodLabel: 'Last 7 days',
  };
}
