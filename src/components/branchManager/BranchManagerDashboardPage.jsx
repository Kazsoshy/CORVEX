import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../../data/branchManagerMockData';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { getCurrentUser } from '../../api/authService.js';
import { getBranchAnalytics, getBranchAlerts } from '../../api/branchManagerService.js';
import { getReportCollection, getReportSales } from '../../api/reportsService.js';
import { fetchNotifications } from '../../api/notificationService.js';
import { fetchApprovalCenterSummary } from '../../api/approvalsService.js';
import { ChartDrilldownModal } from '../shared/ChartDrilldownModal.jsx';
import { useChartDrilldown } from '../../hooks/useChartDrilldown.js';
import { formatCurrency as formatMoney } from '../../utils/formatters.js';
import { buildBranchPulseInsights } from '../../utils/branchManagerPulse.js';

function money(value) {
  return formatMoney(Number(value) || 0);
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return `${Number(value)}%`;
}

function popHint(comparison) {
  if (!comparison) return null;
  if (comparison.changePct == null) {
    return comparison.direction === 'flat' ? 'Flat vs prior week' : 'No prior-week baseline';
  }
  const arrow = comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '→';
  return `${arrow} ${Math.abs(comparison.changePct)}% vs prior week`;
}

function Panel({ title, sub, action, children, className = '' }) {
  return (
    <section className={`panel content-panel relative overflow-hidden ${className}`.trim()}>
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center mb-3">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {sub ? <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>{sub}</p> : null}
        </div>
        {action || null}
      </div>
      {children}
    </section>
  );
}

function KpiCard({ label, value, detail, hint, title, onClick, warn }) {
  const clickable = typeof onClick === 'function';
  return (
    <article
      className={`stat-card${clickable ? ' is-clickable' : ''}`}
      title={title}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      style={warn ? { borderColor: 'rgba(185, 28, 28, 0.35)' } : undefined}
    >
      <span className="stat-label">{label}</span>
      <strong className="stat-value" style={{ fontSize: '1.15rem', lineHeight: 1.2 }}>{value}</strong>
      {detail ? <span className="muted" style={{ display: 'block', fontSize: '0.75rem', marginTop: 4 }}>{detail}</span> : null}
      {hint ? <span className="muted" style={{ display: 'block', fontSize: '0.72rem' }}>{hint}</span> : null}
    </article>
  );
}

/**
 * Simplified BM morning command center.
 * Keep only what answers: collections? sales? risk? inventory/field? what needs action?
 * Deeper analytics stay in Reports.
 */
export function BranchManagerDashboardPage({
  navigate,
  branchName,
  opsBase,
  showToast,
}) {
  const currentUser = getCurrentUser();
  const userName = currentUser?.fullName || 'User';
  const userBranch = currentUser?.branch?.name || branchName || 'Branch';
  const { drilldown, closeDrilldown, openApiDrilldown } = useChartDrilldown({ showToast });

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertsError, setAlertsError] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [approvalsError, setApprovalsError] = useState(null);
  const [collectionData, setCollectionData] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [chartsError, setChartsError] = useState(null);
  const [unread, setUnread] = useState(0);

  async function refresh() {
    setLoading(true);
    setAnalyticsError(null);
    setAlertsError(null);
    setApprovalsError(null);
    setChartsError(null);

    const [a, al, ap, coll, sales, notif] = await Promise.all([
      getBranchAnalytics(),
      getBranchAlerts(),
      fetchApprovalCenterSummary(),
      getReportCollection(),
      getReportSales(),
      fetchNotifications(),
    ]);

    if (a.success) setAnalytics(a.data);
    else {
      setAnalytics(null);
      setAnalyticsError(a.message || 'Analytics unavailable.');
    }

    if (al.success) setAlerts(al.data?.alerts || []);
    else {
      setAlerts([]);
      setAlertsError(al.message || 'Alerts unavailable.');
    }

    if (ap.success) setApprovals(ap.data);
    else {
      setApprovals(null);
      setApprovalsError(ap.message || 'Approvals unavailable.');
    }

    if (coll.success) setCollectionData(coll.data);
    else setCollectionData(null);
    if (sales.success) setSalesData(sales.data);
    else setSalesData(null);
    if (!coll.success && !sales.success) setChartsError('Charts unavailable.');

    if (notif.success) {
      const rows = notif.data || [];
      setUnread(rows.filter((n) => n.status !== 'Read').length);
    } else setUnread(0);

    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const period = analytics?.period;
  const periodLine = period
    ? `${period.label} · ${period.currentStart} → ${period.currentEnd}`
    : (collectionData?.periodLabel || 'Last 7 Days');

  const collectionsAmount = analytics?.collectionsAmount7d ?? collectionData?.summary?.totalCollected;
  const collectionRate = analytics?.collectionRate ?? collectionData?.summary?.collectionRate;
  const collectionTarget = analytics?.collectionTarget7d ?? collectionData?.summary?.totalTarget;

  const salesAmount = analytics?.salesAmount7d ?? salesData?.summary?.totalActual;
  const salesRate = analytics?.salesEfficiency ?? salesData?.summary?.salesEfficiency;
  const salesTarget = analytics?.salesTarget7d ?? salesData?.summary?.totalTarget;

  const overdueCount = analytics?.overdueAccounts;
  const overdueExposure = analytics?.overdueExposure;
  const pendingCi = approvals?.ci_pending ?? analytics?.pendingCI ?? 0;
  const needsAction = approvals?.needs_action;
  const stockAlerts = analytics?.stockAlertsCount ?? analytics?.stockAlerts ?? 0;
  const inventoryHealth = analytics?.inventoryHealth;
  const criticalAlerts = alerts.filter((a) => a.severity === 'Critical');

  const pulse = useMemo(
    () => buildBranchPulseInsights({
      analytics,
      analyticsError: Boolean(analyticsError),
      alerts,
      alertsError: Boolean(alertsError),
      approvals,
      approvalsError: Boolean(approvalsError),
      opsBase,
    }).slice(0, 3),
    [analytics, analyticsError, alerts, alertsError, approvals, approvalsError, opsBase]
  );

  const topOverdue = (analytics?.topOverdueCustomers || []).slice(0, 3);
  const stockItems = (analytics?.inventoryAttention || []).slice(0, 3);
  const dispatch = analytics?.todayDispatch;
  const pendingField = analytics?.pendingFieldVisits;

  if (loading) {
    return <LoadingState variant="dashboard" message="Loading dashboard..." />;
  }

  return (
    <div className="page">
      {/* A. Header — who / when */}
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{userBranch}</p>
          <h2 style={{ marginBottom: 2 }}>{userName}</h2>
          <p className="muted" style={{ margin: 0 }}>{periodLine}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="button ghost" type="button" onClick={refresh}>Refresh</button>
          <Link
            to={`${opsBase}/notifications`}
            className="relative p-2 text-ink/70 hover:text-blue hover:bg-blue/5 rounded-full transition-colors"
            aria-label={`${unread} unread notifications`}
          >
            <NavIcon name="bell" />
            {unread > 0 ? (
              <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex justify-center items-center rounded-full bg-red text-white text-[0.7rem] font-bold border-2 border-mint">
                {unread}
              </span>
            ) : null}
          </Link>
        </div>
      </section>

      {analyticsError ? (
        <EmptyState
          title="Branch overview unavailable"
          description={analyticsError}
          actionLabel="Retry"
          onAction={refresh}
        />
      ) : (
        <>
          {/* B. Five KPIs — amount + target context only */}
          <section className="stats-grid" style={{ marginBottom: 12 }}>
            <KpiCard
              label="Collections"
              value={collectionsAmount == null ? '—' : money(collectionsAmount)}
              detail={`${pct(collectionRate)} of target${collectionTarget != null ? ` · ${money(collectionTarget)}` : ''}`}
              hint={popHint(analytics?.collectionsPeriodComparison)}
              title="Confirmed collections vs configured 7-day target. Same formula as Reports → Collection."
              onClick={() => navigate(`${opsBase}/reports/collection`)}
              warn={collectionRate != null && collectionRate < 100}
            />
            <KpiCard
              label="Sales"
              value={salesAmount == null ? '—' : money(salesAmount)}
              detail={`${pct(salesRate)} of target${salesTarget != null ? ` · ${money(salesTarget)}` : ''}`}
              hint={popHint(analytics?.salesPeriodComparison)}
              title="Confirmed sales revenue vs configured 7-day target. Same formula as Reports → Sales."
              onClick={() => navigate(`${opsBase}/reports/sales`)}
              warn={salesRate != null && salesRate < 100}
            />
            <KpiCard
              label="Overdue"
              value={overdueCount == null ? '—' : String(overdueCount)}
              detail={overdueExposure != null ? `${money(overdueExposure)} exposure` : 'Customers past due'}
              hint="Unpaid past-due invoices"
              title="Distinct customers with at least one unpaid past-due invoice."
              onClick={() => navigate(`${opsBase}/customers`)}
              warn={Number(overdueCount) > 0}
            />
            <KpiCard
              label="Needs approval"
              value={needsAction == null && pendingCi == null ? '—' : String(needsAction ?? pendingCi)}
              detail={`${pendingCi || 0} credit reviews`}
              hint="Open Approval Center"
              title="Pending decisions in Approval Center for this branch."
              onClick={() => navigate(`${opsBase}/approval-center`)}
              warn={(needsAction ?? pendingCi) > 0}
            />
            <KpiCard
              label="Stock health"
              value={pct(inventoryHealth)}
              detail={`${stockAlerts} product${stockAlerts === 1 ? '' : 's'} need attention`}
              hint="Branch inventory only"
              title="Sufficient products ÷ eligible monitored products. Same as Reports inventory health."
              onClick={() => navigate(`${opsBase}/branch-inventory`)}
              warn={stockAlerts > 0}
            />
          </section>

          {/* C. What to do next — max 3 insights */}
          <Panel title="What needs attention" sub="Top issues for this branch right now">
            {pulse.length ? (
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {pulse.map((item) => (
                  <li key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex gap-2 items-start">
                      <StatusBadge
                        status={
                          item.severity === 'critical' ? 'Critical'
                            : item.severity === 'warning' ? 'Warning'
                              : item.severity === 'ok' ? 'Clear'
                                : 'Info'
                        }
                      />
                      <span>{item.text}</span>
                    </div>
                    <button className="button ghost" type="button" onClick={() => navigate(item.href)}>
                      {item.actionLabel}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No priority insights from loaded metrics.</p>
            )}
          </Panel>

          {/* D. Act today — alerts + approvals only */}
          <div className="grid two-up">
            <Panel
              title="Critical alerts"
              sub={alertsError ? 'Unavailable' : `${criticalAlerts.length} open`}
              action={<button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/alerts`)}>All alerts</button>}
            >
              {alertsError ? (
                <EmptyState title="Alerts unavailable" description={alertsError} actionLabel="Retry" onAction={refresh} />
              ) : criticalAlerts.length ? (
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {criticalAlerts.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="button ghost"
                        style={{ textAlign: 'left', padding: 0, height: 'auto', width: '100%' }}
                        onClick={() => navigate(a.linkPath || `${opsBase}/alerts`)}
                      >
                        <strong style={{ display: 'block' }}>{a.title}</strong>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>{a.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No critical exceptions open.</p>
              )}
            </Panel>

            <Panel
              title="Pending approvals"
              sub={approvalsError ? 'Unavailable' : 'Decisions waiting on you'}
              action={<button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>Open</button>}
            >
              {approvalsError ? (
                <EmptyState title="Approvals unavailable" description={approvalsError} actionLabel="Retry" onAction={refresh} />
              ) : approvals ? (
                <div className="flex flex-col gap-2">
                  <p style={{ margin: 0 }}>
                    <strong style={{ fontSize: '1.5rem' }}>{approvals.needs_action || 0}</strong>
                    <span className="muted"> total</span>
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                    CI {approvals.ci_pending || 0}
                    {' · '}Restock {approvals.restocks_pending || 0}
                    {' · '}Count {approvals.stock_counts_pending || 0}
                    {' · '}Transfer {approvals.transfers_pending || 0}
                  </p>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No pending approvals.</p>
              )}
            </Panel>
          </div>

          {/* E. Trends — two charts only */}
          <div className="grid two-up">
            <Panel title="Collections vs target" sub="Last 7 days">
              {chartsError && !collectionData ? (
                <EmptyState title="Chart unavailable" description={chartsError} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={collectionData?.daily || []}
                    style={{ cursor: 'pointer' }}
                    onClick={(state) => {
                      const day = state?.activeLabel;
                      if (!day) return;
                      openApiDrilldown(
                        { type: 'collection_day', day },
                        {
                          title: 'Daily collections',
                          category: `Day: ${day}`,
                          dateRange: periodLine,
                          columnSet: 'collection',
                          filenameBase: `collections-${day}`,
                        }
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="target" name="Target" stroke="#BADBE9" fill="#BADBE9" strokeWidth={2} strokeDasharray="5 5" />
                    <Area type="monotone" dataKey="amount" name="Collected" stroke="#1A4162" fill="#1A4162" fillOpacity={0.12} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Sales vs target" sub="Last 7 days">
              {chartsError && !salesData ? (
                <EmptyState title="Chart unavailable" description={chartsError} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={salesData?.weekly || []}
                    style={{ cursor: 'pointer' }}
                    onClick={(state) => {
                      const day = state?.activeLabel;
                      if (!day) return;
                      openApiDrilldown(
                        { type: 'sales_day', day },
                        {
                          title: 'Daily sales invoices',
                          category: `Day: ${day}`,
                          dateRange: periodLine,
                          columnSet: 'sales',
                          filenameBase: `sales-${day}`,
                        }
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="target" name="Target" fill="#BADBE9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Actual" fill="#1A4162" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* F. One risk row — overdue + inventory (+ light field status) */}
          <div className="grid two-up">
            <Panel
              title="Overdue focus"
              sub="Highest overdue exposure"
              action={<button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/reports/delinquency`)}>Details</button>}
            >
              {topOverdue.length ? (
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {topOverdue.map((c) => (
                    <li key={c.customerId}>
                      <button
                        type="button"
                        className="button ghost"
                        style={{ textAlign: 'left', padding: 0, height: 'auto', width: '100%' }}
                        onClick={() => navigate(`${opsBase}/customers/${c.customerId}`)}
                      >
                        <strong>{c.customerName}</strong>
                        <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                          {money(c.overdueAmount)} overdue · {c.daysOverdue}d
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No overdue customers right now.</p>
              )}
            </Panel>

            <Panel
              title="Inventory & field"
              sub="Stockouts and today’s dispatch"
              action={<button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/branch-inventory`)}>Inventory</button>}
            >
              <p style={{ margin: '0 0 10px' }}>
                Today: <strong>{dispatch?.completed ?? 0}/{dispatch?.assigned ?? 0}</strong> visits done
                {(pendingField?.missedOrOverdue || 0) > 0
                  ? <> · <strong>{pendingField.missedOrOverdue}</strong> past-due still open</>
                  : null}
              </p>
              {stockItems.length ? (
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {stockItems.map((p) => (
                    <li key={p.productId} className="flex justify-between gap-2">
                      <span>
                        <strong>{p.productName}</strong>
                        <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                          On hand {p.availableStock}
                        </span>
                      </span>
                      <StatusBadge status={p.stockStatus} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No stock alerts for this branch.</p>
              )}
              <div className="mt-3">
                <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations`)}>
                  Field ops
                </button>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* G. Short shortcuts */}
      <div className="flex flex-wrap gap-2 mt-2">
        <button className="button" type="button" onClick={() => navigate(`${opsBase}/leaflet`)}>Field Map</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>Approvals</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/branch-inventory`)}>Inventory</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/field-operations`)}>Field Ops</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/reports`)}>Reports</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/alerts`)}>Alerts</button>
      </div>

      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>
  );
}
