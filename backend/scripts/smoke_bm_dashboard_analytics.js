/**
 * Smoke: BM dashboard analytics vs Reports KPI for one branch.
 * Usage: node backend/scripts/smoke_bm_dashboard_analytics.js [branchId]
 */
import 'dotenv/config';
import pg from 'pg';
import { loadBranchDashboardAnalytics } from '../lib/branchManagerDashboardAnalytics.js';
import {
  inventoryHealthPercent,
  rateAgainstDailyTarget,
  stockAlertsCount,
  STOCK_STATUS_CASE_SQL,
} from '../lib/inventoryHealth.js';
import { readPerformanceTargets } from '../lib/performanceTargets.js';
import { OVERDUE_CUSTOMER_SQL as OVERDUE_CUSTOMER } from '../lib/customerStanding.js';

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
  });

  try {
    let branchId = Number(process.argv[2]);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      const found = await pool.query(
        `SELECT u.branch_id
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE r.slug = 'branch_manager' AND u.branch_id IS NOT NULL
         ORDER BY u.id
         LIMIT 1`
      );
      branchId = Number(found.rows[0]?.branch_id);
    }
    if (!branchId) {
      console.error('No branch_manager branch found.');
      process.exit(1);
    }

    console.log('Branch', branchId);
    const dash = await loadBranchDashboardAnalytics(pool, branchId);
    const targets = await readPerformanceTargets(pool);

    const [coll, sales, inv, overdue] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM collection_payment
         WHERE branch_id = $1
           AND status = 'Completed'
           AND payment_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE - INTERVAL '6 days'`,
        [branchId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::float AS total
         FROM sales_invoices
         WHERE branch_id = $1
           AND status IN ('Confirmed', 'Pending Review')
           AND invoices_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE - INTERVAL '6 days'`,
        [branchId]
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
        [branchId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM customers c
         WHERE c.branch_id = $1 AND ${OVERDUE_CUSTOMER}`,
        [branchId]
      ),
    ]);

    const kpiCollectionRate = rateAgainstDailyTarget(coll.rows[0].total, targets.collectionDaily, 7);
    const kpiSalesRate = rateAgainstDailyTarget(sales.rows[0].total, targets.salesDaily, 7);
    const invRow = inv.rows[0];
    const kpiHealth = inventoryHealthPercent(invRow.sufficient_count, invRow.product_count);
    const kpiAlerts = stockAlertsCount({
      low: invRow.low_stock_count,
      critical: invRow.critical_count,
      outOfStock: invRow.stockout_count,
    });

    const checks = [
      ['collectionsAmount7d', dash.collectionsAmount7d, Number(coll.rows[0].total)],
      ['collectionRate', dash.collectionRate, kpiCollectionRate],
      ['salesAmount7d', dash.salesAmount7d, Number(sales.rows[0].total)],
      ['salesEfficiency', dash.salesEfficiency, kpiSalesRate],
      ['inventoryHealth', dash.inventoryHealth, kpiHealth],
      ['stockAlertsCount', dash.stockAlertsCount, kpiAlerts],
      ['overdueAccounts', dash.overdueAccounts, Number(overdue.rows[0].count)],
    ];

    let failed = 0;
    for (const [name, a, b] of checks) {
      const ok = Number(a) === Number(b);
      console.log(ok ? 'OK' : 'FAIL', name, a, 'vs', b);
      if (!ok) failed += 1;
    }

    console.log('PoP collections', dash.collectionsPeriodComparison);
    console.log('PoP sales', dash.salesPeriodComparison);
    console.log('pendingCI', dash.pendingCI);
    console.log('visitCompletion', {
      collector: dash.collectorVisitCompletion,
      sales: dash.salesVisitCompletion,
      totals: [dash.collectorVisitsCompleted, dash.collectorVisitsTotal, dash.salesVisitsCompleted, dash.salesVisitsTotal],
    });
    console.log('aging buckets', dash.overdueAging);
    console.log('top overdue', dash.topOverdueCustomers.length);
    console.log('inventory attention', dash.inventoryAttention.length);
    console.log('todayDispatch', dash.todayDispatch);

    if (failed) {
      console.error(`FAILED ${failed} consistency checks`);
      process.exit(1);
    }
    console.log('All consistency checks passed.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
