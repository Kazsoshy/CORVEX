import express from 'express';
import { requireAuth, requireRole, requireAssignedBranch, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import {
  computeCollectorSawPriority,
  previewCollectionRoute,
  assignCollectionVisits,
  getCollectionAssignmentsForDate,
  mapSawPriorityRow,
} from '../lib/sawCollectionData.js';
import { manilaDateString } from '../lib/sawCollection.js';
import { buildCollectorSawRoad } from '../lib/sawRoad.js';
import { notifyScheduleAssigned, notifyAreaScheduleAssigned } from '../lib/operationalNotifications.js';
import { loadBranchDashboardAnalytics } from '../lib/branchManagerDashboardAnalytics.js';
import {
  AREA_ASSIGNMENT_FROM,
  AREA_ASSIGNMENT_SELECT,
  findAreaAssignmentConflicts,
  isValidDate,
  loadAssignmentProducts,
  positiveInteger,
  withProducts,
} from '../lib/salesAreaAssignments.js';
import {
  OVERDUE_CUSTOMER_SQL as OVERDUE_CUSTOMER,
  paymentStandingFromFlags,
} from '../lib/customerStanding.js';
import {
  FAR_FROM_SQL,
  FAR_SELECT_COLUMNS,
  FAR_WORK_DATE_SQL,
  mapFarRow,
} from '../lib/fieldActivityReports.js';
import { loadStaffPerformance } from '../lib/staffPerformance.js';

const router = express.Router();
router.use(requireRole(ROLE_SETS.branchOps), requireAssignedBranch);

function scopeUser(user) {
  const branchScoped = user.branchId != null && !isUnscoped(user);
  return { branchScoped, bid: user.branchId };
}

async function assertStaffInBranch(pool, user, staffId, roleSlug) {
  const { branchScoped, bid } = scopeUser(user);
  const params = [staffId, roleSlug];
  // Branch isolation is mandatory. Status is not required here so BM can open
  // Inactive collectors on the dispatch roster (assignment APIs still validate).
  let sql = `SELECT u.id, u.status FROM users u JOIN roles r ON r.role_id = u.role_id
             WHERE u.id = $1 AND r.slug = $2`;
  if (branchScoped) {
    sql += ' AND u.branch_id = $3';
    params.push(bid);
  }
  const found = await pool.query(sql, params);
  return found.rows.length > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/analytics
// Branch Manager Dashboard command-center payload (authorized branch only)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped, bid } = scopeUser(user);

    if (!branchScoped || bid == null) {
      return res.status(403).json({ success: false, message: 'Assigned branch required.' });
    }

    const data = await loadBranchDashboardAnalytics(pool, bid);
    return res.status(200).json({ success: true, data });
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

    const { branchScoped: isBranchScoped, bid } = scopeUser(user);
    const dispatchDate = String(req.query.date || req.query.scheduled_date || manilaDateString()).slice(0, 10);

    // Collectors + Sales Agents: include Active/Inactive for dispatch roster filters.
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.status, u.phone, u.employee_id,
              u.created_at, u.branch_id, b.name AS branch_name,
              r.slug AS role_slug
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE r.slug IN ('collector', 'sales_staff')
         ${isBranchScoped ? 'AND u.branch_id = $1' : ''}
       ORDER BY r.slug, u.first_name`,
      isBranchScoped ? [bid] : []
    );

    const collectors = await Promise.all(
      result.rows.filter((u) => u.role_slug === 'collector').map(async (u) => {
        const [visitsResult, collectionsResult, bookResult, todayRouteResult] = await Promise.all([
          pool.query(
            `SELECT
               COUNT(*) AS assigned,
               COUNT(*) FILTER (WHERE status = 'Completed') AS visited,
               COUNT(*) FILTER (WHERE status = 'Pending') AS pending,
               COUNT(*) FILTER (WHERE status = 'Pending' AND scheduled_date < CURRENT_DATE) AS missed
             FROM field_visits
             WHERE user_id = $1`,
            [u.id]
          ),
          pool.query(
            `SELECT
               COALESCE(SUM(amount), 0) AS total_collected,
               COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count
             FROM collection_payment
             WHERE collector_id = $1 AND status = 'Completed'`,
            [u.id]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS book_size
             FROM customers
             WHERE account_manager_id = $1 AND status = 'Active'`,
            [u.id]
          ),
          pool.query(
            `SELECT
               COUNT(*)::int AS stops,
               COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
               COUNT(*) FILTER (WHERE status = 'Pending')::int AS remaining
             FROM field_visits
             WHERE user_id = $1
               AND visit_type = 'Collection'
               AND scheduled_date = $2::date`,
            [u.id, dispatchDate]
          ),
        ]);

        const visits = visitsResult.rows[0];
        const collections = collectionsResult.rows[0];
        const assigned = Number(visits.assigned) || 0;
        const visited = Number(visits.visited) || 0;
        const compliance = assigned > 0 ? Math.round((visited / assigned) * 100) : 0;
        const recovery = assigned > 0 ? Math.round((Number(collections.completed_count) / assigned) * 100) : 0;
        const todayStops = Number(todayRouteResult.rows[0]?.stops) || 0;
        const todayCompleted = Number(todayRouteResult.rows[0]?.completed) || 0;
        const todayRemaining = Number(todayRouteResult.rows[0]?.remaining) || 0;
        let todayRouteStatus = 'No Route';
        if (todayStops > 0 && todayRemaining === 0) todayRouteStatus = 'Done';
        else if (todayStops > 0 && todayCompleted > 0) todayRouteStatus = 'In Progress';
        else if (todayStops > 0) todayRouteStatus = 'Published';

        return {
          id: String(u.id),
          name: `${u.first_name} ${u.last_name}`,
          email: u.email || null,
          phone: u.phone || null,
          employeeCode: u.employee_id || null,
          status: u.status || 'Active',
          branchId: u.branch_id ?? null,
          branchName: u.branch_name || null,
          joinedAt: u.created_at || null,
          accountBookSize: Number(bookResult.rows[0]?.book_size) || 0,
          dispatchDate,
          todayRouteStatus,
          todayStops,
          todayCompleted,
          todayRemaining,
          // Legacy lifetime fields kept for Scorecards / older consumers
          accountsAssigned: assigned,
          accountsVisited: visited,
          accountsPending: Number(visits.pending) || 0,
          complianceScore: compliance,
          collectionAmount: Number(collections.total_collected),
          recoveryRate: recovery,
          missedVisits: Number(visits.missed) || 0,
          collectionSuccessRate: compliance,
          route: [],
          missedAccounts: [],
        };
      })
    );

    const salesAgents = await Promise.all(
      result.rows.filter((u) => u.role_slug === 'sales_staff').map(async (u) => {
        const [bookResult, areaTodayResult, salesTodayResult, lifetimeVisits, lifetimeSales, newCustResult] = await Promise.all([
          pool.query(
            `SELECT COUNT(*)::int AS book_size
             FROM customers
             WHERE assigned_sales_agent_id = $1
               AND status = 'Active'
               AND ($2::int IS NULL OR branch_id = $2)`,
            [u.id, u.branch_id]
          ),
          pool.query(
            `SELECT
               COUNT(*)::int AS areas,
               COUNT(*) FILTER (WHERE status = 'Done')::int AS done,
               COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress,
               COUNT(*) FILTER (WHERE status = 'Assigned')::int AS assigned
             FROM sales_area_assignments
             WHERE sales_agent_id = $1
               AND work_date = $2::date`,
            [u.id, dispatchDate]
          ),
          pool.query(
            `SELECT
               COUNT(*)::int AS sales_count,
               COALESCE(SUM(total_amount), 0)::float AS sales_amount
             FROM sales_invoices
             WHERE sales_agent_id = $1
               AND invoices_date = $2::date
               AND status IN ('Pending Review', 'Confirmed')`,
            [u.id, dispatchDate]
          ),
          pool.query(
            `SELECT
               COUNT(DISTINCT customer_id) AS customers_assigned,
               COUNT(*) FILTER (WHERE visit_type = 'Sales') AS total_assigned,
               COUNT(*) FILTER (WHERE status = 'Completed' AND visit_type = 'Sales') AS visits_completed
             FROM field_visits
             WHERE user_id = $1`,
            [u.id]
          ),
          pool.query(
            `SELECT
               COUNT(*) AS sales_logged,
               COALESCE(SUM(total_amount), 0) AS total_sales_amount
             FROM sales_invoices
             WHERE sales_agent_id = $1
               AND status IN ('Pending Review', 'Confirmed')`,
            [u.id]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS count FROM customers
             WHERE assigned_sales_agent_id = $1
               AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
            [u.id]
          ),
        ]);

        const areas = Number(areaTodayResult.rows[0]?.areas) || 0;
        const areasDone = Number(areaTodayResult.rows[0]?.done) || 0;
        const areasInProgress = Number(areaTodayResult.rows[0]?.in_progress) || 0;
        let workStatus = 'No Assignment';
        if (areas > 0 && areasDone === areas) workStatus = 'Done';
        else if (areasInProgress > 0) workStatus = 'In Progress';
        else if (areas > 0) workStatus = 'Assigned';

        const visits = lifetimeVisits.rows[0];
        const sales = lifetimeSales.rows[0];
        const visitsCompleted = Number(visits.visits_completed) || 0;
        const salesLogged = Number(sales.sales_logged) || 0;
        const totalSalesAmount = Number(sales.total_sales_amount) || 0;
        const visitCompletionRate = Number(visits.total_assigned) > 0
          ? Math.round((visitsCompleted / Number(visits.total_assigned)) * 100)
          : 0;
        const conversionRate = visitsCompleted > 0
          ? Math.round((salesLogged / visitsCompleted) * 100)
          : 0;
        const avgSaleValue = salesLogged > 0 ? Math.round(totalSalesAmount / salesLogged) : 0;

        return {
          id: String(u.id),
          name: `${u.first_name} ${u.last_name}`,
          email: u.email || null,
          phone: u.phone || null,
          employeeCode: u.employee_id || null,
          status: u.status || 'Active',
          branchId: u.branch_id ?? null,
          branchName: u.branch_name || null,
          joinedAt: u.created_at || null,
          ownedCustomers: Number(bookResult.rows[0]?.book_size) || 0,
          areasAssignedToday: areas,
          areasDoneToday: areasDone,
          areasInProgressToday: areasInProgress,
          workStatus,
          salesTodayCount: Number(salesTodayResult.rows[0]?.sales_count) || 0,
          salesTodayAmount: Number(salesTodayResult.rows[0]?.sales_amount) || 0,
          dispatchDate,
          // Legacy / scorecard fields
          customersAssigned: Number(bookResult.rows[0]?.book_size) || 0,
          visitsCompleted,
          salesLogged,
          totalSalesAmount,
          visitCompletionRate,
          conversionRate,
          avgSaleValue,
          newCustomersAcquired: newCustResult.rows[0]?.count || 0,
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
        dispatchDate,
        branchScoped: isBranchScoped,
        branchId: bid ?? null,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch staff.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/staff-performance?period=week|month
// Period-scoped evaluation metrics (Collectors vs Sales Agents separately).
// ──────────────────────────────────────────────────────────────────────────────
router.get('/staff-performance', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped, bid } = scopeUser(user);
    const data = await loadStaffPerformance(pool, {
      branchScoped,
      bid,
      period: req.query.period,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[Branch Manager] GET /staff-performance error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load staff performance.' });
  }
});

function mapPeriodRange(period) {
  const today = manilaDateString();
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') {
    const current = new Date(`${today}T12:00:00+08:00`);
    const day = current.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    current.setDate(current.getDate() - mondayOffset);
    return { start: manilaDateString(current), end: today };
  }
  const [year, month] = today.split('-');
  return { start: `${year}-${month}-01`, end: today };
}

function validCoord(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/map
// GIS payload for Leaflet layers: accounts, visits, territories, staff, depot
// Query: period=today|week|month
// ──────────────────────────────────────────────────────────────────────────────
router.get('/map', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped, bid } = scopeUser(user);
    const period = String(req.query.period || 'today').toLowerCase();
    const { start, end } = mapPeriodRange(period);
    const today = manilaDateString();
    const branchSql = branchScoped ? 'AND branch_id = $3' : '';
    const customerBranchSql = branchScoped ? 'AND c.branch_id = $3' : '';
    // Visits must match both staff branch and customer branch so BM maps never
    // pull another branch's accounts via cross-assigned field visits.
    const visitBranchSql = branchScoped ? 'AND u.branch_id = $3 AND c.branch_id = $3' : '';
    const rangeParams = branchScoped ? [start, end, bid] : [start, end];

    const areaDate = period === 'today' ? today : end;
    const areaParams = branchScoped ? [areaDate, bid] : [areaDate];
    const areaBranchSql = branchScoped ? 'AND saa.branch_id = $2' : '';

    const [branchResult, staffResult, customerResult, visitResult, territoryResult, areaAssignResult] = await Promise.all([
      pool.query(
        `SELECT id, name, latitude, longitude, address
         FROM branches
         WHERE status = 'Active' ${branchScoped ? 'AND id = $1' : ''}
         ORDER BY name`,
        branchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT u.id, u.first_name, u.last_name, r.slug AS role_slug,
                u.branch_id, b.name AS branch_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE u.status = 'Active'
           AND r.slug IN ('collector', 'sales_staff')
           ${branchScoped ? 'AND u.branch_id = $1' : ''}
         ORDER BY b.name NULLS LAST, r.slug, u.first_name`,
        branchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT c.customer_id, c.customer_code, c.first_name, c.last_name, c.address,
                c.latitude, c.longitude, c.territory_id, c.branch_id,
                b.name AS branch_name,
                c.account_manager_id, c.assigned_sales_agent_id,
                t.territory_name, t.branch_id AS territory_branch_id,
                COALESCE(NULLIF(TRIM(mgr.full_name), ''), TRIM(mgr.first_name || ' ' || mgr.last_name)) AS collector_name,
                COALESCE(NULLIF(TRIM(agent.full_name), ''), TRIM(agent.first_name || ' ' || agent.last_name)) AS sales_agent_name,
                COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
                COALESCE(ca.purchase_volume, 0) AS purchase_volume,
                ca.last_collection_date, ca.last_sales_visit,
                COALESCE(pay.period_collected, 0) AS period_collected,
                COALESCE(sales.period_sales, 0) AS period_sales,
                (${OVERDUE_CUSTOMER}) AS has_overdue_invoice
         FROM customers c
         JOIN branches b ON b.id = c.branch_id
         LEFT JOIN territories t ON t.territory_id = c.territory_id
         LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
         LEFT JOIN users mgr ON mgr.id = c.account_manager_id
         LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
         LEFT JOIN (
           SELECT customer_id, SUM(amount) AS period_collected
           FROM collection_payment
           WHERE payment_date BETWEEN $1::date AND $2::date
             AND status = 'Completed'
             ${branchSql}
           GROUP BY customer_id
         ) pay ON pay.customer_id = c.customer_id
         LEFT JOIN (
           SELECT customer_id, SUM(total_amount) AS period_sales
           FROM sales_invoices
           WHERE invoices_date BETWEEN $1::date AND $2::date
             AND status <> 'Cancelled'
             ${branchSql}
           GROUP BY customer_id
         ) sales ON sales.customer_id = c.customer_id
         WHERE c.status = 'Active' ${customerBranchSql}
         ORDER BY b.name, c.last_name, c.first_name`,
        rangeParams
      ),
      pool.query(
        `SELECT fv.visit_id, fv.scheduled_date, fv.status, fv.visit_type,
                fv.user_id AS staff_id, fv.customer_id,
                c.first_name || ' ' || c.last_name AS customer_name,
                c.latitude, c.longitude, c.branch_id,
                b.name AS branch_name,
                COALESCE(NULLIF(TRIM(u.full_name), ''), TRIM(u.first_name || ' ' || u.last_name)) AS staff_name,
                r.slug AS role_slug
         FROM field_visits fv
         JOIN customers c ON c.customer_id = fv.customer_id
         JOIN branches b ON b.id = c.branch_id
         JOIN users u ON u.id = fv.user_id
         JOIN roles r ON r.role_id = u.role_id
         WHERE fv.scheduled_date BETWEEN $1::date AND $2::date
           ${visitBranchSql}
         ORDER BY fv.user_id, fv.scheduled_date, fv.visit_id
         LIMIT 2000`,
        rangeParams
      ),
      pool.query(
        `SELECT
           t.territory_id, t.territory_name, t.coverage_area, t.assigned_user,
           t.branch_id, b.name AS branch_name,
           COALESCE(t.status, 'Active') AS status,
           t.latitude::FLOAT AS latitude,
           t.longitude::FLOAT AS longitude,
           COALESCE(t.radius_meters, 800) AS radius_meters,
           t.default_sales_agent_id,
           TRIM(CONCAT_WS(' ', sa.first_name, sa.last_name)) AS default_sales_agent_name,
           t.default_collector_id,
           TRIM(CONCAT_WS(' ', col.first_name, col.last_name)) AS default_collector_name,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT('user_id', ta.user_id, 'user_name', TRIM(u2.first_name || ' ' || u2.last_name))
             ) FILTER (WHERE ta.user_id IS NOT NULL),
             '[]'
           ) AS assigned_users
         FROM territories t
         JOIN branches b ON b.id = t.branch_id
         LEFT JOIN users sa ON sa.id = t.default_sales_agent_id
         LEFT JOIN users col ON col.id = t.default_collector_id
         LEFT JOIN territory_assignments ta ON ta.territory_id = t.territory_id
         LEFT JOIN users u2 ON u2.id = ta.user_id
         WHERE COALESCE(t.status, 'Active') = 'Active'
           ${branchScoped ? 'AND t.branch_id = $1' : ''}
         GROUP BY t.territory_id, b.name, sa.first_name, sa.last_name, col.first_name, col.last_name
         ORDER BY b.name, t.territory_name`,
        branchScoped ? [bid] : []
      ),
      pool.query(
        `SELECT saa.assignment_id, saa.sales_agent_id, saa.area_name, saa.status,
                saa.work_date::text AS work_date, saa.latitude, saa.longitude, saa.radius_meters,
                saa.territory_id, t.territory_name, saa.branch_id, b.name AS branch_name,
                TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS sales_agent_name
         FROM sales_area_assignments saa
         JOIN users u ON u.id = saa.sales_agent_id
         JOIN branches b ON b.id = saa.branch_id
         LEFT JOIN territories t ON t.territory_id = saa.territory_id
         WHERE saa.work_date = $1::date
           AND saa.status IN ('Assigned', 'In Progress', 'Done')
           ${areaBranchSql}
         ORDER BY saa.sales_agent_id, saa.assignment_id
         LIMIT 500`,
        areaParams
      ),
    ]);

    const collectors = [];
    const salesAgents = [];
    staffResult.rows.forEach((row) => {
      const person = {
        id: String(row.id),
        name: `${row.first_name} ${row.last_name}`.trim(),
        role: row.role_slug,
        branchId: row.branch_id != null ? Number(row.branch_id) : null,
        branchName: row.branch_name || null,
      };
      if (row.role_slug === 'collector') collectors.push(person);
      else salesAgents.push(person);
    });

    const allActiveCustomers = customerResult.rows;
    const accounts = allActiveCustomers
      .filter((row) => validCoord(row.latitude, row.longitude))
      .map((row) => {
        const balance = Number(row.outstanding_balance) || 0;
        const hasOverdueInvoice = Boolean(row.has_overdue_invoice);
        const paymentStatus = paymentStandingFromFlags({
          outstandingBalance: balance,
          hasOverdueInvoice,
        });
        return {
          id: String(row.customer_id),
          customerCode: row.customer_code || null,
          customerName: `${row.first_name} ${row.last_name}`.trim(),
          address: row.address,
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          balance,
          purchaseVolume: Number(row.purchase_volume) || 0,
          periodCollected: Number(row.period_collected) || 0,
          periodSales: Number(row.period_sales) || 0,
          hasOverdueInvoice,
          paymentStatus,
          lastVisit: row.last_collection_date || row.last_sales_visit || null,
          lastCollection: row.last_collection_date,
          lastSalesVisit: row.last_sales_visit,
          collectorId: row.account_manager_id ? String(row.account_manager_id) : null,
          collectorName: row.collector_name || null,
          salesAgentId: row.assigned_sales_agent_id ? String(row.assigned_sales_agent_id) : null,
          salesAgentName: row.sales_agent_name || null,
          assignedStaff: [row.collector_name, row.sales_agent_name].filter(Boolean).join(' · ') || 'Unassigned',
          territoryId: row.territory_id,
          territoryName: row.territory_name,
          territoryBranchMismatch: row.territory_id != null
            && row.territory_branch_id != null
            && Number(row.territory_branch_id) !== Number(row.branch_id),
          branchId: row.branch_id != null ? Number(row.branch_id) : null,
          branchName: row.branch_name || null,
        };
      });
    const missingLocationCount = allActiveCustomers.filter(
      (row) => !validCoord(row.latitude, row.longitude)
    ).length;

    const visits = visitResult.rows
      .filter((row) => validCoord(row.latitude, row.longitude))
      .map((row) => {
        let status = row.status;
        if (row.status === 'Pending' && row.scheduled_date < today) status = 'Missed';
        return {
          visitId: row.visit_id,
          staffId: String(row.staff_id),
          staffName: row.staff_name,
          roleSlug: row.role_slug,
          customerId: String(row.customer_id),
          customerName: row.customer_name,
          visitType: row.visit_type,
          scheduledDate: row.scheduled_date,
          status,
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          branchId: row.branch_id != null ? Number(row.branch_id) : null,
          branchName: row.branch_name || null,
        };
      });

    const territories = territoryResult.rows.map((row) => {
      const assigned = Array.isArray(row.assigned_users) ? row.assigned_users : [];
      const assignedUserIds = [...new Set([
        row.default_sales_agent_id,
        row.default_collector_id,
        row.assigned_user,
        ...assigned.map((person) => person.user_id),
      ].filter(Boolean).map(Number))];
      const hasPin = validCoord(row.latitude, row.longitude);
      return {
        id: row.territory_id,
        name: row.territory_name,
        coverageArea: row.coverage_area,
        status: row.status || 'Active',
        lat: hasPin ? Number(row.latitude) : null,
        lng: hasPin ? Number(row.longitude) : null,
        radiusMeters: Number(row.radius_meters) || 800,
        hasMapLocation: hasPin,
        defaultSalesAgentId: row.default_sales_agent_id != null ? Number(row.default_sales_agent_id) : null,
        defaultSalesAgentName: row.default_sales_agent_name || null,
        defaultCollectorId: row.default_collector_id != null ? Number(row.default_collector_id) : null,
        defaultCollectorName: row.default_collector_name || null,
        assignedUserIds,
        assignedNames: [
          row.default_sales_agent_name,
          row.default_collector_name,
          ...assigned.map((person) => person.user_name),
        ].filter(Boolean),
        branchId: row.branch_id != null ? Number(row.branch_id) : null,
        branchName: row.branch_name || null,
      };
    });

    const areaAssignments = areaAssignResult.rows.map((row) => {
      const hasPin = validCoord(row.latitude, row.longitude);
      return {
        assignmentId: row.assignment_id,
        salesAgentId: String(row.sales_agent_id),
        salesAgentName: row.sales_agent_name,
        areaName: row.area_name,
        territoryId: row.territory_id,
        territoryName: row.territory_name || null,
        workDate: row.work_date,
        status: row.status,
        lat: hasPin ? Number(row.latitude) : null,
        lng: hasPin ? Number(row.longitude) : null,
        radiusMeters: Number(row.radius_meters) || 800,
        hasMapLocation: hasPin,
        branchId: row.branch_id != null ? Number(row.branch_id) : null,
        branchName: row.branch_name || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        period,
        range: { start, end },
        branches: branchResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          lat: row.latitude != null ? Number(row.latitude) : null,
          lng: row.longitude != null ? Number(row.longitude) : null,
          address: row.address,
        })),
        staff: { collectors, salesAgents },
        accounts,
        visits,
        territories,
        areaAssignments,
        summary: {
          customersOnMap: accounts.length,
          customersMissingLocation: missingLocationCount,
          totalActiveCustomers: allActiveCustomers.length,
          areaAssignments: areaAssignments.length,
          areaAssignmentsWithPin: areaAssignments.filter((a) => a.hasMapLocation).length,
        },
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /map error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load map data.' });
  }
});

function parseMapDate(value) {
  if (value == null || String(value).trim() === '') return manilaDateString();
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return text;
}

// GET /api/branch-manager/map/saw-roads
// OSRM road geometry for each collector's SAW order on a date.
router.get('/map/saw-roads', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped, bid } = scopeUser(user);
    const scheduledDate = parseMapDate(req.query.date);
    if (!scheduledDate) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
    }

    const collectorId = req.query.collector_id != null && req.query.collector_id !== '' && req.query.collector_id !== 'all'
      ? Number(req.query.collector_id)
      : null;
    if (collectorId != null && !Number.isFinite(collectorId)) {
      return res.status(400).json({ success: false, message: 'Invalid collector.' });
    }

    const requestedBranch = req.query.branch_id != null && req.query.branch_id !== '' && req.query.branch_id !== 'all'
      ? Number(req.query.branch_id)
      : null;
    const branchId = branchScoped ? bid : requestedBranch;

    const params = [];
    let sql = `
      SELECT u.id, u.branch_id,
             TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE u.status = 'Active' AND r.slug = 'collector' AND u.branch_id IS NOT NULL
    `;
    if (branchId != null) {
      params.push(branchId);
      sql += ` AND u.branch_id = $${params.length}`;
    }
    if (collectorId != null) {
      params.push(collectorId);
      sql += ` AND u.id = $${params.length}`;
    }
    sql += ' ORDER BY u.first_name, u.last_name LIMIT 8';

    const collectors = await pool.query(sql, params);
    const roads = [];
    for (const collector of collectors.rows) {
      const road = await buildCollectorSawRoad(pool, {
        collectorId: collector.id,
        collectorName: collector.name,
        branchId: collector.branch_id,
        scheduledDate,
      });
      if (road?.positions?.length >= 2) roads.push(road);
    }

    return res.status(200).json({
      success: true,
      data: roads,
      meta: { scheduledDate, count: roads.length },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /map/saw-roads error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to build SAW road routes.' });
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

    const { branchScoped: isBranchScoped, bid } = scopeUser(user);

    const result = await pool.query(
      `SELECT c.customer_id, c.customer_code, c.first_name, c.last_name, c.contact_phone, c.status,
              c.latitude, c.longitude, c.address,
              c.contact_person_fname, c.contact_person_lname, c.contact_person_phone,
              c.account_manager_id, c.assigned_sales_agent_id, c.territory_id, c.created_at,
              b.name AS branch_name,
              t.territory_name,
              COALESCE(t.status, 'Active') AS territory_status,
              mgr.full_name AS account_manager_name,
              agent.first_name || ' ' || agent.last_name AS assigned_sales_agent_name,
              COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
              COALESCE(ca.purchase_volume, 0) AS purchase_volume,
              ca.last_collection_date, ca.last_sales_visit,
              (${OVERDUE_CUSTOMER}) AS has_overdue_invoice
       FROM customers c
       JOIN branches b ON b.id = c.branch_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       LEFT JOIN customer_activity ca ON c.customer_id = ca.customer_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       ${isBranchScoped ? 'WHERE c.branch_id = $1' : ''}
       ORDER BY c.last_name, c.first_name`,
      isBranchScoped ? [bid] : []
    );

    const customers = result.rows.map((c) => {
      const outstanding = Number(c.outstanding_balance) || 0;
      const hasOverdueInvoice = Boolean(c.has_overdue_invoice);
      const paymentStatus = paymentStandingFromFlags({
        outstandingBalance: outstanding,
        hasOverdueInvoice,
      });
      return {
        customer_id: c.customer_id,
        id: String(c.customer_id),
        customer_code: c.customer_code || null,
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
        assigned_sales_agent_id: c.assigned_sales_agent_id,
        assigned_sales_agent_name: c.assigned_sales_agent_name?.trim() || '—',
        territory_id: c.territory_id,
        territory_name: c.territory_name || null,
        territory_status: c.territory_status || null,
        customer_since: c.created_at,
        outstanding_balance: outstanding,
        purchase_volume: Number(c.purchase_volume),
        last_collection_date: c.last_collection_date,
        last_sales_visit: c.last_sales_visit,
        hasOverdueInvoice,
        paymentStatus,
        lat: Number(c.latitude) || 0,
        lng: Number(c.longitude) || 0,
      };
    });

    const mapAccounts = customers.map((c) => ({
      id: c.id,
      customerName: c.customerName,
      balance: c.outstanding_balance,
      paymentStatus: c.paymentStatus,
      lastVisit: c.last_sales_visit || c.last_collection_date || 'N/A',
      assignedStaff: [c.account_manager_name !== '—' ? c.account_manager_name : null, c.assigned_sales_agent_name !== '—' ? c.assigned_sales_agent_name : null].filter(Boolean).join(' · ') || 'Unassigned',
      lat: c.lat,
      lng: c.lng,
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

    const { branchScoped: isBranchScoped, bid } = scopeUser(user);

    let customerQuery = `SELECT c.customer_id, c.customer_code, c.first_name, c.middle_name, c.last_name,
              c.mothers_maiden_name, c.civil_status, c.address, c.latitude, c.longitude,
              c.address_region, c.address_province, c.address_city, c.address_barangay, c.address_street, c.address_zip,
              c.contact_phone, c.contact_person_fname, c.contact_person_mname, c.contact_person_lname,
              c.contact_person_phone, c.contact_person_relationship,
              c.secondary_contact_fname, c.secondary_contact_lname, c.secondary_contact_phone, c.secondary_contact_relationship,
              c.id_type, c.id_number, c.id_verification_status,
              c.status, c.created_at, c.updated_at, c.branch_id,
              c.account_manager_id, c.assigned_sales_agent_id, c.territory_id,
              b.name AS branch_name,
              mgr.full_name AS account_manager_name,
              COALESCE(NULLIF(TRIM(agent.full_name), ''), TRIM(agent.first_name || ' ' || agent.last_name)) AS assigned_sales_agent_name,
              t.territory_name,
              t.default_sales_agent_id,
              t.default_collector_id,
              TRIM(CONCAT_WS(' ', tsa.first_name, tsa.last_name)) AS territory_default_sales_agent_name,
              TRIM(CONCAT_WS(' ', tcol.first_name, tcol.last_name)) AS territory_default_collector_name,
              (${OVERDUE_CUSTOMER}) AS has_overdue_invoice
       FROM customers c
       JOIN branches b ON b.id = c.branch_id
       LEFT JOIN users mgr ON mgr.id = c.account_manager_id
       LEFT JOIN users agent ON agent.id = c.assigned_sales_agent_id
       LEFT JOIN territories t ON t.territory_id = c.territory_id
       LEFT JOIN users tsa ON tsa.id = t.default_sales_agent_id
       LEFT JOIN users tcol ON tcol.id = t.default_collector_id
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

    const [activityResult, creditResult, unpaidCountResult] = await Promise.all([
      pool.query(`SELECT * FROM customer_activity WHERE customer_id = $1`, [req.params.id]),
      pool.query(
        `SELECT cci.*, u.full_name AS approved_by_name
         FROM customer_credit_info cci
         LEFT JOIN users u ON u.id = cci.approved_by
         WHERE cci.customer_id = $1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS unpaid_count
         FROM sales_invoices si
         LEFT JOIN (
           SELECT sales_id, SUM(payment_amount) AS paid
           FROM credit_history
           WHERE sales_id IS NOT NULL
           GROUP BY sales_id
         ) paid ON paid.sales_id = si.sales_invoices_id
         WHERE si.customer_id = $1
           AND si.status IN ('Confirmed', 'Pending Review')
           AND COALESCE(paid.paid, 0) < si.total_amount`,
        [req.params.id]
      ),
    ]);

    const activity = activityResult.rows[0] || null;
    const hasOverdueInvoice = Boolean(customer.has_overdue_invoice);
    const outstanding = Number(activity?.outstanding_balance || 0);
    const paymentStatus = paymentStandingFromFlags({
      outstandingBalance: outstanding,
      hasOverdueInvoice,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...customer,
        hasOverdueInvoice,
        paymentStatus,
        unpaidInvoiceCount: unpaidCountResult.rows[0]?.unpaid_count || 0,
        activity,
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
    const { branchScoped: isBranchScoped, bid } = scopeUser(user);
    const { listOperationalAlerts, sortAlertsForDashboard } = await import('../lib/operationalAlerts.js');

    const rows = await listOperationalAlerts(pool, {
      branchId: isBranchScoped ? bid : null,
      openOnly: true,
      criticalFirst: true,
      limit: 50,
    });
    const sorted = sortAlertsForDashboard(rows);
    const alerts = sorted.map((row) => ({
      id: row.alert_id,
      type: row.alert_type,
      category: row.category || row.alert_type,
      title: row.title,
      message: row.message,
      severity: row.severity,
      status: row.status,
      time: row.created_at,
      assignedToName: row.assigned_to_name || null,
      entityType: row.entity_type || null,
      entityId: row.entity_id || null,
      linkPath: row.link_path || null,
      escalated: Boolean(row.escalated_at),
    }));

    return res.status(200).json({
      success: true,
      data: {
        alerts,
        openCount: alerts.length,
        criticalCount: alerts.filter((a) => a.severity === 'Critical').length,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /alerts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch alerts.' });
  }
});

// GET /api/branch-manager/audit-logs — Branch Activity (affected-branch scope)
router.get('/audit-logs', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped, bid } = scopeUser(user);
    const {
      listBranchActivity,
      BM_ACTIVITY_MODULE_GROUPS,
      formatBranchActivityLabel,
    } = await import('../lib/branchActivityAudit.js');

    // BM must always be branch-scoped. Unscoped OM/SA using the ops mirror
    // may omit branch_id to see org-wide branch activity of the same modules.
    const branchId = branchScoped ? bid : (
      req.query.branch_id != null && req.query.branch_id !== ''
        ? Number(req.query.branch_id)
        : null
    );
    if (branchScoped && (branchId == null || !Number.isFinite(branchId))) {
      return res.status(403).json({ success: false, message: 'Branch not assigned.' });
    }

    const rows = await listBranchActivity(pool, {
      branchId: Number.isFinite(branchId) ? branchId : null,
      moduleGroup: String(req.query.module || 'all').toLowerCase(),
      search: req.query.search || '',
      actor: req.query.actor || '',
      dateFrom: req.query.date_from || '',
      dateTo: req.query.date_to || '',
      limit: Math.min(Number(req.query.limit) || 200, 500),
    });

    const data = rows.map((row) => ({
      ...row,
      activity_label: formatBranchActivityLabel(row),
    }));

    return res.status(200).json({
      success: true,
      data,
      meta: {
        moduleGroups: Object.fromEntries(
          Object.entries(BM_ACTIVITY_MODULE_GROUPS).map(([key, value]) => [
            key,
            value?.label || 'All Branch Activity',
          ])
        ),
        scope: branchId != null ? 'branch' : 'organization',
        branchId,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /audit-logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

// GET /api/branch-manager/staff/collectors/:id/saw-priority — prioritized eligible candidates
router.get('/staff/collectors/:id/saw-priority', requireAuth, async (req, res) => {
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

    const branchRow = await pool.query(`SELECT branch_id FROM users WHERE id = $1`, [collectorId]);
    const branchId = branchRow.rows[0]?.branch_id ?? user.branchId;
    const scheduledDate = req.query.scheduled_date || manilaDateString();

    const { asOf, ranked, stats, bookStats } = await computeCollectorSawPriority(pool, {
      collectorId,
      branchId,
      asOfDate: scheduledDate,
      scheduledDate,
    });

    const assignments = await getCollectionAssignmentsForDate(pool, collectorId, scheduledDate);
    const assignedIds = new Set(assignments.map((a) => Number(a.customer_id)));
    const emptyBook = (Number(bookStats?.ownBook) || 0) === 0
      && (Number(bookStats?.territoryDefault) || 0) === 0
      && (Number(bookStats?.unassignedEligible) || 0) === 0;

    return res.status(200).json({
      success: true,
      data: ranked.map(mapSawPriorityRow),
      meta: {
        asOf,
        stats,
        bookStats,
        scheduledDate,
        assignedCustomerIds: [...assignedIds],
        emptyBook,
        emptyBookMessage: emptyBook
          ? 'No eligible customers are currently assigned to this Collector\'s portfolio or territories.'
          : null,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff/collectors/:id/saw-priority error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load priority list.' });
  }
});

// POST /api/branch-manager/staff/collectors/:id/route-preview — optimize selected stops before publish
router.post('/staff/collectors/:id/route-preview', requireAuth, async (req, res) => {
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

    const branchRow = await pool.query(`SELECT branch_id FROM users WHERE id = $1`, [collectorId]);
    const branchId = branchRow.rows[0]?.branch_id ?? user.branchId;
    const scheduledDate = req.body.scheduled_date || manilaDateString();
    const customerIds = Array.isArray(req.body.customer_ids) ? req.body.customer_ids : [];
    if (!customerIds.length) {
      return res.status(400).json({ success: false, message: 'Provide customer_ids to preview.' });
    }

    const preview = await previewCollectionRoute(pool, {
      collectorId,
      branchId,
      customerIds,
      scheduledDate,
      asOfDate: scheduledDate,
    });

    return res.status(200).json({
      success: true,
      data: preview.ranked.map(mapSawPriorityRow),
      meta: {
        asOf: preview.asOf,
        stats: preview.stats,
        scheduledDate: preview.scheduledDate,
        published: false,
        roadProvider: preview.stats?.roadProvider || null,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] POST route-preview error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to preview route.' });
  }
});

// POST /api/branch-manager/staff/collectors/:id/collection-assignments — publish collection visits
router.post('/staff/collectors/:id/collection-assignments', requireAuth, async (req, res) => {
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

    const branchRow = await pool.query(`SELECT branch_id FROM users WHERE id = $1`, [collectorId]);
    const branchId = branchRow.rows[0]?.branch_id ?? user.branchId;
    if (branchId == null) {
      return res.status(400).json({ success: false, message: 'Collector has no branch assignment.' });
    }

    const scheduledDate = req.body.scheduled_date || manilaDateString();
    let customerIds = Array.isArray(req.body.customer_ids) ? req.body.customer_ids : [];

    const topN = Number(req.body.assign_top_n);
    if (Number.isFinite(topN) && topN > 0) {
      const { ranked } = await computeCollectorSawPriority(pool, {
        collectorId,
        branchId,
        asOfDate: scheduledDate,
        scheduledDate,
      });
      customerIds = ranked
        .filter((r) => !r.assignment_block)
        .slice(0, topN)
        .map((r) => r.customer_id);
    }

    if (!customerIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Provide customer_ids or assign_top_n with eligible unblocked customers.',
      });
    }

    const result = await assignCollectionVisits(pool, {
      collectorId,
      branchId,
      customerIds,
      scheduledDate,
    });

    const otherConflicts = (result.skipped || []).filter(
      (s) => s.reason === 'assigned_to_other_collector' || s.reason === 'assignment_conflict'
    );

    if (result.created.length) {
      const ids = result.created.map((row) => Number(row.customer_id));
      const names = await pool.query(
        `SELECT customer_id,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Customer') AS customer_name
         FROM customers
         WHERE customer_id = ANY($1::int[])`,
        [ids]
      );
      const byId = new Map(names.rows.map((row) => [Number(row.customer_id), row.customer_name]));
      await notifyScheduleAssigned(pool, {
        userId: collectorId,
        scheduledDate: result.scheduledDate,
        visitType: 'Collection',
        customerNames: ids.map((id) => byId.get(id) || 'Customer'),
      });
    }

    if (!result.created.length && otherConflicts.length) {
      return res.status(409).json({
        success: false,
        message: 'One or more customers are already assigned to another collector for this date.',
        data: result,
      });
    }

    return res.status(201).json({
      success: true,
      message: result.created.length
        ? `Published ${result.created.length} collection visit(s) for ${result.scheduledDate}.`
        : 'No new visits created (selected customers were already scheduled).',
      data: result,
    });
  } catch (err) {
    console.error('[Branch Manager] POST collection-assignments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to assign collection visits.' });
  }
});

// GET /api/branch-manager/staff/collectors/:id — profile + published route for selected date
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

    const scheduledDate = String(req.query.scheduled_date || req.query.date || manilaDateString()).slice(0, 10);

    const profileRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.employee_id,
              u.status, u.created_at, u.branch_id, b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [collectorId]
    );
    const profile = profileRes.rows[0];
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Collector not found.' });
    }

    const [bookRes, publishedRes, historyRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS book_size
         FROM customers
         WHERE account_manager_id = $1 AND status = 'Active'`,
        [collectorId]
      ),
      // Fast published-route read — no OSRM. Priority candidates come from saw-priority.
      pool.query(
        `SELECT fv.visit_id, fv.status, fv.scheduled_date,
                c.customer_id, c.customer_code, c.address,
                c.latitude, c.longitude,
                COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name
         FROM field_visits fv
         JOIN customers c ON c.customer_id = fv.customer_id
         LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
         WHERE fv.user_id = $1
           AND fv.visit_type = 'Collection'
           AND fv.scheduled_date = $2::date
         ORDER BY fv.visit_id ASC`,
        [collectorId, scheduledDate]
      ),
      pool.query(
        `SELECT fv.visit_id, fv.scheduled_date, fv.status,
                c.customer_id, c.first_name || ' ' || c.last_name AS customer_name,
                c.address, COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance
         FROM field_visits fv
         JOIN customers c ON c.customer_id = fv.customer_id
         LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
         WHERE fv.user_id = $1
           AND fv.visit_type = 'Collection'
           AND fv.scheduled_date < $2::date
         ORDER BY fv.scheduled_date DESC, fv.visit_id DESC
         LIMIT 30`,
        [collectorId, scheduledDate]
      ),
    ]);

    const publishedStops = publishedRes.rows.map((row, idx) => ({
      stopNumber: idx + 1,
      visitId: row.visit_id,
      customerId: row.customer_id,
      customerCode: row.customer_code,
      account: row.customer_name,
      customerName: row.customer_name,
      address: row.address,
      outstandingBalance: Number(row.outstanding_balance) || 0,
      status: row.status || 'Pending',
      scheduledDate,
      priorityScore: null,
      priorityRank: null,
      lat: row.latitude != null ? Number(row.latitude) : null,
      lng: row.longitude != null ? Number(row.longitude) : null,
      amount: null,
    }));

    const completed = publishedStops.filter((s) => s.status === 'Completed').length;
    const pending = publishedStops.filter((s) => s.status === 'Pending').length;
    let todayRouteStatus = 'No Route';
    if (publishedStops.length && pending === 0) todayRouteStatus = 'Done';
    else if (publishedStops.length && completed > 0) todayRouteStatus = 'In Progress';
    else if (publishedStops.length) todayRouteStatus = 'Published';

    const mapMarkers = publishedStops
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r) => ({
        id: `stop-${r.visitId || r.customerId}`,
        position: [r.lat, r.lng],
        label: String(r.stopNumber),
        color: r.status === 'Completed' ? '#10b981' : '#093850',
        popup: `#${r.stopNumber} ${r.customerName} (${r.status})`,
      }));

    // Ordered stop markers only — never invent road geometry from straight lines.
    const polylines = [];

    return res.status(200).json({
      success: true,
      data: {
        profile: {
          id: String(profile.id),
          name: `${profile.first_name} ${profile.last_name}`,
          email: profile.email || null,
          phone: profile.phone || null,
          employeeCode: profile.employee_id || null,
          status: profile.status || 'Active',
          branchId: profile.branch_id ?? null,
          branchName: profile.branch_name || null,
          joinedAt: profile.created_at || null,
          accountBookSize: Number(bookRes.rows[0]?.book_size) || 0,
          todayRouteStatus,
        },
        scheduledDate,
        publishedRoute: publishedStops,
        route: publishedStops,
        routeStats: {
          eligibleCustomers: null,
          customersInBook: Number(bookRes.rows[0]?.book_size) || 0,
          alreadyAssignedToday: publishedStops.length,
          publishedStops: publishedStops.length,
          completed,
          remaining: pending,
          blockedAssignments: null,
        },
        history: historyRes.rows.map((row) => ({
          visitId: row.visit_id,
          customerId: row.customer_id,
          account: row.customer_name,
          address: row.address,
          status: row.status,
          scheduledDate: row.scheduled_date,
          outstandingBalance: Number(row.outstanding_balance) || 0,
        })),
        mapMarkers,
        polylines,
        roadProvider: null,
        published: publishedStops.length > 0,
        candidateCount: null,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff/collectors/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load collector detail.' });
  }
});

// GET /api/branch-manager/staff/sales/:id — profile, date-scoped areas, owned customer book
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

    const workDate = String(req.query.work_date || req.query.date || manilaDateString()).slice(0, 10);

    const profileRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.employee_id,
              u.status, u.created_at, u.branch_id, b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [agentId]
    );
    const profile = profileRes.rows[0];
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Sales agent not found.' });
    }

    const [bookRes, areasRes, farRes, salesTodayRes, customersRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS book_size
         FROM customers
         WHERE assigned_sales_agent_id = $1
           AND status = 'Active'
           AND ($2::int IS NULL OR branch_id = $2)`,
        [agentId, profile.branch_id]
      ),
      pool.query(
        `SELECT ${AREA_ASSIGNMENT_SELECT}
         ${AREA_ASSIGNMENT_FROM}
         WHERE saa.sales_agent_id = $1
           AND saa.work_date = $2::date
         ORDER BY saa.assignment_id ASC`,
        [agentId, workDate]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM field_activity_reports far
         LEFT JOIN sales_area_assignments saa ON saa.assignment_id = far.assignment_id
         WHERE far.user_id = $1
           AND (
             saa.work_date = $2::date
             OR (far.created_at AT TIME ZONE 'Asia/Manila')::date = $2::date
           )`,
        [agentId, workDate]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::float AS amount
         FROM sales_invoices
         WHERE sales_agent_id = $1
           AND invoices_date = $2::date
           AND status IN ('Pending Review', 'Confirmed')`,
        [agentId, workDate]
      ),
      pool.query(
        `SELECT c.customer_id, c.customer_code,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name,
                c.contact_phone, c.address, c.status,
                COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance,
                (${OVERDUE_CUSTOMER}) AS has_overdue_invoice,
                t.territory_name
         FROM customers c
         LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
         LEFT JOIN territories t ON t.territory_id = c.territory_id
         WHERE c.assigned_sales_agent_id = $1
           AND c.status = 'Active'
           AND ($2::int IS NULL OR c.branch_id = $2)
         ORDER BY c.last_name, c.first_name
         LIMIT 100`,
        [agentId, profile.branch_id]
      ),
    ]);

    const productsByAssignment = await loadAssignmentProducts(
      pool,
      areasRes.rows.map((row) => row.assignment_id)
    );
    const areas = areasRes.rows.map((row) => withProducts(row, productsByAssignment));
    const areasDone = areas.filter((a) => a.status === 'Done').length;
    const areasInProgress = areas.filter((a) => a.status === 'In Progress').length;
    let workStatus = 'No Assignment';
    if (areas.length && areasDone === areas.length) workStatus = 'Done';
    else if (areasInProgress > 0) workStatus = 'In Progress';
    else if (areas.length) workStatus = 'Assigned';

    const productsAssigned = new Set();
    areas.forEach((area) => {
      (area.products_to_push || []).forEach((p) => productsAssigned.add(p.product_id));
    });

    return res.status(200).json({
      success: true,
      data: {
        profile: {
          id: String(profile.id),
          name: `${profile.first_name} ${profile.last_name}`,
          email: profile.email || null,
          phone: profile.phone || null,
          employeeCode: profile.employee_id || null,
          status: profile.status || 'Active',
          branchId: profile.branch_id ?? null,
          branchName: profile.branch_name || null,
          joinedAt: profile.created_at || null,
          ownedCustomers: Number(bookRes.rows[0]?.book_size) || 0,
          workStatus,
        },
        workDate,
        areas,
        dispatchStats: {
          areasAssigned: areas.length,
          areasCompleted: areasDone,
          areasInProgress,
          fieldReports: Number(farRes.rows[0]?.count) || 0,
          productsAssigned: productsAssigned.size,
          areasWithMapLocation: areas.filter((a) => Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude))).length,
          salesLoggedToday: Number(salesTodayRes.rows[0]?.count) || 0,
          salesAmountToday: Number(salesTodayRes.rows[0]?.amount) || 0,
        },
        customerBook: customersRes.rows.map((row) => ({
          customerId: row.customer_id,
          customerCode: row.customer_code,
          customerName: row.customer_name,
          contactPhone: row.contact_phone,
          address: row.address,
          territoryName: row.territory_name || null,
          status: row.status,
          outstandingBalance: Number(row.outstanding_balance) || 0,
          paymentStanding: paymentStandingFromFlags({
            outstandingBalance: Number(row.outstanding_balance) || 0,
            hasOverdueInvoice: Boolean(row.has_overdue_invoice),
          }),
        })),
        // Legacy keys kept empty so old UI code does not crash if still referenced.
        customers: [],
        productPerformance: [],
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /staff/sales/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load sales agent detail.' });
  }
});

function manilaWeekStart(today = manilaDateString()) {
  const [y, m, d] = String(today).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  // Manila weekday: Sunday=0 … Saturday=6 (same as JS getUTCDay for calendar date)
  const dow = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - dow);
  return utc.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/field-activity-reports
// Sales + Collector field reports for BM review. Filters: scope, role, severity,
// activity_type, staff_id, search. Work date = assignment work_date / visit scheduled_date.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-activity-reports', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped: isBranchScoped, bid } = scopeUser(user);

    const scope = String(req.query.scope || 'today').toLowerCase();
    const role = String(req.query.role || 'all').toLowerCase();
    const severity = String(req.query.severity || 'all').trim();
    const activityType = String(req.query.activity_type || '').trim();
    const staffId = req.query.staff_id != null && req.query.staff_id !== ''
      ? Number(req.query.staff_id)
      : null;
    const search = String(req.query.search || '').trim();
    const customerId = req.query.customer_id != null && req.query.customer_id !== ''
      ? Number(req.query.customer_id)
      : (req.query.customerId != null && req.query.customerId !== ''
        ? Number(req.query.customerId)
        : null);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let p = 1;

    if (isBranchScoped) {
      conditions.push(`u.branch_id = $${p++}`);
      params.push(bid);
    }

    const today = manilaDateString();
    if (scope === 'today') {
      conditions.push(`${FAR_WORK_DATE_SQL} = $${p++}::date`);
      params.push(today);
    } else if (scope === 'week') {
      conditions.push(`${FAR_WORK_DATE_SQL} BETWEEN $${p++}::date AND $${p++}::date`);
      params.push(manilaWeekStart(today), today);
    }

    if (role === 'collector') {
      conditions.push(`r.slug = 'collector'`);
    } else if (role === 'sales' || role === 'sales_staff') {
      conditions.push(`r.slug = 'sales_staff'`);
    }

    if (severity && severity.toLowerCase() !== 'all') {
      conditions.push(`far.severity ILIKE $${p++}`);
      params.push(severity);
    }

    if (activityType && activityType.toLowerCase() !== 'all') {
      conditions.push(`far.activity_type = $${p++}`);
      params.push(activityType);
    }

    if (Number.isInteger(staffId) && staffId > 0) {
      conditions.push(`u.id = $${p++}`);
      params.push(staffId);
      if (isBranchScoped) {
        // Extra guard: staff must belong to BM branch (already implied by u.branch_id).
      }
    }

    if (Number.isInteger(customerId) && customerId > 0) {
      conditions.push(`(
        linked_c.customer_id = $${p}
        OR visit_c.customer_id = $${p}
        OR far.customer_id = $${p}
      )`);
      params.push(customerId);
      p += 1;
    }

    if (search) {
      conditions.push(`(
        CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${p}
        OR COALESCE(saa.area_name, '') ILIKE $${p}
        OR COALESCE(far.remarks, '') ILIKE $${p}
        OR COALESCE(far.activity_type, '') ILIKE $${p}
        OR COALESCE(linked_c.first_name || ' ' || linked_c.last_name, '') ILIKE $${p}
        OR COALESCE(visit_c.first_name || ' ' || visit_c.last_name, '') ILIKE $${p}
        OR COALESCE(linked_c.customer_code, '') ILIKE $${p}
        OR COALESCE(visit_c.customer_code, '') ILIKE $${p}
        OR COALESCE(b.name, '') ILIKE $${p}
      )`);
      params.push(`%${search}%`);
      p += 1;
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT ${FAR_SELECT_COLUMNS}, COUNT(*) OVER() AS total_count
       ${FAR_FROM_SQL}
       ${whereSql}
       ORDER BY
         CASE WHEN far.severity ILIKE 'Critical' THEN 0
              WHEN far.severity ILIKE 'High' THEN 1
              ELSE 2 END,
         ${FAR_WORK_DATE_SQL} DESC NULLS LAST,
         far.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );

    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;

    // Compact summary for the default "today" desk (same branch scope, no other filters).
    const summaryParams = isBranchScoped ? [bid, today] : [today];
    const summaryBranch = isBranchScoped ? 'AND u.branch_id = $1' : '';
    const summaryDateParam = isBranchScoped ? '$2' : '$1';
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${FAR_WORK_DATE_SQL} = ${summaryDateParam}::date)::int AS today_count,
         COUNT(*) FILTER (
           WHERE ${FAR_WORK_DATE_SQL} = ${summaryDateParam}::date
             AND far.severity ILIKE ANY (ARRAY['High','Critical'])
         )::int AS incident_attention_count,
         COUNT(*) FILTER (
           WHERE ${FAR_WORK_DATE_SQL} = ${summaryDateParam}::date AND r.slug = 'sales_staff'
         )::int AS sales_today_count,
         COUNT(*) FILTER (
           WHERE ${FAR_WORK_DATE_SQL} = ${summaryDateParam}::date AND r.slug = 'collector'
         )::int AS collector_today_count
       ${FAR_FROM_SQL}
       WHERE 1=1 ${summaryBranch}`,
      summaryParams
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => mapFarRow(row)),
      count: result.rows.length,
      total,
      page,
      limit,
      summary: summaryResult.rows[0] || {
        today_count: 0,
        incident_attention_count: 0,
        sales_today_count: 0,
        collector_today_count: 0,
      },
    });
  } catch (err) {
    console.error('[Branch Manager] GET /field-activity-reports error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load field activity reports.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/branch-manager/field-activity-reports/:id
// Full report, including photo evidence. Branch-scoped for BM.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-activity-reports/:id', requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid report id.' });
  }

  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { branchScoped: isBranchScoped, bid } = scopeUser(user);
    const params = isBranchScoped ? [bid, reportId] : [reportId];
    const whereSql = isBranchScoped
      ? 'WHERE u.branch_id = $1 AND far.report_id = $2'
      : 'WHERE far.report_id = $1';

    const result = await pool.query(
      `SELECT ${FAR_SELECT_COLUMNS}, far.photo
       ${FAR_FROM_SQL}
       ${whereSql}`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Field activity report not found.' });
    }

    return res.status(200).json({
      success: true,
      data: mapFarRow(result.rows[0], { includePhoto: true }),
    });
  } catch (err) {
    console.error('[Branch Manager] GET /field-activity-reports/:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load field activity report.' });
  }
});

// ── Sales area / canvass assignments (BM assigns WHERE SA works) ──────────────

router.get('/staff/sales/:id/area-assignments', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const agentId = positiveInteger(req.params.id);
    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Invalid sales agent ID.' });
    }
    const allowed = await assertStaffInBranch(pool, user, agentId, 'sales_staff');
    if (!allowed) {
      return res.status(404).json({ success: false, message: 'Sales agent not found.' });
    }

    const result = await pool.query(
      `SELECT ${AREA_ASSIGNMENT_SELECT}
       ${AREA_ASSIGNMENT_FROM}
       WHERE saa.sales_agent_id = $1
       ORDER BY saa.work_date DESC, saa.assignment_id DESC
       LIMIT 100`,
      [agentId]
    );
    const productsByAssignment = await loadAssignmentProducts(
      pool,
      result.rows.map((row) => row.assignment_id)
    );
    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => withProducts(row, productsByAssignment)),
    });
  } catch (err) {
    console.error('[Branch Manager] GET sales area-assignments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load area assignments.' });
  }
});

router.post('/staff/sales/:id/area-assignments', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const agentId = positiveInteger(req.params.id);
    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Invalid sales agent ID.' });
    }
    const allowed = await assertStaffInBranch(pool, user, agentId, 'sales_staff');
    if (!allowed) {
      return res.status(404).json({ success: false, message: 'Sales agent not found.' });
    }

    const workDate = req.body?.work_date || manilaDateString();
    if (!isValidDate(String(workDate))) {
      return res.status(400).json({ success: false, message: 'work_date must be YYYY-MM-DD.' });
    }

    const territoryId = positiveInteger(req.body?.territory_id);
    let areaName = typeof req.body?.area_name === 'string' ? req.body.area_name.trim() : '';
    let coverageNotes = typeof req.body?.coverage_notes === 'string' ? req.body.coverage_notes.trim() : '';
    let latitude = req.body?.latitude != null && req.body.latitude !== '' ? Number(req.body.latitude) : null;
    let longitude = req.body?.longitude != null && req.body.longitude !== '' ? Number(req.body.longitude) : null;
    const productIds = Array.isArray(req.body?.product_ids)
      ? [...new Set(req.body.product_ids.map((id) => positiveInteger(id)).filter(Boolean))]
      : [];

    const agentResult = await pool.query(
      `SELECT u.id, u.branch_id, b.latitude AS branch_lat, b.longitude AS branch_lng, b.name AS branch_name
       FROM users u
       JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [agentId]
    );
    if (!agentResult.rows.length || agentResult.rows[0].branch_id == null) {
      return res.status(400).json({ success: false, message: 'Sales agent has no branch.' });
    }
    const agent = agentResult.rows[0];

    let territoryDefaultSalesAgentId = null;
    let territoryRadius = null;
    if (territoryId) {
      const territory = await pool.query(
        `SELECT territory_id, territory_name, coverage_area, branch_id,
                COALESCE(status, 'Active') AS status,
                latitude, longitude, radius_meters, default_sales_agent_id
         FROM territories
         WHERE territory_id = $1`,
        [territoryId]
      );
      if (!territory.rows.length || Number(territory.rows[0].branch_id) !== Number(agent.branch_id)) {
        return res.status(400).json({ success: false, message: 'Territory not found in this branch.' });
      }
      if (territory.rows[0].status !== 'Active') {
        return res.status(400).json({
          success: false,
          message: 'Inactive territories cannot receive new Sales daily assignments.',
        });
      }
      if (!areaName) areaName = territory.rows[0].territory_name;
      if (!coverageNotes) coverageNotes = territory.rows[0].coverage_area || '';
      territoryDefaultSalesAgentId = territory.rows[0].default_sales_agent_id != null
        ? Number(territory.rows[0].default_sales_agent_id)
        : null;
      territoryRadius = Number(territory.rows[0].radius_meters) || null;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        if (Number.isFinite(Number(territory.rows[0].latitude))
          && Number.isFinite(Number(territory.rows[0].longitude))) {
          latitude = Number(territory.rows[0].latitude);
          longitude = Number(territory.rows[0].longitude);
        }
      }
    }

    if (!areaName) {
      return res.status(400).json({ success: false, message: 'Choose an Active territory (or provide an exception area name).' });
    }

    // Do not silently fall back to the branch depot — missing pins stay null.
    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
    if ((latitude != null || longitude != null) && !hasCoords) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude must both be valid numbers, or both omitted.',
      });
    }
    if (!hasCoords) {
      latitude = null;
      longitude = null;
    }
    const effectiveRadius = positiveInteger(req.body?.radius_meters)
      || territoryRadius
      || 800;

    const allowOwnershipException = req.body?.confirm_default_owner_exception === true
      || req.body?.confirm_default_owner_exception === 'true'
      || req.body?.confirm_default_owner_exception === 1;
    if (
      territoryId
      && territoryDefaultSalesAgentId
      && Number(territoryDefaultSalesAgentId) !== Number(agentId)
      && !allowOwnershipException
    ) {
      const owner = await pool.query(
        `SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS full_name
         FROM users WHERE id = $1`,
        [territoryDefaultSalesAgentId]
      );
      return res.status(409).json({
        success: false,
        message: `This territory’s default Sales Agent is ${owner.rows[0]?.full_name || `#${territoryDefaultSalesAgentId}`}. Confirm to assign a different agent for this work date only.`,
        data: {
          requiresDefaultOwnerConfirmation: true,
          defaultSalesAgentId: territoryDefaultSalesAgentId,
          defaultSalesAgentName: owner.rows[0]?.full_name || null,
        },
      });
    }

    if (productIds.length) {
      const productCheck = await pool.query(
        `SELECT id FROM products WHERE id = ANY($1::int[]) AND status = 'Active'`,
        [productIds]
      );
      if (productCheck.rows.length !== productIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more selected products are invalid or inactive.',
        });
      }
    }

    const allowOverlap = req.body?.confirm_spatial_overlap === true
      || req.body?.confirm_spatial_overlap === 'true'
      || req.body?.confirm_spatial_overlap === 1;
    const conflictCheck = await findAreaAssignmentConflicts(pool, {
      branchId: agent.branch_id,
      salesAgentId: agentId,
      workDate,
      territoryId,
      areaName,
      latitude,
      longitude,
      radiusMeters: effectiveRadius,
    });
    if (conflictCheck.conflicts.length) {
      return res.status(409).json({
        success: false,
        message: conflictCheck.conflicts[0].message,
        data: {
          conflicts: conflictCheck.conflicts,
          warnings: conflictCheck.warnings,
        },
      });
    }
    if (conflictCheck.warnings.length && !allowOverlap) {
      return res.status(409).json({
        success: false,
        message: `${conflictCheck.warnings[0].message} Confirm to proceed.`,
        data: {
          conflicts: [],
          warnings: conflictCheck.warnings,
          requiresConfirmation: true,
        },
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Re-check inside the transaction against concurrent inserts.
      const locked = await findAreaAssignmentConflicts(client, {
        branchId: agent.branch_id,
        salesAgentId: agentId,
        workDate,
        territoryId,
        areaName,
        latitude,
        longitude,
        radiusMeters: effectiveRadius,
      });
      if (locked.conflicts.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: locked.conflicts[0].message,
          data: { conflicts: locked.conflicts, warnings: locked.warnings },
        });
      }

      const inserted = await client.query(
        `INSERT INTO sales_area_assignments (
           branch_id, sales_agent_id, assigned_by, territory_id, area_name, coverage_notes,
           work_date, status, latitude, longitude, radius_meters
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, 'Assigned', $8, $9, $10)
         RETURNING assignment_id`,
        [
          agent.branch_id,
          agentId,
          user.id,
          territoryId,
          areaName,
          coverageNotes || null,
          workDate,
          latitude,
          longitude,
          Math.min(20000, Math.max(100, effectiveRadius)),
        ]
      );
      const assignmentId = inserted.rows[0].assignment_id;

      for (const productId of productIds) {
        await client.query(
          `INSERT INTO sales_area_assignment_products (assignment_id, product_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [assignmentId, productId]
        );
      }

      await client.query('COMMIT');

      const detail = await pool.query(
        `SELECT ${AREA_ASSIGNMENT_SELECT}
         ${AREA_ASSIGNMENT_FROM}
         WHERE saa.assignment_id = $1`,
        [assignmentId]
      );
      const productsByAssignment = await loadAssignmentProducts(pool, [assignmentId]);
      await notifyAreaScheduleAssigned(pool, {
        userId: agentId,
        workDate,
        areaName,
      });

      return res.status(201).json({
        success: true,
        message: `Assigned ${areaName} for ${workDate}.`,
        data: withProducts(detail.rows[0], productsByAssignment),
        meta: {
          hasMapLocation: hasCoords,
          warnings: conflictCheck.warnings,
        },
      });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Branch Manager] POST sales area-assignments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create area assignment.' });
  }
});

export default router;