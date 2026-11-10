/**
 * Branch Manager / OM staff performance evaluation metrics.
 * Period-scoped, role-separated, branch-attributed where possible.
 */
import { manilaDateString } from './sawCollection.js';

export function staffPerformancePeriodRange(periodRaw) {
  const period = String(periodRaw || 'week').toLowerCase();
  const today = manilaDateString();
  if (period === 'month') {
    const [year, month] = today.split('-');
    return {
      period: 'month',
      start: `${year}-${month}-01`,
      end: today,
      label: 'This Month',
    };
  }
  // Default: This Week (Mon → today, Manila)
  const current = new Date(`${today}T12:00:00+08:00`);
  const day = current.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  current.setDate(current.getDate() - mondayOffset);
  return {
    period: 'week',
    start: manilaDateString(current),
    end: today,
    label: 'This Week',
  };
}

function pctOrNull(numerator, denominator) {
  const den = Number(denominator) || 0;
  if (den <= 0) return null;
  return Math.round((Number(numerator) / den) * 100);
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ branchScoped: boolean, bid: number|null, period?: string }} opts
 */
export async function loadStaffPerformance(pool, opts) {
  const { branchScoped, bid } = opts;
  const range = staffPerformancePeriodRange(opts.period);
  const today = manilaDateString();

  const staffResult = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.status, u.employee_id,
            u.branch_id, b.name AS branch_name,
            r.slug AS role_slug
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE r.slug IN ('collector', 'sales_staff')
       AND COALESCE(u.status, 'Active') = 'Active'
       ${branchScoped ? 'AND u.branch_id = $1' : ''}
     ORDER BY r.slug, u.first_name, u.last_name`,
    branchScoped ? [bid] : []
  );

  const collectors = [];
  const salesAgents = [];

  for (const u of staffResult.rows) {
    if (u.role_slug === 'collector') {
      collectors.push(await buildCollectorMetrics(pool, u, range, today, branchScoped, bid));
    } else {
      salesAgents.push(await buildSalesAgentMetrics(pool, u, range, today, branchScoped, bid));
    }
  }

  rankCollectors(collectors);
  rankSalesAgents(salesAgents);

  return {
    period: range.period,
    periodLabel: range.label,
    dateFrom: range.start,
    dateTo: range.end,
    branchScoped,
    branchId: bid ?? null,
    collectors,
    salesAgents,
  };
}

async function buildCollectorMetrics(pool, u, range, today, branchScoped, bid) {
  // Attribute visits through customer branch when BM-scoped; also keep staff as assignee.
  const visitParams = [u.id, range.start, range.end, today];
  let visitBranchSql = '';
  if (branchScoped) {
    visitParams.push(bid);
    visitBranchSql = 'AND c.branch_id = $5';
  }

  const visits = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE fv.status IN ('Pending', 'Completed')
       )::int AS valid_assigned,
       COUNT(*) FILTER (WHERE fv.status = 'Completed')::int AS completed,
       COUNT(*) FILTER (
         WHERE fv.status = 'Pending'
           AND fv.scheduled_date < $4::date
       )::int AS missed
     FROM field_visits fv
     JOIN customers c ON c.customer_id = fv.customer_id
     WHERE fv.user_id = $1
       AND fv.visit_type = 'Collection'
       AND fv.scheduled_date >= $2::date
       AND fv.scheduled_date <= $3::date
       ${visitBranchSql}`,
    visitParams
  );

  const payParams = [u.id, range.start, range.end];
  let payBranchSql = '';
  if (branchScoped) {
    payParams.push(bid);
    payBranchSql = 'AND c.branch_id = $4';
  }

  const payments = await pool.query(
    `SELECT COALESCE(SUM(cp.amount), 0)::float AS collected
     FROM collection_payment cp
     JOIN customers c ON c.customer_id = cp.customer_id
     WHERE cp.collector_id = $1
       AND cp.status = 'Completed'
       AND cp.payment_date >= $2::date
       AND cp.payment_date <= $3::date
       ${payBranchSql}`,
    payParams
  );

  const validAssigned = Number(visits.rows[0]?.valid_assigned) || 0;
  const completed = Number(visits.rows[0]?.completed) || 0;
  const missed = Number(visits.rows[0]?.missed) || 0;
  const collected = Number(payments.rows[0]?.collected) || 0;
  const visitCompletion = pctOrNull(completed, validAssigned);

  return {
    id: String(u.id),
    name: `${u.first_name} ${u.last_name}`.trim(),
    employeeCode: u.employee_id || null,
    status: u.status || 'Active',
    branchId: u.branch_id ?? null,
    branchName: u.branch_name || null,
    visitCompletion,
    visitsAssigned: validAssigned,
    visitsCompleted: completed,
    collectedAmount: collected,
    missedVisits: missed,
    rank: null,
  };
}

async function buildSalesAgentMetrics(pool, u, range, today, branchScoped, bid) {
  const visitParams = [u.id, range.start, range.end, today];
  let visitBranchSql = '';
  if (branchScoped) {
    visitParams.push(bid);
    visitBranchSql = 'AND c.branch_id = $5';
  }

  const visits = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE fv.status IN ('Pending', 'Completed')
       )::int AS valid_assigned,
       COUNT(*) FILTER (WHERE fv.status = 'Completed')::int AS completed,
       COUNT(*) FILTER (
         WHERE fv.status = 'Pending'
           AND fv.scheduled_date < $4::date
       )::int AS missed
     FROM field_visits fv
     JOIN customers c ON c.customer_id = fv.customer_id
     WHERE fv.user_id = $1
       AND fv.visit_type = 'Sales'
       AND fv.scheduled_date >= $2::date
       AND fv.scheduled_date <= $3::date
       ${visitBranchSql}`,
    visitParams
  );

  const invParams = [u.id, range.start, range.end];
  let invBranchSql = '';
  if (branchScoped) {
    invParams.push(bid);
    invBranchSql = 'AND c.branch_id = $4';
  }

  const invoices = await pool.query(
    `SELECT COALESCE(SUM(si.total_amount), 0)::float AS revenue
     FROM sales_invoices si
     JOIN customers c ON c.customer_id = si.customer_id
     WHERE si.sales_agent_id = $1
       AND si.status = 'Confirmed'
       AND si.invoices_date >= $2::date
       AND si.invoices_date <= $3::date
       ${invBranchSql}`,
    invParams
  );

  const custParams = [u.id, range.start, range.end];
  let custBranchSql = '';
  if (branchScoped) {
    custParams.push(bid);
    custBranchSql = 'AND branch_id = $4';
  }

  const newCustomers = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM customers
     WHERE assigned_sales_agent_id = $1
       AND (created_at AT TIME ZONE 'Asia/Manila')::date >= $2::date
       AND (created_at AT TIME ZONE 'Asia/Manila')::date <= $3::date
       ${custBranchSql}`,
    custParams
  );

  const validAssigned = Number(visits.rows[0]?.valid_assigned) || 0;
  const completed = Number(visits.rows[0]?.completed) || 0;
  const missed = Number(visits.rows[0]?.missed) || 0;
  const confirmedRevenue = Number(invoices.rows[0]?.revenue) || 0;
  const newCust = Number(newCustomers.rows[0]?.count) || 0;
  const visitCompletion = pctOrNull(completed, validAssigned);

  return {
    id: String(u.id),
    name: `${u.first_name} ${u.last_name}`.trim(),
    employeeCode: u.employee_id || null,
    status: u.status || 'Active',
    branchId: u.branch_id ?? null,
    branchName: u.branch_name || null,
    visitCompletion,
    visitsAssigned: validAssigned,
    visitsCompleted: completed,
    missedVisits: missed,
    confirmedRevenue,
    newCustomers: newCust,
    rank: null,
  };
}

function compareNullablePctDesc(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function rankCollectors(rows) {
  rows.sort((a, b) => {
    const byCompletion = compareNullablePctDesc(a.visitCompletion, b.visitCompletion);
    if (byCompletion !== 0) return byCompletion;
    if (b.collectedAmount !== a.collectedAmount) return b.collectedAmount - a.collectedAmount;
    return a.missedVisits - b.missedVisits;
  });
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
}

function rankSalesAgents(rows) {
  rows.sort((a, b) => {
    if (b.confirmedRevenue !== a.confirmedRevenue) return b.confirmedRevenue - a.confirmedRevenue;
    const byCompletion = compareNullablePctDesc(a.visitCompletion, b.visitCompletion);
    if (byCompletion !== 0) return byCompletion;
    return b.newCustomers - a.newCustomers;
  });
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
}
