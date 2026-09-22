import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../../components/StatusBadge';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AdminPageBody } from '../admin/AdminPageBody';
import { BranchManagerPageBody } from '../branchManager/BranchManagerPageBody';
import LeafletMap from '../common/LeafletMap';
import { ALERTS, BRANCHES, BRANCH_RADAR, ENTERPRISE_KPIS, LEAFLET_LAYERS, MONTHLY_COLLECTIONS, MONTHLY_DELINQUENCY, MONTHLY_REVENUE, NOTIFICATIONS, OPERATING_MANAGER_PROFILE, REPORT_CATEGORIES, TREND_DATA, WEEKLY_COLLECTION_RATE, WEEKLY_SALES_RATE, SALES_ANALYTICS, INVENTORY_ANALYTICS, PAYMENT_ANALYTICS, formatCurrency, getBranchById, getHighestPerformingBranch, getLowestPerformingBranch } from '../../data/operatingManagerMockData';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { getExecutiveDashboard, getOperatingManagerAnalytics, getPerformanceHistory } from '../../api/reportsService';
import apiClient from '../../api/apiClient';
import { fetchCustomers, fetchCustomerById } from '../../api/salesService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { getCurrentUser } from '../../api/authService';
import { TerritoriesPage } from '../territories/TerritoriesPage';
import { fetchDigitalReceipts } from '../../api/digitalReceiptsService';
import { fetchSawResults } from '../../api/sawResultsService';
const COLORS = ['#2563eb', '#06b6d4', '#ef4444', '#f59e0b'];
const BRANCH_COLORS = {
  'Davao City': '#2563eb',
  'General Santos': '#10b981',
  'Davao Oriental': '#ef4444'
};
function actionButtonClass(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}
function PageToolbar({
  actions,
  onAction
}) {
  if (!actions?.length) return null;
  return <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map(action => <button key={action.label} className={actionButtonClass(action.variant)} type="button" onClick={() => onAction(action)}>
              {action.label}
            </button>)}
        </div>
      </div>
    </header>;
}
function StatsGrid({
  stats
}) {
  if (!stats?.length) return null;
  return <section className="stats-grid">
      {stats.map((stat, index) => <article key={stat.label} className="stat-card" style={{
      '--stat-index': index
    }}>
          <div className="stat-card-top">
            <span className="stat-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="stat-dot" aria-hidden="true" />
          </div>
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>)}
    </section>;
}
function SeverityBadge({
  severity
}) {
  return <StatusBadge status={severity} />;
}
function ChartCard({
  title,
  subtitle,
  children,
  action,
  onAction
}) {
  return <section className="panel content-panel">
      <div className="panel-section-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="muted" style={{
          margin: '2px 0 0',
          fontSize: '0.85rem'
        }}>{subtitle}</p> : null}
        </div>
        {action ? <button className="button ghost" type="button" onClick={onAction}>{action}</button> : null}
      </div>
      {children}
    </section>;
}
function DashboardPage({
  navigate
}) {
  const currentUser = getCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getExecutiveDashboard();
      if (result.success) {
        setData(result.data);
      } else {
        setError('Failed to load dashboard data.');
      }
      setLoading(false);
    }
    load();
  }, []);
  if (loading) return <LoadingState message="Loading Executive Dashboard…" />;
  if (error || !data) {
    return <div className="page">
        <section className="panel content-panel" style={{
        borderColor: '#fca5a5',
        background: 'rgba(220,38,38,0.04)'
      }}>
          <p style={{
          color: '#dc2626'
        }}>{error || 'No data available.'}</p>
        </section>
      </div>;
  }

  // ── Growth rate badge helper ────────────────────────────────────────────────
  function GrowthBadge({
    rate,
    label
  }) {
    if (rate === null || rate === undefined) return <span className="muted" style={{
      fontSize: '0.8rem'
    }}>No prior data</span>;
    const up = rate >= 0;
    return <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: '0.8rem',
      fontWeight: 700,
      color: up ? '#059669' : '#dc2626',
      padding: '2px 8px'
    }}>
        {up ? '▲' : '▼'} {Math.abs(rate)}% {label}
      </span>;
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const topBranch = data.branchSummary.length ? [...data.branchSummary].sort((a, b) => b.totalCollections - a.totalCollections)[0] : null;
  const bottomBranch = data.branchSummary.length ? [...data.branchSummary].sort((a, b) => a.totalCollections - b.totalCollections)[0] : null;
  const BRANCH_PALETTE = ['#2563eb', '#10b981', '#ef4444', '#f59e0b'];
  return <div className="page">
      {/* ── Greeting ── */}
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Executive Dashboard</p>
          <h2>{currentUser?.fullName || 'Operating Manager'}</h2>
          <p className="muted">{formatDisplayDate(new Date())}</p>
        </div>
        <Link to="/operating-manager/notifications" className="notification-bell" aria-label="Notifications" style={{
        flexShrink: 0,
        alignSelf: 'flex-start'
      }}>
          <NavIcon name="bell" />
        </Link>
      </section>

      {/* ── KPI Cards (all traceable to DB) ── */}
      {/*
          Total Collections  — SUM(amount)           FROM collection_payment  [Eq.5]
          Total Sales        — SUM(total_amount)      FROM sales_invoices      [Eq.6]
          Total Outstanding  — SUM(outstanding_balance) FROM customer_activity [Eq.9]
          Active Collectors  — COUNT(*) role=collector, status=Active
          Sales Visit Compl. — completed sales visits / total sales visits × 100
          Stock Alerts       — COUNT(*) available_stock <= reorder_level
       */}
      <StatsGrid stats={[{
      label: 'Total Collections (This Month)',
      value: formatCurrency(data.totalCollections)
    }, {
      label: 'Total Sales (This Month)',
      value: formatCurrency(data.totalSales)
    }, {
      label: 'Total Outstanding Balance',
      value: formatCurrency(data.totalOutstandingBalance)
    }, {
      label: 'Overdue Accounts',
      value: String(data.overdueCount)
    }, {
      label: 'Route Compliance',
      value: `${data.routeCompliance}%`
    }, {
      label: 'Stock Alerts',
      value: String(data.stockAlerts)
    }]} />

      {/* ── Growth indicators ── */}
      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Period-over-Period Analysis</h3>
            <p className="muted" style={{
            margin: '2px 0 0',
            fontSize: '0.85rem'
          }}>
              Current month vs previous month
            </p>
          </div>
        </div>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        padding: '8px 0'
      }}>
          {/* Sales Growth Rate (Equation 7) */}
          <div style={{
          padding: 16,
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0'
        }}>
            <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
              Sales Growth Rate (SGR)
            </span>
            <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            margin: '6px 0 4px',
            color: '#0f172a'
          }}>
              {data.salesGrowthRate !== null ? `${data.salesGrowthRate >= 0 ? '+' : ''}${data.salesGrowthRate}%` : '—'}
            </div>
            <GrowthBadge rate={data.salesGrowthRate} label="vs last month" />
            <p className="muted" style={{
            fontSize: '0.75rem',
            marginTop: 6
          }}>
              SGR = (₱{(data.totalSales / 1000).toFixed(0)}k − ₱{(data.totalSalesPrevious / 1000).toFixed(0)}k) / ₱{(data.totalSalesPrevious / 1000).toFixed(0)}k × 100
            </p>
          </div>
          {/* Collection Growth */}
          <div style={{
          padding: 16,
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0'
        }}>
            <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
              Collection Growth
            </span>
            <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            margin: '6px 0 4px',
            color: '#0f172a'
          }}>
              {data.collectionGrowthRate !== null ? `${data.collectionGrowthRate >= 0 ? '+' : ''}${data.collectionGrowthRate}%` : '—'}
            </div>
            <GrowthBadge rate={data.collectionGrowthRate} label="vs last month" />
            <p className="muted" style={{
            fontSize: '0.75rem',
            marginTop: 6
          }}>
              TC = SUM(Ci) — {data.totalCollectionsCount} transactions
            </p>
          </div>
          {/* Total Customers */}
          <div style={{
          padding: 16,
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0'
        }}>
            <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
              Total Customers
            </span>
            <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            margin: '6px 0 4px',
            color: '#0f172a'
          }}>
              {data.totalCustomers}
            </div>
            <span className="muted" style={{
            fontSize: '0.8rem'
          }}>
              {data.activeCustomers} active · {data.overdueCount} overdue
            </span>
            <p className="muted" style={{
            fontSize: '0.75rem',
            marginTop: 6
          }}>
              Source: customers table, grouped by branch_id
            </p>
          </div>
          {/* Inventory Health */}
          <div style={{
          padding: 16,
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0'
        }}>
            <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
              Inventory Health
            </span>
            <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            margin: '6px 0 4px',
            color: '#0f172a'
          }}>
              {data.inventoryHealth}%
            </div>
            <span className="muted" style={{
            fontSize: '0.8rem'
          }}>
              {data.stockAlerts} product{data.stockAlerts !== 1 ? 's' : ''} at or below reorder point
            </span>
            <p className="muted" style={{
            fontSize: '0.75rem',
            marginTop: 6
          }}>
              Source: branch_inventory — available_stock vs reorder_level
            </p>
          </div>
        </div>
      </section>

      {/* ── Collection trend + Sales trend (daily 7-day) ── */}
      <div className="grid two-up">
        <ChartCard title="Collection Trend (7 Days)" subtitle={`TC = SUM(Ci) — Source: collection_payment`}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.collectionTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5" />
              <Area type="monotone" dataKey="amount" name="Collected" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sales Trend (7 Days)" subtitle={`TS = SUM(Si) — Source: sales_invoices`}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5" />
              <Area type="monotone" dataKey="amount" name="Sales" stroke="#10b981" fill="#10b981" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Branch comparison bar chart ── */}
      {data.branchSummary.length > 1 && <ChartCard title="Branch-Level Descriptive Comparison" subtitle="Collections, Sales, Outstanding Balance — Source: collection_payment, sales_invoices, customer_activity grouped by branch">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.branchSummary.map(b => ({
          name: b.branchName.replace(' Branch', ''),
          Collections: b.totalCollections,
          Sales: b.totalSales,
          Outstanding: b.totalOutstanding
        }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{
            fontSize: 12
          }} />
              <YAxis tick={{
            fontSize: 11
          }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="Collections" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Sales" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>}

      {/* ── Branch summary table (Table 14 equivalent) ── */}
      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Branch Descriptive Summary</h3>
            <p className="muted" style={{
            margin: '2px 0 0',
            fontSize: '0.85rem'
          }}>
              Table 14 — Real database values · Current month
            </p>
          </div>
        </div>
        <div className="table-shell">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Total Collections</th>
                <th>Total Sales</th>
                <th>Available Inventory</th>
                <th>Outstanding Balance</th>
                <th>Customers</th>
              </tr>
            </thead>
            <tbody>
              {data.branchSummary.length === 0 ? <tr><td colSpan={6} style={{
                textAlign: 'center',
                color: '#64748b'
              }}>No branch data available.</td></tr> : data.branchSummary.map(b => {
              const inv = data.inventoryByBranch.find(i => i.branchId === b.branchId);
              return <tr key={b.branchId}>
                    <td><strong>{b.branchName}</strong></td>
                    <td>{formatCurrency(b.totalCollections)}</td>
                    <td>{formatCurrency(b.totalSales)}</td>
                    <td>{inv ? `${inv.totalAvailable.toLocaleString()} units` : '—'}</td>
                    <td>{formatCurrency(b.totalOutstanding)}</td>
                    <td>{b.customerCount} ({b.activeCustomers} active)</td>
                  </tr>;
            })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Top vs Bottom Branch ── */}
      {data.branchSummary.length > 1 && topBranch && bottomBranch && <div className="grid two-up">
          <div className="analytics-card" style={{
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: 12,
        padding: 20
      }}>
            <span style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#059669',
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}>
              Top Performer (by Collections)
            </span>
            <strong style={{
          display: 'block',
          fontSize: '1.1rem',
          marginTop: 6
        }}>{topBranch.branchName}</strong>
            <span className="muted" style={{
          fontSize: '0.85rem'
        }}>
              Collections: {formatCurrency(topBranch.totalCollections)} · Sales: {formatCurrency(topBranch.totalSales)}
            </span>
            <p className="muted" style={{
          fontSize: '0.75rem',
          marginTop: 6
        }}>
              Measure: SUM(amount) FROM collection_payment WHERE branch_id = {topBranch.branchId}
            </p>
          </div>
          <div className="analytics-card" style={{
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 12,
        padding: 20
      }}>
            <span style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#dc2626',
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}>
              Lowest Collections
            </span>
            <strong style={{
          display: 'block',
          fontSize: '1.1rem',
          marginTop: 6
        }}>{bottomBranch.branchName}</strong>
            <span className="muted" style={{
          fontSize: '0.85rem'
        }}>
              Collections: {formatCurrency(bottomBranch.totalCollections)} · Outstanding: {formatCurrency(bottomBranch.totalOutstanding)}
            </span>
            <p className="muted" style={{
          fontSize: '0.75rem',
          marginTop: 6
        }}>
              Measure: SUM(amount) FROM collection_payment WHERE branch_id = {bottomBranch.branchId}
            </p>
          </div>
        </div>}

      <PerformanceHistoryPanel />
      {/* ── Staff & Operations metrics ── */}
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Staff &amp; Operations Metrics</h3></div>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16,
        padding: '8px 0'
      }}>
          {[{
          label: 'Active Collectors',
          value: data.activeCollectors,
          source: 'users, role=collector, status=Active'
        }, {
          label: 'Active Sales Agents',
          value: data.activeSalesAgents,
          source: 'users, role=sales_staff, status=Active'
        }, {
          label: 'Route Compliance',
          value: `${data.routeCompliance}%`,
          source: 'field_visits: Completed/Total × 100'
        }, {
          label: 'Sales Visit Compl.',
          value: `${data.salesVisitCompletion}%`,
          source: 'field_visits: type=Sales Completed/Total × 100'
        }, {
          label: 'Total Customers',
          value: data.totalCustomers,
          source: 'customers table COUNT(*)'
        }, {
          label: 'Overdue Accounts',
          value: data.overdueCount,
          source: 'customer_activity: outstanding_balance > 0'
        }].map(m => <div key={m.label} style={{
          padding: 14,
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0'
        }}>
              <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'block'
          }}>{m.label}</span>
              <strong style={{
            fontSize: '1.5rem',
            display: 'block',
            margin: '4px 0'
          }}>{m.value}</strong>
              <span className="muted" style={{
            fontSize: '0.7rem'
          }}>{m.source}</span>
            </div>)}
        </div>
      </section>

      <PageToolbar actions={[{
      label: 'Compare Branches',
      to: '/operating-manager/branch-performance/comparison'
    }, {
      label: 'Leaflet | OpenStreetMap',
      to: '/operating-manager/leaflet',
      variant: 'secondary'
    }, {
      label: 'Reports',
      to: '/operating-manager/reports',
      variant: 'secondary'
    }]} onAction={a => navigate(a.to)} />

    </div>;
}

// ── PerformanceHistoryPanel — historical data from performance_summary ────────
function PerformanceHistoryPanel() {
  const [perfData, setPerfData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getPerformanceHistory();
      if (result.success) setPerfData(result.data);
      setLoading(false);
    }
    load();
  }, []);
  if (loading) return <section className="panel content-panel">
      <div className="panel-section-header"><h3>Historical Branch Performance</h3></div>
      <p className="muted" style={{
      padding: '16px 0'
    }}>Loading performance history...</p>
    </section>;
  if (!perfData || !perfData.byBranch?.length) return null;
  const periodMap = {};
  perfData.byBranch.forEach(branch => {
    branch.data.forEach(pt => {
      if (!periodMap[pt.period]) periodMap[pt.period] = {
        period: pt.period
      };
      periodMap[pt.period][branch.branchName.replace(' Branch', '') + ' Sales'] = pt.totalSales;
      periodMap[pt.period][branch.branchName.replace(' Branch', '') + ' Colltns'] = pt.totalCollections;
    });
  });
  const chartData = Object.values(periodMap);
  const PALETTE = ['#2563eb', '#06b6d4', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6'];
  const lineKeys = [];
  perfData.byBranch.forEach((branch, i) => {
    lineKeys.push({
      key: branch.branchName.replace(' Branch', '') + ' Sales',
      color: PALETTE[i * 2 % PALETTE.length]
    });
    lineKeys.push({
      key: branch.branchName.replace(' Branch', '') + ' Colltns',
      color: PALETTE[(i * 2 + 1) % PALETTE.length]
    });
  });
  return <section className="panel content-panel">
      <div className="panel-section-header">
        <div>
          <h3>Historical Branch Performance</h3>
          <p className="muted" style={{
          margin: '2px 0 0',
          fontSize: '0.85rem'
        }}>
            Source: performance_summary — total_sales, total_collections, inventory_accuracy
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="period" tick={{
          fontSize: 11
        }} />
          <YAxis tick={{
          fontSize: 11
        }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={v => formatCurrency(v)} />
          <Legend />
          {lineKeys.map(l => <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={2} dot={false} />)}
        </LineChart>
      </ResponsiveContainer>
      <div className="table-shell" style={{
      marginTop: 16
    }}>
        <table className="corvex-table">
          <thead><tr><th>Branch</th><th>Latest Sales</th><th>Latest Collections</th><th>Inventory Accuracy</th></tr></thead>
          <tbody>
            {perfData.byBranch.map(branch => {
            const latest = branch.data[branch.data.length - 1];
            if (!latest) return null;
            return <tr key={branch.branchName}>
                  <td><strong>{branch.branchName}</strong></td>
                  <td>{formatCurrency(latest.totalSales)}</td>
                  <td>{formatCurrency(latest.totalCollections)}</td>
                  <td>{latest.inventoryAccuracy}%</td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>
    </section>;
}
function BranchPerformanceHub({
  navigate
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const tabs = [{
    key: 'overview',
    label: 'Overview'
  }, {
    key: 'comparison',
    label: 'Comparison'
  }, {
    key: 'trends',
    label: 'Trends'
  }];
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiClient.get('/branches');
        if (res.data.success) setBranches(res.data.data);
      } catch (err) {
        console.error('[BranchPerformanceHub] load error:', err.message);
      }
      setLoading(false);
    }
    load();
  }, []);
  if (loading) return <LoadingState message="Loading branch data…" />;

  // Build chart data from real DB fields
  const branchBarData = branches.map(b => ({
    name: (b.branch_name || '').replace(' Branch', ''),
    Staff: Number(b.active_staff) || 0,
    Customers: Number(b.customer_count) || 0,
    LowStock: Number(b.low_stock_count) || 0
  }));
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={activeTab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>)}
      </div>

      {activeTab === 'overview' && <>
          {/* Staff / Customers / Low Stock bar — real DB data */}
          {branchBarData.length > 0 && <ChartCard title="Branch Staff & Customer Overview" subtitle="Source: branches, users, customers, branch_inventory tables">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={branchBarData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{
              fontSize: 12
            }} />
                  <YAxis tick={{
              fontSize: 12
            }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Staff" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Customers" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="LowStock" name="Low Stock Items" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>}

          {/* Branch directory — real fields: phone, email, region, manager */}
          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Branch Directory</h3>
              <p className="muted" style={{
            margin: 0,
            fontSize: '0.82rem'
          }}>Source: branches table — phone, email, region, manager_id</p>
            </div>
            <div className="table-shell">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Region</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Manager</th>
                    <th>Active Staff</th>
                    <th>Customers</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.length === 0 ? <tr><td colSpan={8} style={{
                  textAlign: 'center',
                  color: '#64748b'
                }}>No branches found.</td></tr> : branches.map(b => <tr key={b.id}>
                      <td>
                        <strong>{b.branch_name}</strong>
                        <br /><span className="muted" style={{
                    fontSize: '0.75rem'
                  }}>{b.address}</span>
                      </td>
                      <td>{b.region || '—'}</td>
                      <td>{b.phone || '—'}</td>
                      <td>{b.email || '—'}</td>
                      <td>{b.manager_name || '—'}</td>
                      <td>{b.active_staff || 0}</td>
                      <td>{b.customer_count || 0}</td>
                      <td>
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </>}

      {activeTab === 'comparison' && <BranchComparisonPage navigate={navigate} showToast={() => {}} />}
      {activeTab === 'trends' && <HistoricalTrendsPage />}
    </div>;
}
function BranchComparisonPage({
  navigate,
  showToast
}) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(t);
  }, []);
  if (loading) return <LoadingState message="Loading branch comparison…" />;
  return <div className="page">
      <div className="grid two-up">
        <ChartCard title="Monthly Revenue by Branch" subtitle="6-month trend">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={MONTHLY_REVENUE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map(b => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.08} strokeWidth={2} />)}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Collections by Branch">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={MONTHLY_COLLECTIONS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map(b => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="KPI Comparison Matrix">
        <div className="table-shell">
          <table className="corvex-table">
            <thead><tr><th>Metric</th>{BRANCHES.map(b => <th key={b.id}>{b.name}</th>)}</tr></thead>
            <tbody>
              {[{
              metric: 'Collection Rate',
              key: 'collectionRate',
              suffix: '%'
            }, {
              metric: 'Sales Completion',
              key: 'salesCompletionRate',
              suffix: '%'
            }, {
              metric: 'Inventory Health',
              key: 'inventoryHealth',
              suffix: '%'
            }, {
              metric: 'Route Compliance',
              key: 'routeCompliance',
              suffix: '%'
            }, {
              metric: 'Overdue Accounts',
              key: 'overdueAccounts',
              suffix: ''
            }, {
              metric: 'Performance Score',
              key: 'performanceScore',
              suffix: '/100'
            }].map(row => <tr key={row.metric}>
                  <td>{row.metric}</td>
                  {BRANCHES.map(b => <td key={b.id}>{b[row.key]}{row.suffix}</td>)}
                </tr>)}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>;
}
function HistoricalTrendsPage() {
  return <div className="page">
      <div className="grid two-up">
        <ChartCard title="Collection Rate Over Time" subtitle="Weekly % by branch">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={WEEKLY_COLLECTION_RATE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{
              fontSize: 12
            }} />
              <YAxis domain={[75, 100]} tick={{
              fontSize: 12
            }} unit="%" />
              <Tooltip formatter={v => `${v}%`} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map(b => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Delinquency Trend" subtitle="Monthly overdue accounts">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={MONTHLY_DELINQUENCY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Legend />
              {Object.keys(BRANCH_COLORS).map(b => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} strokeWidth={2} />)}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Branch Performance Radar" subtitle="Multi-dimensional KPI comparison">
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={BRANCH_RADAR}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="metric" tick={{
            fontSize: 12
          }} />
            {Object.keys(BRANCH_COLORS).map(b => <Radar key={b} name={b} dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} />)}
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>;
}
function BranchDetailPage({
  branchId,
  navigate
}) {
  const branch = getBranchById(branchId);
  if (!branch) return <EmptyState title="Branch not found" description="Select a branch from Branch Performance." />;
  const kpiData = [{
    metric: 'Collection',
    value: branch.collectionRate
  }, {
    metric: 'Sales',
    value: branch.salesCompletionRate
  }, {
    metric: 'Inventory',
    value: branch.inventoryHealth
  }, {
    metric: 'Compliance',
    value: branch.routeCompliance
  }, {
    metric: 'Growth',
    value: branch.growthScore
  }];
  return <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{branch.status}</p>
          <h2>{branch.name}</h2>
          <p className="muted">{branch.collectors} collectors · {branch.salesAgents} sales agents · {branch.locations} locations</p>
        </div>
      </section>

      <StatsGrid stats={[{
      label: 'Performance Score',
      value: `${branch.performanceScore}/100`
    }, {
      label: 'Risk Score',
      value: `${branch.riskScore}/100`
    }, {
      label: 'Growth Score',
      value: `${branch.growthScore}/100`
    }, {
      label: 'Collection Rate',
      value: `${branch.collectionRate}%`
    }, {
      label: 'Sales Completion',
      value: `${branch.salesCompletionRate}%`
    }, {
      label: 'Inventory Health',
      value: `${branch.inventoryHealth}%`
    }]} />

      <div className="grid two-up">
        <ChartCard title="KPI Profile" subtitle="Branch performance dimensions">
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={kpiData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{
              fontSize: 12
            }} />
              <Radar name={branch.name} dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.18} />
              <Tooltip formatter={v => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Financial Overview">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{
            name: 'Revenue',
            amount: branch.revenue
          }, {
            name: 'Collections',
            amount: branch.collections
          }, {
            name: 'Sales',
            amount: branch.sales
          }, {
            name: 'Delinquency',
            amount: branch.delinquencies
          }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {[0, 1, 2, 3].map(i => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <PageToolbar actions={[{
      label: 'View Leaflet | OpenStreetMap',
      to: '/operating-manager/leaflet',
      variant: 'secondary'
    }, {
      label: 'View Alerts',
      to: '/operating-manager/alerts',
      variant: 'secondary'
    }, {
      label: 'Back',
      to: '/operating-manager/branch-performance',
      variant: 'ghost'
    }]} onAction={a => navigate(a.to)} />
    </div>;
}
function ReportsHubPage({
  navigate,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('collections');
  const tabDefs = [{
    key: 'collections',
    label: 'Collections'
  }, {
    key: 'sales',
    label: 'Sales'
  }, {
    key: 'inventory',
    label: 'Inventory'
  }, {
    key: 'delinquency',
    label: 'Payments & Delinquency'
  }, {
    key: 'executive',
    label: 'Executive'
  }];
  const exportRow = <PageToolbar actions={[{
    label: 'Export PDF',
    action: 'pdf'
  }, {
    label: 'Export Excel',
    action: 'excel',
    variant: 'secondary'
  }]} onAction={a => showToast(`${a.label} started.`, 'success')} />;
  return <div className="page">
      <div className="segmented-control">
        {tabDefs.map(t => <button key={t.key} className={activeTab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>)}
      </div>

      {activeTab === 'collections' && <>
          <div className="grid two-up">
            <ChartCard title="Monthly Collections by Branch" subtitle="6-month trend">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={MONTHLY_COLLECTIONS}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map(b => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.08} strokeWidth={2} />)}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Collection Rate by Branch" subtitle="Weekly %">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={WEEKLY_COLLECTION_RATE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{
                fontSize: 12
              }} />
                  <YAxis domain={[75, 100]} tick={{
                fontSize: 12
              }} unit="%" />
                  <Tooltip formatter={v => `${v}%`} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map(b => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Branch Collection Summary">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Branch</th><th>Collections</th><th>Rate</th><th>Overdue</th><th>Compliance</th></tr></thead>
                <tbody>
                  {BRANCHES.map(b => <tr key={b.id}><td>{b.name}</td><td>{formatCurrency(b.collections)}</td><td>{b.collectionRate}%</td><td>{b.overdueAccounts}</td><td>{b.routeCompliance}%</td></tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
          {exportRow}
        </>}

      {activeTab === 'sales' && <>
          <StatsGrid stats={[{
        label: 'Sales Today',
        value: formatCurrency(SALES_ANALYTICS.salesToday)
      }, {
        label: 'Total Sales (YTD)',
        value: formatCurrency(ENTERPRISE_KPIS.totalSales)
      }, {
        label: 'Total Revenue (YTD)',
        value: formatCurrency(ENTERPRISE_KPIS.totalRevenue)
      }]} />

          <div className="grid two-up">
            <ChartCard title="Monthly Revenue by Branch" subtitle="6-month trend">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={MONTHLY_REVENUE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map(b => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.08} strokeWidth={2} />)}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sales Completion Rate" subtitle="Weekly %">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={WEEKLY_SALES_RATE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{
                fontSize: 12
              }} />
                  <YAxis domain={[65, 100]} tick={{
                fontSize: 12
              }} unit="%" />
                  <Tooltip formatter={v => `${v}%`} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map(b => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Top-Selling Products">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Product Name</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                <tbody>
                  {SALES_ANALYTICS.topSellingProducts.map(p => <tr key={p.id}>
                      <td>{p.name}</td><td>{p.category}</td><td>{p.quantitySold}</td><td>{formatCurrency(p.revenue)}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Sales Summary">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Branch</th><th>Sales Volume</th><th>Revenue</th><th>Completion Rate</th><th>Agents</th></tr></thead>
                <tbody>
                  {BRANCHES.map(b => <tr key={b.id}><td>{b.name}</td><td>{formatCurrency(b.sales)}</td><td>{formatCurrency(b.revenue)}</td><td>{b.salesCompletionRate}%</td><td>{b.salesAgents}</td></tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
          {exportRow}
        </>}

      {activeTab === 'inventory' && <>
          <StatsGrid stats={[{
        label: 'Current Stock Levels',
        value: INVENTORY_ANALYTICS.currentStockLevels.toLocaleString()
      }, {
        label: 'Inbound Stock',
        value: INVENTORY_ANALYTICS.stockMovement.inbound.toLocaleString()
      }, {
        label: 'Outbound Stock',
        value: INVENTORY_ANALYTICS.stockMovement.outbound.toLocaleString()
      }, {
        label: 'Sync Status',
        value: INVENTORY_ANALYTICS.syncStatus.status
      }]} />

          <div className="grid two-up">
            <ChartCard title="Inventory Health by Branch" subtitle="Current health scores">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={BRANCHES.map(b => ({
              name: b.name,
              health: b.inventoryHealth,
              value: b.inventoryValue / 1000000
            }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{
                fontSize: 12
              }} />
                  <YAxis yAxisId="left" domain={[0, 100]} tick={{
                fontSize: 12
              }} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{
                fontSize: 11
              }} tickFormatter={v => `${v.toFixed(1)}M`} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="health" name="Health %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="value" name="Value (M PHP)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Low Stock Items" subtitle="Requires immediate attention">
              <div className="table-shell">
                <table className="corvex-table">
                  <thead><tr><th>Product Name</th><th>Branch</th><th>Current Stock</th><th>Status</th></tr></thead>
                  <tbody>
                    {INVENTORY_ANALYTICS.lowStockItems.map(item => <tr key={item.id}>
                        <td>{item.name}</td><td>{item.branch}</td><td>{item.currentStock}</td>
                        <td><SeverityBadge severity={item.status} /></td>
                      </tr>)}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>
          {exportRow}
        </>}

      {activeTab === 'delinquency' && <>
          <StatsGrid stats={[{
        label: 'Outstanding Receivables',
        value: formatCurrency(PAYMENT_ANALYTICS.outstandingReceivables)
      }, {
        label: 'Current Accounts',
        value: PAYMENT_ANALYTICS.currentAccountsCount.toLocaleString()
      }, {
        label: 'Credit Utilization',
        value: `${PAYMENT_ANALYTICS.creditUtilizationRate}%`
      }]} />

          <div className="grid two-up">
            <ChartCard title="Aging of Receivables" subtitle="Amount by age bucket">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={PAYMENT_ANALYTICS.agingOfReceivables}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="amount" name="Amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Monthly Delinquency Trend" subtitle="Overdue accounts per branch">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={MONTHLY_DELINQUENCY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 12
              }} />
                  <Tooltip />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map(b => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} strokeWidth={2} />)}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Delinquency by Branch" subtitle="Current overdue counts">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={BRANCHES.map(b => ({
              name: b.name,
              overdue: b.overdueAccounts,
              risk: b.riskScore
            }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 12
              }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="overdue" name="Overdue Accounts" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="risk" name="Risk Score" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          {exportRow}
        </>}

      {activeTab === 'executive' && <>
          <StatsGrid stats={[{
        label: 'Total Revenue',
        value: formatCurrency(ENTERPRISE_KPIS.totalRevenue)
      }, {
        label: 'Total Collections',
        value: formatCurrency(ENTERPRISE_KPIS.totalCollections)
      }, {
        label: 'Total Sales',
        value: formatCurrency(ENTERPRISE_KPIS.totalSales)
      }, {
        label: 'Total Delinquencies',
        value: formatCurrency(ENTERPRISE_KPIS.totalDelinquencies)
      }]} />
          <ChartCard title="Branch Performance Radar" subtitle="Multi-dimensional comparison">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={BRANCH_RADAR}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" tick={{
              fontSize: 12
            }} />
                {Object.keys(BRANCH_COLORS).map(b => <Radar key={b} name={b} dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} />)}
                <Legend />
                <Tooltip formatter={v => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
          {exportRow}
        </>}
    </div>;
}
function LeafletPage({
  navigate,
  subPage
}) {
  const [layers, setLayers] = useState(LEAFLET_LAYERS);
  const [filters, setFilters] = useState({
    branch: 'All Branches',
    dateRange: 'This Month',
    staffType: 'All Staff'
  });
  const toggleLayer = id => setLayers(prev => prev.map(l => l.id === id ? {
    ...l,
    active: !l.active
  } : l));
  const mockBranchMarkers = useMemo(() => [{
    id: 'davao-city',
    position: [7.1907, 125.4553],
    label: 'DC',
    color: '#2563eb',
    popup: 'Davao City Branch - Healthy'
  }, {
    id: 'general-santos',
    position: [6.1164, 125.1716],
    label: 'GS',
    color: '#10b981',
    popup: 'General Santos Branch - Top Performer'
  }, {
    id: 'davao-oriental',
    position: [6.9534, 126.1558],
    label: 'DO',
    color: '#ef4444',
    popup: 'Davao Oriental Branch - Needs Attention'
  }], []);
  return <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Map Filters</h3></div>
        <div className="accounts-filters">
          <select className="filter-select" value={filters.branch} onChange={e => setFilters(f => ({
          ...f,
          branch: e.target.value
        }))}>
            <option>All Branches</option>{BRANCHES.map(b => <option key={b.id}>{b.name}</option>)}
          </select>
          <select className="filter-select" value={filters.dateRange} onChange={e => setFilters(f => ({
          ...f,
          dateRange: e.target.value
        }))}>
            {['This Month', 'Last Month', 'Q2 2026', 'YTD'].map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="filter-select" value={filters.staffType} onChange={e => setFilters(f => ({
          ...f,
          staffType: e.target.value
        }))}>
            {['All Staff', 'Collectors', 'Sales Agents'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{subPage ? {
            delinquency: 'Delinquency Heatmap',
            profitability: 'Profitability Analysis',
            territory: 'Territory Analysis'
          }[subPage] : 'Leaflet | OpenStreetMap'}</h3>
        </div>
        <LeafletMap markers={mockBranchMarkers} center={[6.7534, 125.6558]} zoom={8} height={560} />
        <div className="layer-toggles" style={{
        marginTop: 16
      }}>
          {layers.map(layer => <label key={layer.id} className="toggle-label">
              <input type="checkbox" checked={layer.active} onChange={() => toggleLayer(layer.id)} />
              {layer.label}
            </label>)}
        </div>
      </section>
      <PageToolbar actions={[{
      label: 'Delinquency Heatmap',
      to: '/operating-manager/leaflet/delinquency',
      variant: 'secondary'
    }, {
      label: 'Profitability Analysis',
      to: '/operating-manager/leaflet/profitability',
      variant: 'secondary'
    }, {
      label: 'Territory Analysis',
      to: '/operating-manager/leaflet/territory',
      variant: 'secondary'
    }]} onAction={a => navigate(a.to)} />
    </div>;
}
function AlertsPage({
  navigate,
  showToast
}) {
  const [alerts, setAlerts] = useState(ALERTS);
  const [severityFilter, setSeverityFilter] = useState('All');
  const filtered = useMemo(() => severityFilter === 'All' ? alerts : alerts.filter(a => a.severity === severityFilter), [alerts, severityFilter]);
  const resolveAlert = id => {
    setAlerts(prev => prev.map(a => a.id === id ? {
      ...a,
      resolved: true
    } : a));
    showToast('Alert resolved.', 'success');
  };
  return <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header"><h3>Alerts</h3></div>
        <div className="segmented-control" style={{ marginBottom: 12 }}>
          {['All', 'Critical', 'Warning', 'Informational'].map(f => <button key={f} className={severityFilter === f ? 'segment active' : 'segment'} type="button" onClick={() => setSeverityFilter(f)}>{f}</button>)}
        </div>
        {filtered.length === 0 ? <EmptyState title="No alerts" description="No alerts match this filter." /> :
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Type</th><th>Branch</th><th>Message</th><th>Severity</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map(a => <tr key={a.id}>
                      <td>{a.type}</td><td>{a.branch}</td><td>{a.message}</td>
                      <td><SeverityBadge severity={a.severity} /></td>
                      <td>{a.date}</td><td><StatusBadge status={a.resolved ? 'Resolved' : 'Open'} /></td>
                      <td className="table-actions">
                        {!a.resolved ? <button className="button ghost" type="button" onClick={() => resolveAlert(a.id)}>Resolve</button> : null}
                        <button className="button ghost" type="button" onClick={() => navigate(`/operating-manager/branch-performance/branch/${a.branchId}`)}>Open Branch</button>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          }
      </section>
    </div>;
}
function NotificationsPage({
  navigate,
  showToast
}) {
  const [items, setItems] = useState(NOTIFICATIONS);
  const markRead = id => setItems(prev => prev.map(n => n.id === id ? {
    ...n,
    read: true
  } : n));
  const markAllRead = () => {
    setItems(prev => prev.map(n => ({
      ...n,
      read: true
    })));
    showToast('All marked as read.', 'success');
  };
  return <div className="page">
      <PageToolbar actions={[{
      label: 'Mark All as Read',
      variant: 'secondary'
    }]} onAction={markAllRead} />
      {items.length === 0 ? <EmptyState title="No notifications" description="You're all caught up." /> : <ul className="notification-list">
          {items.map(n => <li key={n.id} className={`notification-item${n.read ? '' : ' unread'}`}>
              <div><strong>{n.type}</strong><p className="muted">{n.message}</p></div>
              <div className="notification-actions">
                {!n.read ? <button className="button ghost" type="button" onClick={() => markRead(n.id)}>Mark Read</button> : null}
                {n.relatedTo ? <button className="button ghost" type="button" onClick={() => navigate(n.relatedTo)}>Open Record</button> : null}
              </div>
            </li>)}
        </ul>}
    </div>;
}

// ── Customer Records ──────────────────────────────────────────────────────────
function CustomerRecordsPage({
  navigate
}) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchCustomers();
      if (result.success) setCustomers(result.data);
      setLoading(false);
    }
    load();
  }, []);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(r => {
      const matchSearch = !q || `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) || (r.address || '').toLowerCase().includes(q) || (r.contact_phone || '').includes(q);
      const matchBranch = branchFilter === 'All' || r.branch_name === branchFilter;
      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      return matchSearch && matchBranch && matchStatus;
    });
  }, [search, branchFilter, statusFilter, customers]);
  if (loading) return <LoadingState message="Loading customer records..." />;
  return <div className="page">
      <StatsGrid stats={[{
      label: 'Total Accounts',
      value: String(customers.length)
    }, {
      label: 'Active',
      value: String(customers.filter(r => r.status === 'Active').length)
    }, {
      label: 'Inactive',
      value: String(customers.filter(r => r.status === 'Inactive').length)
    }]} />

      <section className="panel content-panel">
        <div className="list-section-header"><h3>All Customer Accounts</h3></div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input
              className="filter-input search"
              style={{ flex: '1 1 360px', height: 40 }}
              type="search"
              placeholder="Search by customer name, address, or contact phone"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="filter-select" style={{ flex: '0 1 180px', height: 40 }} value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              <option value="All">All Branches</option>
              {BRANCHES.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <select className="filter-select" style={{ flex: '0 1 180px', height: 40 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
          </div>
        </div>

        {filtered.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr><th>Name</th><th>Branch</th><th>Address</th><th>Contact Phone</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(r => <tr key={r.customer_id}>
                    <td><strong>{r.first_name} {r.last_name}</strong></td>
                    <td>{r.branch_name}</td>
                    <td>{r.address}</td>
                    <td>{r.contact_phone}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/operating-manager/customers/${r.customer_id}`)}><NavIcon name="view" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No records found" description="Adjust your search or filters." />
        )}
      </section>
    </div>;
}
function CustomerDetailPage({
  customerId,
  navigate
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchCustomerById(customerId);
      if (result.success) setCustomer(result.data);
      setLoading(false);
    }
    load();
  }, [customerId]);
  if (loading) return <LoadingState message="Loading customer details..." />;
  if (!customer) return <EmptyState title="Customer not found" actionLabel="Back" onAction={() => navigate('/operating-manager/customers')} />;
  const name = `${customer.first_name} ${customer.last_name}`;
  return <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{customer.status}</p>
          <h2>{name}</h2>
          <p className="muted">{customer.branch_name} Branch · {customer.address}</p>
        </div>
      </section>

      <StatsGrid stats={[{
      label: 'Branch',
      value: customer.branch_name || '—'
    }, {
      label: 'Contact Phone',
      value: customer.contact_phone || '—'
    }, {
      label: 'Contact Person',
      value: `${customer.contact_person_fname} ${customer.contact_person_lname}`
    }]} />

      <div className="grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Account Information</h3></div>
          <ul className="info-grid">
            <li><span className="info-item-label">Name</span><span className="info-item-value">{name}</span></li>
            <li><span className="info-item-label">Address</span><span className="info-item-value">{customer.address}</span></li>
            <li><span className="info-item-label">Contact Phone</span><span className="info-item-value">{customer.contact_phone}</span></li>
            <li><span className="info-item-label">Contact Person</span><span className="info-item-value">{customer.contact_person_fname} {customer.contact_person_lname}</span></li>
            <li><span className="info-item-label">Contact Person Phone</span><span className="info-item-value">{customer.contact_person_phone}</span></li>
            <li><span className="info-item-label">Status</span><span className="info-item-value">{customer.status}</span></li>
          </ul>
        </section>

        {customer.activity && <section className="panel content-panel">
            <div className="panel-section-header"><h3>Account Activity</h3></div>
            <ul className="info-grid">
              <li><span className="info-item-label">Outstanding Balance</span><span className="info-item-value">{formatCurrency(Number(customer.activity.outstanding_balance || 0))}</span></li>
              <li><span className="info-item-label">Purchase Volume</span><span className="info-item-value">{formatCurrency(Number(customer.activity.purchase_volume || 0))}</span></li>
              <li><span className="info-item-label">Last Collection</span><span className="info-item-value">{customer.activity.last_collection_date || '—'}</span></li>
              <li><span className="info-item-label">Last Sales Visit</span><span className="info-item-value">{customer.activity.last_sales_visit || '—'}</span></li>
            </ul>
          </section>}
      </div>

      {customer.creditInfo && <section className="panel content-panel">
          <div className="panel-section-header"><h3>Credit Information</h3></div>
          <ul className="info-grid">
            <li><span className="info-item-label">Credit Limit</span><span className="info-item-value">{formatCurrency(Number(customer.creditInfo.credit_limit || 0))}</span></li>
            <li><span className="info-item-label">Monthly Income</span><span className="info-item-value">{formatCurrency(Number(customer.creditInfo.monthly_income || 0))}</span></li>
            <li><span className="info-item-label">Credit Score</span><span className="info-item-value">{customer.creditInfo.credit_score || '—'}</span></li>
            <li><span className="info-item-label">Employment Status</span><span className="info-item-value">{customer.creditInfo.employment_status || '—'}</span></li>
            <li><span className="info-item-label">Approved Date</span><span className="info-item-value">{customer.creditInfo.approved_date || '—'}</span></li>
          </ul>
        </section>}

      <PageToolbar actions={[{
      label: 'Back to Customer Records',
      to: '/operating-manager/customers',
      variant: 'ghost'
    }]} onAction={a => navigate(a.to)} />
    </div>;
}
function ProfilePage({
  navigate,
  showToast
}) {
  const [profile, setProfile] = useState({
    ...OPERATING_MANAGER_PROFILE
  });
  return <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Operating Manager Information</h3></div>
        <div className="form-grid">
          <label>Full Name<input value={profile.name} onChange={e => setProfile(p => ({
            ...p,
            name: e.target.value
          }))} /></label>
          <label>Employee ID<input value={profile.employeeId} readOnly /></label>
          <label>Assigned Region<input value={profile.region} readOnly /></label>
          <label>Email<input type="email" value={profile.email} onChange={e => setProfile(p => ({
            ...p,
            email: e.target.value
          }))} /></label>
          <label>Phone<input value={profile.phone} onChange={e => setProfile(p => ({
            ...p,
            phone: e.target.value
          }))} /></label>
        </div>
      </section>
      <PageToolbar actions={[{
      label: 'Update Profile'
    }, {
      label: 'Change Password',
      variant: 'secondary'
    }, {
      label: 'Logout',
      variant: 'ghost'
    }]} onAction={a => {
      if (a.label === 'Logout') requestLogout();else showToast(`${a.label} action recorded.`, 'success');
    }} />
    </div>;
}
const ANALYTIC_RANGE_OPTIONS = [{
  value: 'today',
  label: 'Today'
}, {
  value: 'yesterday',
  label: 'Yesterday'
}, {
  value: 'this_week',
  label: 'This Week'
}, {
  value: 'last_week',
  label: 'Last Week'
}, {
  value: 'this_month',
  label: 'This Month'
}, {
  value: 'last_month',
  label: 'Last Month'
}, {
  value: 'this_quarter',
  label: 'This Quarter'
}, {
  value: 'last_quarter',
  label: 'Last Quarter'
}, {
  value: 'this_year',
  label: 'This Year'
}, {
  value: 'last_year',
  label: 'Last Year'
}, {
  value: 'custom',
  label: 'Custom Range'
}];
function buildAnalyticsParams(filters) {
  const params = {
    preset: filters.preset,
    compare_to_previous: 'true'
  };
  if (filters.preset === 'custom') {
    if (filters.startDate) params.start_date = filters.startDate;
    if (filters.endDate) params.end_date = filters.endDate;
  }
  if (filters.branchId && filters.branchId !== 'all') params.branch_id = filters.branchId;
  return params;
}
function AnalyticsFilterBar({
  filters,
  setFilters,
  branchOptions = []
}) {
  const showCustom = filters.preset === 'custom';
  return <section className="panel content-panel">
      <div className="panel-section-header">
        <div>
          <h3>Analytics Filters</h3>
          <p className="muted" style={{
          margin: '2px 0 0',
          fontSize: '0.82rem'
        }}>
            Date range controls all operational KPIs, trends, and exceptions.
          </p>
        </div>
      </div>
      <div className="accounts-toolbar" style={{
      alignItems: 'flex-end'
    }}>
        <div className="accounts-filters" style={{
        flex: 1,
        minWidth: 0
      }}>
          <select className="filter-select" value={filters.preset} onChange={e => setFilters(current => ({
          ...current,
          preset: e.target.value
        }))}>
            {ANALYTIC_RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className="filter-select" value={filters.branchId} onChange={e => setFilters(current => ({
          ...current,
          branchId: e.target.value
        }))}>
            <option value="all">All Branches</option>
            {branchOptions.map(branch => <option key={branch.branchId} value={String(branch.branchId)}>{branch.branchName}</option>)}
          </select>
          {showCustom ? <>
              <input className="filter-input" type="date" value={filters.startDate} onChange={e => setFilters(current => ({
            ...current,
            startDate: e.target.value
          }))} />
              <input className="filter-input" type="date" value={filters.endDate} onChange={e => setFilters(current => ({
            ...current,
            endDate: e.target.value
          }))} />
            </> : null}
        </div>
      </div>
    </section>;
}
function useOperatingManagerAnalytics(filters) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getOperatingManagerAnalytics(buildAnalyticsParams(filters));
      if (cancelled) return;
      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError('Failed to load operating manager analytics.');
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.preset, filters.startDate, filters.endDate, filters.branchId]);
  return {
    data,
    loading,
    error
  };
}
function AnalyticalInsightsSection({
  data,
  filters,
  branchOptions
}) {
  const insights = useMemo(() => {
    const {
      summary: s,
      trends,
      lowStockItems,
      pendingVisits,
      branchSummary
    } = data || {};
    const safeLowStockItems = lowStockItems || [];
    const safePendingVisits = pendingVisits || [];
    const safeTrends = trends || {
      collections: [],
      sales: []
    };
    const safeBranchOptions = branchOptions || [];

    // Significance thresholds
    const SIG_PCT = 5;
    const SIG_RATE_PTS = 3;
    const SIG_COMPLIANCE_PTS = 5;
    const collectionGrowth = s?.collectionGrowthRate;
    const salesGrowth = s?.salesGrowthRate;
    const performanceScore = s?.performanceScore;
    const routeCompliance = s?.routeCompliance;
    const inventoryHealth = s?.inventoryHealth;
    const totalOutstanding = s?.totalOutstandingBalance || 0;
    const totalSales = s?.totalSales || 1;
    const overdueCount = s?.overdueCount || 0;
    const totalCustomers = s?.totalCustomers || 1;
    const stockAlerts = s?.stockAlerts || 0;

    // Calculate derived metrics
    const outstandingRatio = totalSales > 0 ? totalOutstanding / totalSales * 100 : 0;
    const overdueRatio = totalCustomers > 0 ? overdueCount / totalCustomers * 100 : 0;

    // Generate scope label
    const scopeParts = [];
    if (filters.branchId !== 'all' && branchOptions.length > 0) {
      const branch = branchOptions.find(b => String(b.branchId) === String(filters.branchId));
      if (branch) scopeParts.push(branch.branchName);
    }
    const scopeLabel = scopeParts.length ? scopeParts.join(' · ') : 'All branches';

    /* ---------- Overall summary paragraph ---------- */
    const collectionPhrase = collectionGrowth === null || collectionGrowth === undefined ? 'is being recorded for the first time in this comparison window' : Math.abs(collectionGrowth) < SIG_PCT ? `held roughly steady at ${formatCurrency(s?.totalCollections || 0)}` : collectionGrowth > 0 ? `rose to ${formatCurrency(s?.totalCollections || 0)}, up ${collectionGrowth.toFixed(1)}% from the previous period` : `fell to ${formatCurrency(s?.totalCollections || 0)}, down ${Math.abs(collectionGrowth).toFixed(1)}% from the previous period`;
    const salesPhrase = salesGrowth === null || salesGrowth === undefined ? 'is being recorded for the first time in this comparison window' : Math.abs(salesGrowth) < SIG_PCT ? `held roughly steady at ${formatCurrency(s?.totalSales || 0)}` : salesGrowth > 0 ? `rose to ${formatCurrency(s?.totalSales || 0)}, up ${salesGrowth.toFixed(1)}% from the previous period` : `fell to ${formatCurrency(s?.totalSales || 0)}, down ${Math.abs(salesGrowth).toFixed(1)}% from the previous period`;
    const compliancePhrase = routeCompliance !== undefined && routeCompliance !== null ? `route compliance is at ${routeCompliance.toFixed(1)}%` : 'route compliance data is unavailable';
    const inventoryPhrase = inventoryHealth !== undefined && inventoryHealth !== null ? `inventory health stands at ${inventoryHealth.toFixed(1)}%` : 'inventory health data is unavailable';
    const summary = `${scopeLabel} recorded ${formatCurrency(s?.totalCollections || 0)} in collections and ${formatCurrency(s?.totalSales || 0)} in sales over the selected period. Collections ${collectionPhrase}; sales ${salesPhrase}. ${compliancePhrase}, and ${inventoryPhrase}. ` + `The overall performance score is ${performanceScore?.toFixed(0) || 'N/A'}/100, reflecting ${performanceScore >= 80 ? 'strong' : performanceScore >= 60 ? 'moderate' : 'challenging'} operational health across the organization.`;

    /* ---------- Key findings ---------- */
    const findings = [];
    if (collectionGrowth !== null && Math.abs(collectionGrowth) >= SIG_PCT) {
      findings.push({
        label: 'Collections',
        text: `Collection activity ${collectionGrowth > 0 ? 'increased' : 'decreased'} by ${Math.abs(collectionGrowth).toFixed(1)}% compared with the previous period, indicating ${collectionGrowth > 0 ? 'improved' : 'reduced'} cash flow momentum.`
      });
    }
    if (salesGrowth !== null && Math.abs(salesGrowth) >= SIG_PCT) {
      findings.push({
        label: 'Sales',
        text: `Sales volume ${salesGrowth > 0 ? 'increased' : 'decreased'} by ${Math.abs(salesGrowth).toFixed(1)}% compared with the previous period, suggesting ${salesGrowth > 0 ? 'expanding' : 'contracting'} market activity.`
      });
    }
    if (outstandingRatio > 40) {
      findings.push({
        label: 'Credit Risk',
        text: `Outstanding balance represents ${outstandingRatio.toFixed(1)}% of total sales, indicating significant credit exposure that may require collection process review.`
      });
    }
    if (overdueRatio > 10) {
      findings.push({
        label: 'Delinquency',
        text: `Overdue accounts represent ${overdueRatio.toFixed(1)}% of the customer base, which may indicate payment difficulties or collection follow-up challenges.`
      });
    }

    // Branch exception detection
    if (safeBranchOptions.length > 1) {
      const avgCollections = safeBranchOptions.reduce((sum, b) => sum + (b.totalCollections || 0), 0) / safeBranchOptions.length;
      const lowPerformer = safeBranchOptions.filter(b => (b.totalCollections || 0) < avgCollections * 0.7).sort((a, b) => (a.totalCollections || 0) - (b.totalCollections || 0))[0];
      if (lowPerformer) {
        findings.push({
          label: 'Branch Exception',
          text: `${lowPerformer.branchName} is performing below the network average in collections, which may warrant operational support or process review for this location.`
        });
      }
    }

    /* ---------- Attention required ---------- */
    const attention = [];
    if (overdueRatio > 15) {
      attention.push({
        severity: overdueRatio > 25 ? 'critical' : 'warning',
        title: 'High delinquency rate',
        text: `Overdue accounts represent ${overdueRatio.toFixed(1)}% of the customer base. This may indicate collection process inefficiencies or customer payment challenges requiring immediate attention.`
      });
    }
    if (outstandingRatio > 50) {
      attention.push({
        severity: 'critical',
        title: 'Elevated credit exposure',
        text: `Outstanding balance represents ${outstandingRatio.toFixed(1)}% of total sales, suggesting collections are not keeping pace with sales activity and credit risk may be accumulating.`
      });
    }
    if (routeCompliance !== undefined && routeCompliance < 75) {
      attention.push({
        severity: routeCompliance < 60 ? 'critical' : 'warning',
        title: 'Low route compliance',
        text: `Route compliance of ${routeCompliance.toFixed(1)}% falls below operational standards, which may impact collection efficiency and customer service consistency.`
      });
    }
    if (inventoryHealth !== undefined && inventoryHealth < 70) {
      attention.push({
        severity: inventoryHealth < 50 ? 'critical' : 'warning',
        title: 'Inventory health concerns',
        text: `Inventory health of ${inventoryHealth.toFixed(1)}% suggests stock management challenges that may lead to stockouts and lost sales opportunities.`
      });
    }
    if (safeLowStockItems.length > 5) {
      attention.push({
        severity: safeLowStockItems.length > 10 ? 'critical' : 'warning',
        title: 'Multiple low stock items',
        text: `${safeLowStockItems.length} products are at or below reorder level across branches, requiring immediate inventory replenishment to prevent stockouts.`
      });
    }
    if (safePendingVisits.length > 10) {
      attention.push({
        severity: 'warning',
        title: 'Pending field visits backlog',
        text: `${safePendingVisits.length} pending field visits require scheduling and execution, which may impact customer service and collection follow-up.`
      });
    }
    if (performanceScore !== undefined && performanceScore < 60) {
      attention.push({
        severity: performanceScore < 40 ? 'critical' : 'warning',
        title: 'Low overall performance score',
        text: `Performance score of ${performanceScore.toFixed(0)}/100 indicates significant operational challenges across multiple metrics requiring comprehensive review.`
      });
    }

    /* ---------- Positive performance ---------- */
    const positive = [];
    if (collectionGrowth !== null && collectionGrowth > SIG_PCT) {
      positive.push({
        title: 'Collections growth',
        text: `Collections increased by ${collectionGrowth.toFixed(1)}% compared with the previous period, indicating improved cash flow and collection efficiency.`
      });
    }
    if (salesGrowth !== null && salesGrowth > SIG_PCT) {
      positive.push({
        title: 'Sales growth',
        text: `Sales increased by ${salesGrowth.toFixed(1)}% compared with the previous period, suggesting expanding customer activity and market engagement.`
      });
    }
    if (routeCompliance !== undefined && routeCompliance >= 90) {
      positive.push({
        title: 'Excellent route compliance',
        text: `Route compliance of ${routeCompliance.toFixed(1)}% indicates strong field operations execution and collector adherence to scheduled routes.`
      });
    }
    if (inventoryHealth !== undefined && inventoryHealth >= 85) {
      positive.push({
        title: 'Healthy inventory positions',
        text: `Inventory health of ${inventoryHealth.toFixed(1)}% indicates effective stock management with minimal risk of stockouts.`
      });
    }
    if (outstandingRatio < 30) {
      positive.push({
        title: 'Effective credit management',
        text: `Outstanding balance represents only ${outstandingRatio.toFixed(1)}% of total sales, indicating effective collection management and controlled credit exposure.`
      });
    }
    if (overdueRatio < 5) {
      positive.push({
        title: 'Low delinquency rate',
        text: `Overdue accounts represent only ${overdueRatio.toFixed(1)}% of the customer base, indicating effective collection follow-up and customer payment compliance.`
      });
    }
    if (safeLowStockItems.length === 0) {
      positive.push({
        title: 'No stock alerts',
        text: `No products are currently at or below reorder level across branches, indicating healthy inventory positions and effective demand forecasting.`
      });
    }
    if (performanceScore !== undefined && performanceScore >= 80) {
      positive.push({
        title: 'Strong overall performance',
        text: `Performance score of ${performanceScore.toFixed(0)}/100 indicates strong operational health across collections, sales, inventory, and field operations.`
      });
    }

    /* ---------- Decision support ---------- */
    const decisionAreas = new Set();
    if (attention.some(a => a.title.includes('delinquency') || a.title.includes('credit'))) {
      decisionAreas.add('Collection process review');
      decisionAreas.add('Credit risk management');
    }
    if (attention.some(a => a.title.includes('route') || a.title.includes('field visits'))) {
      decisionAreas.add('Field operations scheduling');
      decisionAreas.add('Collector performance monitoring');
    }
    if (attention.some(a => a.title.includes('inventory') || a.title.includes('stock'))) {
      decisionAreas.add('Inventory replenishment');
      decisionAreas.add('Demand forecasting');
    }
    if (attention.some(a => a.title.includes('performance'))) {
      decisionAreas.add('Operational process improvement');
      decisionAreas.add('Resource allocation review');
    }
    if (decisionAreas.size === 0) decisionAreas.add('Ongoing performance monitoring');
    let decisionText;
    if (attention.length === 0) {
      decisionText = `No areas currently require intervention for ${scopeLabel.toLowerCase()}. Current data supports maintaining existing operational allocations, with continued monitoring as the primary action. The dashboard indicates stable performance across collections, sales, inventory, and field operations.`;
    } else {
      const top = attention[0];
      decisionText = `The most significant signal in this view is "${top.title.toLowerCase()}." ${top.text.split('.')[0]}. ` + `This may warrant attention to ${Array.from(decisionAreas).slice(0, 3).join(', ').toLowerCase()}, ` + `though the data should be reviewed alongside operational context before acting, since the analysis reflects correlation in the current period rather than a confirmed root cause.`;
    }
    return {
      empty: false,
      summary,
      findings,
      attention,
      positive,
      decisionAreas: Array.from(decisionAreas),
      decisionText,
      scopeLabel
    };
  }, [data, branchOptions, filters]);
  if (!insights || insights.empty) {
    return null;
  }
  return <section className="panel content-panel" style={{
    marginTop: 24,
    borderTop: '2px solid #e2e8f0',
    paddingTop: 20
  }}>
      <div className="panel-section-header" style={{
      marginBottom: 18
    }}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
          <NavIcon name="brain" style={{
          width: 20,
          height: 20,
          color: '#8b5cf6'
        }} />
          <div>
            <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '1rem',
            fontWeight: 600,
            margin: '0 0 4px'
          }}>
              Operational Analysis & Insights
            </h3>
            <p className="muted" style={{
            margin: 0,
            fontSize: '0.8rem',
            lineHeight: 1.5,
            maxWidth: 650
          }}>
              The interpretation layer of this dashboard — generated from the data and filters currently in view, distinguishing what happened from what it may mean and why it matters for management.
            </p>
          </div>
        </div>
      </div>

      {/* Overall Summary */}
      <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderLeft: '3px solid #2563eb',
      borderRadius: 4,
      padding: '16px 18px',
      marginBottom: 18
    }}>
        <div style={{
        fontSize: '0.7rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#2563eb',
        marginBottom: 8,
        fontWeight: 600
      }}>
          Overall Summary
        </div>
        <p style={{
        margin: 0,
        fontSize: '0.85rem',
        lineHeight: 1.7,
        color: '#334155'
      }}>
          {insights.summary}
        </p>
      </div>

      {/* Findings Grid */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 12,
      marginBottom: 18
    }}>
        {/* Key Findings */}
        <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 4,
        padding: 16
      }}>
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}>
            <NavIcon name="search" style={{
            width: 16,
            height: 16,
            color: '#2563eb'
          }} />
            <h4 style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            margin: 0,
            color: '#2563eb'
          }}>Key Findings</h4>
          </div>
          {insights.findings.length > 0 ? <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 11
        }}>
              {insights.findings.map((f, i) => <li key={i} style={{
            display: 'flex',
            gap: 9,
            alignItems: 'flex-start'
          }}>
                  <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              marginTop: 7,
              flexShrink: 0,
              background: '#64748b'
            }} />
                  <span style={{
              fontSize: '0.78rem',
              lineHeight: 1.55,
              color: '#64748b'
            }}>
                    <strong style={{
                color: '#334155'
              }}>{f.label}:</strong> {f.text}
                  </span>
                </li>)}
            </ul> : <p style={{
          fontSize: '0.78rem',
          color: '#94a3b8',
          fontStyle: 'italic',
          margin: 0
        }}>
              No notable shifts crossed significance thresholds for this view.
            </p>}
        </div>

        {/* Attention Required */}
        <div style={{
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: 4,
        padding: 16
      }}>
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}>
            <NavIcon name="alert-triangle" style={{
            width: 16,
            height: 16,
            color: '#d97706'
          }} />
            <h4 style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            margin: 0,
            color: '#d97706'
          }}>Attention Required</h4>
          </div>
          {insights.attention.length > 0 ? <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
              {insights.attention.map((a, i) => {
            const IconName = a.severity === 'critical' ? 'alert-circle' : a.severity === 'warning' ? 'alert-triangle' : 'info';
            const color = a.severity === 'critical' ? '#dc2626' : a.severity === 'warning' ? '#d97706' : '#2563eb';
            return <div key={i} style={{
              display: 'flex',
              gap: 10,
              padding: '10px 0',
              borderTop: i === 0 ? 'none' : '1px solid #fcd34d'
            }}>
                    <NavIcon name={IconName} style={{
                width: 15,
                height: 15,
                color,
                flexShrink: 0,
                marginTop: 1
              }} />
                    <div>
                      <p style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  margin: '0 0 3px',
                  color
                }}>{a.title}</p>
                      <p style={{
                  fontSize: '0.78rem',
                  color: '#78350f',
                  lineHeight: 1.55,
                  margin: 0
                }}>{a.text}</p>
                    </div>
                  </div>;
          })}
            </div> : <p style={{
          fontSize: '0.78rem',
          color: '#94a3b8',
          fontStyle: 'italic',
          margin: 0
        }}>
              No areas currently exceed attention thresholds.
            </p>}
        </div>

        {/* Positive Performance */}
        <div style={{
        background: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: 4,
        padding: 16
      }}>
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}>
            <NavIcon name="sparkles" style={{
            width: 16,
            height: 16,
            color: '#059669'
          }} />
            <h4 style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            margin: 0,
            color: '#059669'
          }}>Positive Performance</h4>
          </div>
          {insights.positive.length > 0 ? <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
              {insights.positive.map((p, i) => <div key={i} style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid #86efac'
          }}>
                  <NavIcon name="check-circle" style={{
              width: 15,
              height: 15,
              color: '#059669',
              flexShrink: 0,
              marginTop: 1
            }} />
                  <div>
                    <p style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                margin: '0 0 3px',
                color: '#059669'
              }}>{p.title}</p>
                    <p style={{
                fontSize: '0.78rem',
                color: '#166534',
                lineHeight: 1.55,
                margin: 0
              }}>{p.text}</p>
                  </div>
                </div>)}
            </div> : <p style={{
          fontSize: '0.78rem',
          color: '#94a3b8',
          fontStyle: 'italic',
          margin: 0
        }}>
              No metrics showed a clear improvement in this view.
            </p>}
        </div>
      </div>

      {/* Decision Support */}
      <div style={{
      background: '#f0f9ff',
      border: '1px solid #bae6fd',
      borderRadius: 4,
      padding: '16px 18px'
    }}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        marginBottom: 10
      }}>
          <NavIcon name="lightbulb" style={{
          width: 16,
          height: 16,
          color: '#0284c7'
        }} />
          <h4 style={{
          fontSize: '0.85rem',
          fontWeight: 600,
          margin: 0,
          color: '#0284c7'
        }}>Decision Support</h4>
        </div>
        <p style={{
        fontSize: '0.8rem',
        lineHeight: 1.65,
        color: '#0c4a6e',
        margin: '0 0 12px'
      }}>
          {insights.decisionText}
        </p>
        <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 7
      }}>
          {insights.decisionAreas.map((tag, i) => <span key={i} style={{
          fontSize: '0.7rem',
          padding: '5px 10px',
          borderRadius: 12,
          background: 'rgba(16, 185, 129, 0.1)',
          color: '#059669',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
              {tag}
            </span>)}
        </div>
      </div>
    </section>;
}
function LiveOperationsDashboardPage({
  navigate
}) {
  const currentUser = getCurrentUser();
  const [filters, setFilters] = useState({
    preset: 'this_month',
    startDate: '',
    endDate: '',
    branchId: 'all'
  });
  const {
    data,
    loading,
    error
  } = useOperatingManagerAnalytics(filters);
  if (loading) return <LoadingState message="Loading operating manager analytics…" />;
  if (error || !data) {
    return <EmptyState title="Analytics unavailable" description={error || 'No analytics data available.'} />;
  }
  const branchOptions = data.branchSummary || [];
  const topBranch = [...branchOptions].sort((a, b) => b.totalCollections - a.totalCollections)[0] ?? null;
  const bottomBranch = [...branchOptions].sort((a, b) => a.totalCollections - b.totalCollections)[0] ?? null;
  const trendCollections = data.trends.collections.map((point, index) => ({
    ...point,
    previous: data.trends.collectionsPrevious[index]?.amount ?? 0
  }));
  const trendSales = data.trends.sales.map((point, index) => ({
    ...point,
    previous: data.trends.salesPrevious[index]?.amount ?? 0
  }));
  return <div className="page">
      <section className="dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Operations Analytics</p>
          <h2>{currentUser?.fullName || 'Operating Manager'}</h2>
          <p className="muted">{data.filters.label} · {data.scope} · Updated {formatDisplayDateTime(data.generatedAt)}</p>
        </div>
        <div style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
          <Link to="/operating-manager/notifications" className="notification-bell" aria-label="Notifications">
            <NavIcon name="bell" />
          </Link>
        </div>
      </section>

      <AnalyticsFilterBar filters={filters} setFilters={setFilters} branchOptions={branchOptions} />

      <section className="panel content-panel" style={{
      marginBottom: 16
    }}>
        <div className="panel-section-header">
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
            <NavIcon name="layout-dashboard" style={{
            width: 20,
            height: 20,
            color: '#2563eb'
          }} />
            <div>
              <h3>Key Performance Indicators</h3>
              <p className="muted" style={{
              margin: '2px 0 0',
              fontSize: '0.82rem'
            }}>
                Real-time operational metrics tracking collections, sales, credit exposure, and execution quality across the organization.
              </p>
            </div>
          </div>
        </div>
        <div className="kpi-grid">
          {[{
          key: 'collections',
          label: 'Total Collections',
          value: formatCurrency(data.summary.totalCollections),
          delta: data.summary.collectionGrowthRate,
          deltaType: 'pct',
          good: 'up',
          icon: 'dollar-sign'
        }, {
          key: 'sales',
          label: 'Total Sales',
          value: formatCurrency(data.summary.totalSales),
          delta: data.summary.salesGrowthRate,
          deltaType: 'pct',
          good: 'up',
          icon: 'shopping-cart'
        }, {
          key: 'outstanding',
          label: 'Outstanding Balance',
          value: formatCurrency(data.summary.totalOutstandingBalance),
          delta: null,
          deltaType: 'pct',
          good: null,
          icon: 'credit-card'
        }, {
          key: 'overdue',
          label: 'Overdue Accounts',
          value: String(data.summary.overdueCount),
          delta: null,
          deltaType: 'pct',
          good: 'down',
          icon: 'clock'
        }, {
          key: 'compliance',
          label: 'Route Compliance',
          value: `${data.summary.routeCompliance}%`,
          delta: null,
          deltaType: 'pts',
          good: 'up',
          icon: 'route'
        }, {
          key: 'inventory',
          label: 'Inventory Health',
          value: `${data.summary.inventoryHealth}%`,
          delta: null,
          deltaType: 'pts',
          good: 'up',
          icon: 'package'
        }].map(k => {
          const delta = k.delta;
          let deltaClass = 'neutral';
          let deltaLabel = '—';
          if (delta !== null && !Number.isNaN(delta) && Math.abs(delta) > 0.05) {
            const isUp = delta > 0;
            const absDelta = Math.abs(delta);
            const formattedDelta = absDelta > 999 ? '>999' : absDelta.toLocaleString('en-US', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1
            });
            deltaLabel = k.deltaType === 'pts' ? `${isUp ? '+' : delta < 0 ? '-' : ''}${formattedDelta} pts` : `${isUp ? '+' : delta < 0 ? '-' : ''}${formattedDelta}%`;
            if (k.good === null) deltaClass = 'neutral';else deltaClass = isUp && k.good === 'up' || !isUp && k.good === 'down' ? 'good' : 'bad';
          }
          return <div key={k.key} className="kpi-card">
                <div className="kpi-card-header">
                  <div className="kpi-card-label">
                    <NavIcon name={k.icon} style={{
                  width: 16,
                  height: 16,
                  color: '#64748b'
                }} />
                    {k.label}
                  </div>
                </div>
                <div className="kpi-card-value">{k.value}</div>
                <div className={`kpi-card-delta ${deltaClass}`}>
                  {delta !== null && Math.abs(delta) > 0.05 && <>
                      <NavIcon name={delta > 0 ? 'trending-up' : 'trending-down'} style={{
                  width: 14,
                  height: 14
                }} />
                      {deltaLabel}
                    </>}
                  <span style={{
                color: '#94a3b8',
                marginLeft: 4
              }}>vs prior period</span>
                </div>
              </div>;
        })}
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
            <NavIcon name="bar-chart-2" style={{
            width: 20,
            height: 20,
            color: '#2563eb'
          }} />
            <div>
              <h3>Period-over-Period Analysis</h3>
              <p className="muted" style={{
              margin: '2px 0 0',
              fontSize: '0.82rem'
            }}>
                Compares current period performance against the previous equivalent period to identify growth trends and operational momentum.
              </p>
            </div>
          </div>
        </div>
        <div className="pop-grid">
          {(() => {
          const getCardClass = (value, thresholds) => {
            if (value === null || value === undefined) return 'neutral';
            if (thresholds) {
              if (value >= thresholds.good) return 'good';
              if (value >= thresholds.medium) return 'neutral';
              return 'bad';
            }
            return value >= 0 ? 'good' : 'bad';
          };
          const collectionClass = getCardClass(data.summary.collectionGrowthRate);
          const salesClass = getCardClass(data.summary.salesGrowthRate);
          const performanceClass = data.summary.performanceScore >= 80 ? 'good' : data.summary.performanceScore >= 60 ? 'neutral' : 'bad';
          return [{
            key: 'collections',
            label: 'Collections',
            icon: 'dollar-sign',
            trendIcon: data.summary.collectionGrowthRate >= 0 ? 'trending-up' : data.summary.collectionGrowthRate < 0 ? 'trending-down' : 'minus',
            value: formatCurrency(data.summary.totalCollections),
            delta: data.summary.collectionGrowthRate,
            deltaType: '%',
            cardClass: collectionClass,
            description: 'Total cash collected from customers during the period, indicating collection efficiency and cash flow health.'
          }, {
            key: 'sales',
            label: 'Sales',
            icon: 'shopping-cart',
            trendIcon: data.summary.salesGrowthRate >= 0 ? 'trending-up' : data.summary.salesGrowthRate < 0 ? 'trending-down' : 'minus',
            value: formatCurrency(data.summary.totalSales),
            delta: data.summary.salesGrowthRate,
            deltaType: '%',
            cardClass: salesClass,
            description: 'Total sales revenue generated, reflecting market activity and customer demand for products.'
          }, {
            key: 'performance',
            label: 'Performance Score',
            icon: 'shield-check',
            trendIcon: data.summary.performanceScore >= 80 ? 'award' : data.summary.performanceScore >= 60 ? 'star' : 'alert-circle',
            value: `${data.summary.performanceScore}/100`,
            delta: data.summary.performanceScore >= 80 ? 'Excellent' : data.summary.performanceScore >= 60 ? 'Good' : 'Needs Attention',
            deltaType: 'label',
            cardClass: performanceClass,
            description: 'Weighted composite score combining route compliance, inventory health, collection efficiency, and operational execution.'
          }].map(card => <div key={card.key} className={`pop-card ${card.cardClass}`}>
                <div className="pop-card-header">
                  <div className="pop-card-label">
                    <NavIcon name={card.icon} style={{
                  width: 16,
                  height: 16,
                  color: '#64748b'
                }} />
                    {card.label}
                  </div>
                  <NavIcon name={card.trendIcon} style={{
                width: 16,
                height: 16,
                color: card.cardClass === 'good' ? '#10b981' : card.cardClass === 'bad' ? '#ef4444' : '#94a3b8'
              }} />
                </div>
                <div className="pop-card-value">{card.value}</div>
                <div className={`pop-card-delta ${card.cardClass}`}>
                  {card.deltaType === '%' ? card.delta !== null ? `${card.delta >= 0 ? '+' : ''}${card.delta}%` : 'No prior period' : card.delta}
                </div>
                <p className="muted" style={{
              fontSize: '0.75rem',
              marginTop: 8,
              marginBottom: 0
            }}>
                  {card.description}
                </p>
              </div>);
        })()}
        </div>
      </section>

      <div className="grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header">
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
              <NavIcon name="line-chart" style={{
              width: 18,
              height: 18,
              color: '#2563eb'
            }} />
              <div>
                <h3>Collections Trend</h3>
                <p className="muted" style={{
                margin: '2px 0 0',
                fontSize: '0.82rem'
              }}>{data.filters.label} vs prior period</p>
              </div>
            </div>
          </div>
          <p className="muted" style={{
          fontSize: '0.82rem',
          marginTop: 0,
          marginBottom: 16
        }}>
            Daily collection amounts over the selected period compared to the previous equivalent period, revealing cash flow patterns and collection momentum.
          </p>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trendCollections}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{
              fill: '#64748b',
              fontSize: 11
            }} axisLine={{
              stroke: '#e2e8f0'
            }} tickLine={false} minTickGap={28} />
              <YAxis tick={{
              fill: '#64748b',
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 4,
              fontSize: 12
            }} labelStyle={{
              color: '#1e293b'
            }} formatter={v => formatCurrency(v)} />
              <Legend wrapperStyle={{
              fontSize: 12,
              color: '#64748b'
            }} />
              <Line type="monotone" dataKey="amount" name="Current" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="previous" name="Previous" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="analysis-box analysis-box-blue">
            <p style={{
            margin: 0
          }}>
              {(() => {
              const currentTotal = trendCollections.reduce((sum, d) => sum + d.amount, 0);
              const previousTotal = trendCollections.reduce((sum, d) => sum + d.previous, 0);
              if (!data.filters.comparisonEnabled || previousTotal <= 0) {
                return 'No prior-period data is available for this comparison.';
              }
              const growth = ((currentTotal - previousTotal) / previousTotal * 100).toFixed(1);
              const isGrowth = Number(growth) >= 0;
              const trend = trendCollections.length > 2 ? trendCollections[trendCollections.length - 1].amount > trendCollections[0].amount ? 'upward' : trendCollections[trendCollections.length - 1].amount < trendCollections[0].amount ? 'downward' : 'stable' : 'stable';
              return isGrowth ? `Collections are ${growth}% higher (Current: ${formatCurrency(currentTotal)} vs Previous: ${formatCurrency(previousTotal)}; Growth = (${formatCurrency(currentTotal)} - ${formatCurrency(previousTotal)}) / ${formatCurrency(previousTotal)} × 100) with a ${trend} trend, indicating improved cash flow and collection efficiency. This suggests effective follow-up strategies and customer payment behavior.` : `Collections are ${Math.abs(growth)}% lower (Current: ${formatCurrency(currentTotal)} vs Previous: ${formatCurrency(previousTotal)}; Decline = (${formatCurrency(previousTotal)} - ${formatCurrency(currentTotal)}) / ${formatCurrency(previousTotal)} × 100) with a ${trend} trend, which may indicate payment delays or economic factors affecting customer liquidity. Consider reviewing collection schedules and customer outreach.`;
            })()}
            </p>
          </div>
        </section>

        <section className="panel content-panel">
          <div className="panel-section-header">
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
              <NavIcon name="line-chart" style={{
              width: 18,
              height: 18,
              color: '#10b981'
            }} />
              <div>
                <h3>Sales Trend</h3>
                <p className="muted" style={{
                margin: '2px 0 0',
                fontSize: '0.82rem'
              }}>{data.filters.label} vs prior period</p>
              </div>
            </div>
          </div>
          <p className="muted" style={{
          fontSize: '0.82rem',
          marginTop: 0,
          marginBottom: 16
        }}>
            Daily sales revenue over the selected period compared to the previous equivalent period, indicating market activity and customer demand trends.
          </p>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trendSales}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{
              fill: '#64748b',
              fontSize: 11
            }} axisLine={{
              stroke: '#e2e8f0'
            }} tickLine={false} minTickGap={28} />
              <YAxis tick={{
              fill: '#64748b',
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 4,
              fontSize: 12
            }} labelStyle={{
              color: '#1e293b'
            }} formatter={v => formatCurrency(v)} />
              <Legend wrapperStyle={{
              fontSize: 12,
              color: '#64748b'
            }} />
              <Line type="monotone" dataKey="amount" name="Current" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="previous" name="Previous" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="analysis-box analysis-box-green">
            <p style={{
            margin: 0
          }}>
              {(() => {
              const currentTotal = trendSales.reduce((sum, d) => sum + d.amount, 0);
              const previousTotal = trendSales.reduce((sum, d) => sum + d.previous, 0);
              if (!data.filters.comparisonEnabled || previousTotal <= 0) {
                return 'No prior-period data is available for this comparison.';
              }
              const growth = ((currentTotal - previousTotal) / previousTotal * 100).toFixed(1);
              const isGrowth = Number(growth) >= 0;
              const trend = trendSales.length > 2 ? trendSales[trendSales.length - 1].amount > trendSales[0].amount ? 'upward' : trendSales[trendSales.length - 1].amount < trendSales[0].amount ? 'downward' : 'stable' : 'stable';
              return isGrowth ? `Sales are ${growth}% higher (Current: ${formatCurrency(currentTotal)} vs Previous: ${formatCurrency(previousTotal)}; Growth = (${formatCurrency(currentTotal)} - ${formatCurrency(previousTotal)}) / ${formatCurrency(previousTotal)} × 100) with a ${trend} trend, indicating strong market demand and effective product offerings. This suggests customer confidence and healthy business growth.` : `Sales are ${Math.abs(growth)}% lower (Current: ${formatCurrency(currentTotal)} vs Previous: ${formatCurrency(previousTotal)}; Decline = (${formatCurrency(previousTotal)} - ${formatCurrency(currentTotal)}) / ${formatCurrency(previousTotal)} × 100) with a ${trend} trend, which may indicate seasonal factors, competitive pressure, or changing customer preferences. Consider reviewing product mix and marketing strategies.`;
            })()}
            </p>
          </div>
        </section>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
            <NavIcon name="bar-chart-3" style={{
            width: 18,
            height: 18,
            color: '#8b5cf6'
          }} />
            <div>
              <h3>Branch Comparison</h3>
              <p className="muted" style={{
              margin: '2px 0 0',
              fontSize: '0.82rem'
            }}>Collections, sales, balance, compliance, and inventory health</p>
            </div>
          </div>
        </div>
        <p className="muted" style={{
        fontSize: '0.82rem',
        marginTop: 0,
        marginBottom: 16
      }}>
          Compares financial performance across all branches to identify top performers, underperforming locations, and resource allocation opportunities.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={branchOptions.map(branch => ({
          name: branch.branchName.replace(' Branch', ''),
          Collections: branch.totalCollections,
          Sales: branch.totalSales,
          Balance: branch.totalOutstanding
        }))}>
            <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{
            fill: '#64748b',
            fontSize: 11
          }} axisLine={{
            stroke: '#e2e8f0'
          }} tickLine={false} />
            <YAxis tick={{
            fill: '#64748b',
            fontSize: 11
          }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            fontSize: 12
          }} labelStyle={{
            color: '#1e293b'
          }} formatter={v => formatCurrency(v)} />
            <Legend wrapperStyle={{
            fontSize: 12,
            color: '#64748b'
          }} />
            <Bar dataKey="Collections" fill="#2563eb" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Sales" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Balance" fill="#ef4444" radius={[2, 2, 0, 0]} />
          </BarChart>
          </ResponsiveContainer>
          <div className="analysis-box analysis-box-purple">
            <p style={{
          margin: 0
        }}>
              {(() => {
            const topBranch = branchOptions.reduce((max, b) => b.totalCollections > max.totalCollections ? b : max, branchOptions[0]);
            const bottomBranch = branchOptions.reduce((min, b) => b.totalCollections < min.totalCollections ? b : min, branchOptions[0]);
            const avgCollections = branchOptions.reduce((sum, b) => sum + b.totalCollections, 0) / branchOptions.length;
            const variance = branchOptions.some(b => Math.abs(b.totalCollections - avgCollections) > avgCollections * 0.3);
            return variance ? `Branch performance shows significant variance with ${topBranch.branchName} leading (${formatCurrency(topBranch.totalCollections)}) and ${bottomBranch.branchName} trailing (${formatCurrency(bottomBranch.totalCollections)}). Average: ${formatCurrency(avgCollections)} (Avg = Total Collections / ${branchOptions.length} branches). Variance threshold: >30% from average. This disparity suggests operational differences that could be addressed through best practice sharing from top performers and targeted support for underperforming branches.` : `Branch performance is relatively balanced across the network with average collections of ${formatCurrency(avgCollections)} (Avg = Total Collections / ${branchOptions.length} branches). All branches within 30% of average, indicating consistent operational standards and effective resource distribution. Consider maintaining current practices while identifying incremental improvement opportunities across all locations.`;
          })()}
            </p>
          </div>
        </section>

      <div className="grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header">
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
              <NavIcon name="building-2" style={{
              width: 18,
              height: 18,
              color: '#2563eb'
            }} />
              <div>
                <h3>Branch Summary</h3>
                <p className="muted" style={{
                margin: '2px 0 0',
                fontSize: '0.82rem'
              }}>
                  Detailed performance breakdown by branch including collections, sales, route compliance, and inventory health metrics.
                </p>
              </div>
            </div>
          </div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Collections</th>
                  <th>Sales</th>
                  <th>Compliance</th>
                  <th>Inventory</th>
                </tr>
              </thead>
              <tbody>
                {branchOptions.map(branch => <tr key={branch.branchId}>
                    <td><strong>{branch.branchName}</strong></td>
                    <td>{formatCurrency(branch.totalCollections)}</td>
                    <td>{formatCurrency(branch.totalSales)}</td>
                    <td>{branch.routeCompliance}%</td>
                    <td>{branch.inventoryHealth}%</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <div className="analysis-box analysis-box-blue">
            <p style={{
            margin: 0
          }}>
              {(() => {
              const avgCompliance = branchOptions.reduce((sum, b) => sum + b.routeCompliance, 0) / branchOptions.length;
              const avgInventory = branchOptions.reduce((sum, b) => sum + b.inventoryHealth, 0) / branchOptions.length;
              const lowCompliance = branchOptions.filter(b => b.routeCompliance < 70).length;
              const lowInventory = branchOptions.filter(b => b.inventoryHealth < 70).length;
              if (lowCompliance > 0 || lowInventory > 0) {
                return `${lowCompliance} branch(es) with compliance below 70% and ${lowInventory} branch(es) with inventory health below 70% require attention. Average compliance: ${avgCompliance.toFixed(1)}% (Avg = Sum of Compliance / ${branchOptions.length}), Average inventory: ${avgInventory.toFixed(1)}% (Avg = Sum of Inventory / ${branchOptions.length}). Consider reviewing route planning and inventory management processes for underperforming locations.`;
              }
              return `Branch performance is strong with average compliance at ${avgCompliance.toFixed(1)}% (Avg = Sum of Compliance / ${branchOptions.length}) and average inventory health at ${avgInventory.toFixed(1)}% (Avg = Sum of Inventory / ${branchOptions.length}). All branches are maintaining acceptable operational standards. Continue monitoring for early signs of performance degradation.`;
            })()}
            </p>
          </div>
        </section>

        <section className="panel content-panel">
          <div className="panel-section-header">
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
              <NavIcon name="alert-triangle" style={{
              width: 18,
              height: 18,
              color: '#f59e0b'
            }} />
              <div>
                <h3>Exception Monitoring</h3>
                <p className="muted" style={{
                margin: '2px 0 0',
                fontSize: '0.82rem'
              }}>
                  Tracks operational exceptions requiring attention, including low stock items and pending field visits across branches.
                </p>
              </div>
            </div>
          </div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr><th>Type</th><th>Branch</th><th>Details</th></tr>
              </thead>
              <tbody>
                {data.lowStockItems.slice(0, 5).map((item, index) => <tr key={`${item.branchName}-${item.productName}-${index}`}>
                    <td>Low stock</td>
                    <td>{item.branchName}</td>
                    <td>{item.productName} · {item.availableStock} remaining</td>
                  </tr>)}
                {data.pendingVisits.slice(0, 5).map(visit => <tr key={visit.visitId}>
                    <td>Pending visit</td>
                    <td>{visit.branchName}</td>
                    <td>{visit.customerName} · {visit.visitType} · {visit.scheduledDate}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <div className="analysis-box analysis-box-amber">
            <p style={{
            margin: 0
          }}>
              {(() => {
              const lowStockCount = data.lowStockItems.length;
              const pendingVisitsCount = data.pendingVisits.length;
              const totalExceptions = lowStockCount + pendingVisitsCount;
              if (totalExceptions === 0) {
                return 'No operational exceptions detected (Total = 0). All branches are operating within normal parameters with adequate inventory levels and up-to-date field visits.';
              }
              return `${totalExceptions} exception(s) require attention (Total = ${lowStockCount} + ${pendingVisitsCount}): ${lowStockCount} low stock item(s) and ${pendingVisitsCount} pending visit(s). Address inventory shortages promptly to prevent stockouts and ensure pending visits are scheduled to maintain customer relationships and collection continuity.`;
            })()}
            </p>
          </div>
        </section>
      </div>

      <div className="grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header">
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
              <NavIcon name="users" style={{
              width: 18,
              height: 18,
              color: '#2563eb'
            }} />
              <div>
                <h3>Top Customers</h3>
                <p className="muted" style={{
                margin: '2px 0 0',
                fontSize: '0.82rem'
              }}>
                  Highest outstanding balances by customer, revealing credit exposure and collection priorities.
                </p>
              </div>
            </div>
          </div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr><th>Customer</th><th>Branch</th><th>Outstanding</th><th>Days Since Collection</th></tr>
              </thead>
              <tbody>
                {data.topCustomers.map(customer => <tr key={customer.customerId}>
                    <td>{customer.customerName}</td>
                    <td>{customer.branchName}</td>
                    <td>{formatCurrency(customer.outstandingBalance)}</td>
                    <td>{customer.daysSinceCollection}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <div className="analysis-box analysis-box-blue">
            <p style={{
            margin: 0
          }}>
              {(() => {
              const totalOutstanding = data.topCustomers.reduce((sum, c) => sum + c.outstandingBalance, 0);
              const avgDays = data.topCustomers.reduce((sum, c) => sum + c.daysSinceCollection, 0) / data.topCustomers.length;
              const highRisk = data.topCustomers.filter(c => c.daysSinceCollection > 30).length;
              return `Top ${data.topCustomers.length} customers account for ${formatCurrency(totalOutstanding)} in outstanding balances (Total = Sum of all outstanding balances) with an average of ${avgDays.toFixed(0)} days since last collection (Avg = Sum of Days / ${data.topCustomers.length}). ${highRisk} customer(s) have not been collected from in over 30 days (Threshold: >30 days), indicating potential credit risk. Prioritize collection efforts on high-balance, long-overdue accounts to minimize bad debt exposure.`;
            })()}
            </p>
          </div>
        </section>

        <section className="panel content-panel">
          <div className="panel-section-header">
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
              <NavIcon name="package" style={{
              width: 18,
              height: 18,
              color: '#10b981'
            }} />
              <div>
                <h3>Top Products</h3>
                <p className="muted" style={{
                margin: '2px 0 0',
                fontSize: '0.82rem'
              }}>
                  Best-selling products by revenue and quantity, revealing customer preferences and inventory planning insights.
                </p>
              </div>
            </div>
          </div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr><th>Product</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr>
              </thead>
              <tbody>
                {data.topProducts.map(product => <tr key={product.productId}>
                    <td>{product.productName}</td>
                    <td>{product.categoryName}</td>
                    <td>{product.quantitySold}</td>
                    <td>{formatCurrency(product.revenue)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <div className="analysis-box analysis-box-green">
            <p style={{
            margin: 0
          }}>
              {(() => {
              const totalRevenue = data.topProducts.reduce((sum, p) => sum + p.revenue, 0);
              const totalQty = data.topProducts.reduce((sum, p) => sum + p.quantitySold, 0);
              const topProduct = data.topProducts[0];
              const categoryCount = [...new Set(data.topProducts.map(p => p.categoryName))].length;
              return `Top ${data.topProducts.length} products generated ${formatCurrency(totalRevenue)} (Total = Sum of all product revenues) from ${totalQty} units sold (Total = Sum of all quantities) across ${categoryCount} categories. ${topProduct.productName} is the best-performing product with ${formatCurrency(topProduct.revenue)} revenue. Ensure adequate inventory levels for top performers and consider cross-selling opportunities within high-performing categories.`;
            })()}
            </p>
          </div>
        </section>
      </div>

      <PageToolbar actions={[{
      label: 'Compare Branches',
      to: '/operating-manager/branch-performance/comparison'
    }, {
      label: 'Leaflet | OpenStreetMap',
      to: '/operating-manager/leaflet',
      variant: 'secondary'
    }, {
      label: 'Reports',
      to: '/operating-manager/reports',
      variant: 'secondary'
    }]} onAction={action => navigate(action.to)} />

      {topBranch && bottomBranch ? <section className="panel content-panel" style={{
      marginTop: 16
    }}>
          <div className="panel-section-header">
            <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
              <NavIcon name="trophy" style={{
            width: 18,
            height: 18,
            color: '#f59e0b'
          }} />
              <div>
                <h3>Branch Performance Highlights</h3>
                <p className="muted" style={{
              margin: '2px 0 0',
              fontSize: '0.82rem'
            }}>
                  Identifies the highest-performing branch for best practice sharing and the lowest-performing branch requiring operational support.
                </p>
              </div>
            </div>
          </div>
          <div className="performance-grid">
            <div className="performance-card good">
              <div className="performance-card-header">
                <div className="performance-card-badge good">
                  <NavIcon name="award" style={{
                width: 14,
                height: 14
              }} />
                  Top Branch
                </div>
              </div>
              <div className="performance-card-title">{topBranch.branchName}</div>
              <div className="performance-card-value">{formatCurrency(topBranch.totalCollections)} collections</div>
              <p className="muted" style={{
            fontSize: '0.75rem',
            marginTop: 8,
            marginBottom: 0,
            color: '#64748b'
          }}>
                Highest collection performance across the network, indicating effective operational practices that could be replicated.
              </p>
            </div>
            <div className="performance-card bad">
              <div className="performance-card-header">
                <div className="performance-card-badge bad">
                  <NavIcon name="alert-circle" style={{
                width: 14,
                height: 14
              }} />
                  Needs Attention
                </div>
              </div>
              <div className="performance-card-title">{bottomBranch.branchName}</div>
              <div className="performance-card-value">{formatCurrency(bottomBranch.totalCollections)} collections</div>
              <p className="muted" style={{
            fontSize: '0.75rem',
            marginTop: 8,
            marginBottom: 0,
            color: '#64748b'
          }}>
                Lowest collection performance, potentially requiring operational support, process review, or resource allocation.
              </p>
            </div>
          </div>
          <div className="analysis-box analysis-box-purple">
            <p style={{
          margin: 0
        }}>
              {(() => {
            const gap = topBranch.totalCollections - bottomBranch.totalCollections;
            const gapPercent = bottomBranch.totalCollections > 0 ? (gap / bottomBranch.totalCollections * 100).toFixed(1) : 0;
            return `${topBranch.branchName} outperforms ${bottomBranch.branchName} by ${formatCurrency(gap)} (Gap = ${formatCurrency(topBranch.totalCollections)} - ${formatCurrency(bottomBranch.totalCollections)}) which is ${gapPercent}% of the bottom branch's performance (Gap % = Gap / ${formatCurrency(bottomBranch.totalCollections)} × 100). Document the operational practices of the top branch and implement knowledge transfer programs to elevate performance across the network. Consider assigning a mentor from the top branch to support the underperforming location.`;
          })()}
            </p>
          </div>
        </section> : null}

      {/* Analytical Insights & Decision Support Section */}
      <AnalyticalInsightsSection data={data} filters={filters} branchOptions={branchOptions} />
    </div>;
}
function LiveBranchComparisonPage({
  navigate
}) {
  const [filters, setFilters] = useState({
    preset: 'this_month',
    startDate: '',
    endDate: '',
    branchId: 'all'
  });
  const {
    data,
    loading,
    error
  } = useOperatingManagerAnalytics(filters);
  if (loading) return <LoadingState message="Loading branch comparison…" />;
  if (error || !data) return <EmptyState title="Branch comparison unavailable" description={error || 'No comparison data available.'} />;
  return <div className="page">
      <AnalyticsFilterBar filters={filters} setFilters={setFilters} branchOptions={data.branchSummary || []} />
      <div className="grid two-up">
        <ChartCard title="Collections by Branch" subtitle="Current filtered period">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={(data.branchSummary || []).map(branch => ({
            name: branch.branchName,
            value: branch.totalCollections
          }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Sales by Branch" subtitle="Current filtered period">
          <ResponsiveContainer width="100%" height="240">
            <BarChart data={(data.branchSummary || []).map(branch => ({
            name: branch.branchName,
            value: branch.totalSales
          }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Branch Scorecard</h3></div>
        <div className="table-shell">
          <table className="corvex-table">
            <thead><tr><th>Branch</th><th>Collections</th><th>Sales</th><th>Balance</th><th>Compliance</th><th>Inventory</th></tr></thead>
            <tbody>
              {(data.branchSummary || []).map(branch => <tr key={branch.branchId}>
                  <td>{branch.branchName}</td>
                  <td>{formatCurrency(branch.totalCollections)}</td>
                  <td>{formatCurrency(branch.totalSales)}</td>
                  <td>{formatCurrency(branch.totalOutstanding)}</td>
                  <td>{branch.routeCompliance}%</td>
                  <td>{branch.inventoryHealth}%</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{
      label: 'Back to Dashboard',
      to: '/operating-manager/dashboard',
      variant: 'ghost'
    }]} onAction={action => navigate(action.to)} />
    </div>;
}
function LiveReportsPage({
  navigate,
  showToast
}) {
  const [filters, setFilters] = useState({
    preset: 'this_month',
    startDate: '',
    endDate: '',
    branchId: 'all'
  });
  const [activeTab, setActiveTab] = useState('collections');
  const {
    data,
    loading,
    error
  } = useOperatingManagerAnalytics(filters);
  if (loading) return <LoadingState message="Loading reports…" />;
  if (error || !data) return <EmptyState title="Reports unavailable" description={error || 'No report data available.'} />;
  return <div className="page">
      <AnalyticsFilterBar filters={filters} setFilters={setFilters} branchOptions={data.branchSummary || []} />
      <div className="segmented-control">
        {[{
        key: 'collections',
        label: 'Collections'
      }, {
        key: 'sales',
        label: 'Sales'
      }, {
        key: 'inventory',
        label: 'Inventory'
      }, {
        key: 'delinquency',
        label: 'Delinquency'
      }, {
        key: 'executive',
        label: 'Executive'
      }].map(tab => <button key={tab.key} className={activeTab === tab.key ? 'segment active' : 'segment'} type="button" onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>)}
      </div>

      {activeTab === 'collections' && <ChartCard title="Collections Summary" subtitle="Branch summary and collection trend">
          <div className="table-shell">
            <table className="corvex-table">
              <thead><tr><th>Branch</th><th>Collections</th><th>Growth</th><th>Compliance</th></tr></thead>
              <tbody>
                {(data.branchSummary || []).map(branch => <tr key={branch.branchId}>
                    <td>{branch.branchName}</td>
                    <td>{formatCurrency(branch.totalCollections)}</td>
                    <td>{data.summary.collectionGrowthRate === null ? '—' : `${data.summary.collectionGrowthRate >= 0 ? '+' : ''}${data.summary.collectionGrowthRate}%`}</td>
                    <td>{branch.routeCompliance}%</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </ChartCard>}

      {activeTab === 'sales' && <div className="grid two-up">
          <ChartCard title="Top Products" subtitle="Revenue by product">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Product</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                <tbody>
                  {data.topProducts.map(product => <tr key={product.productId}>
                      <td>{product.productName}</td><td>{product.categoryName}</td><td>{product.quantitySold}</td><td>{formatCurrency(product.revenue)}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
          <ChartCard title="Top Categories" subtitle="Revenue by category">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                <tbody>
                  {data.topCategories.map(category => <tr key={category.categoryName}>
                      <td>{category.categoryName}</td><td>{category.quantitySold}</td><td>{formatCurrency(category.revenue)}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>}

      {activeTab === 'inventory' && <div className="grid two-up">
          <ChartCard title="Low Stock Items" subtitle="Items at or below reorder level">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Product</th><th>Branch</th><th>Available</th><th>Status</th></tr></thead>
                <tbody>
                  {data.lowStockItems.map(item => <tr key={`${item.branchName}-${item.productName}`}>
                      <td>{item.productName}</td><td>{item.branchName}</td><td>{item.availableStock}</td><td><StatusBadge status={item.status} /></td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
          <ChartCard title="Inventory by Branch" subtitle="Current stock availability">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Branch</th><th>Available</th><th>Products</th><th>Low Stock</th><th>Out of Stock</th></tr></thead>
                <tbody>
                  {(data.inventoryByBranch || []).map(branch => <tr key={branch.branchId}>
                      <td>{branch.branchName}</td><td>{branch.totalAvailable}</td><td>{branch.productCount}</td><td>{branch.lowStock}</td><td>{branch.outOfStock}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>}

      {activeTab === 'delinquency' && <div className="grid two-up">
          <ChartCard title="Aging of Receivables" subtitle="Outstanding balances by age bucket">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.overdueAging} dataKey="totalBalance" nameKey="bucket" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
                  {data.overdueAging.map((entry, index) => <Cell key={entry.bucket} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Overdue Customers" subtitle="Highest outstanding balances">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Customer</th><th>Branch</th><th>Outstanding</th><th>Days Since Collection</th></tr></thead>
                <tbody>
                  {data.topCustomers.map(customer => <tr key={customer.customerId}>
                      <td>{customer.customerName}</td><td>{customer.branchName}</td><td>{formatCurrency(customer.outstandingBalance)}</td><td>{customer.daysSinceCollection}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>}

      {activeTab === 'executive' && <div className="grid two-up">
          <ChartCard title="Executive Snapshot" subtitle="Key operational indicators">
            <StatsGrid stats={[{
          label: 'Collections',
          value: formatCurrency(data.summary.totalCollections)
        }, {
          label: 'Sales',
          value: formatCurrency(data.summary.totalSales)
        }, {
          label: 'Outstanding',
          value: formatCurrency(data.summary.totalOutstandingBalance)
        }, {
          label: 'Inventory Health',
          value: `${data.summary.inventoryHealth}%`
        }]} />
          </ChartCard>
          <ChartCard title="Branch Performance" subtitle="Comparative summary">
            <div className="table-shell">
              <table className="corvex-table">
                <thead><tr><th>Branch</th><th>Collections</th><th>Sales</th><th>Compliance</th></tr></thead>
                <tbody>
                  {(data.branchSummary || []).map(branch => <tr key={branch.branchId}>
                      <td>{branch.branchName}</td><td>{formatCurrency(branch.totalCollections)}</td><td>{formatCurrency(branch.totalSales)}</td><td>{branch.routeCompliance}%</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>}

      <PageToolbar actions={[{
      label: 'Export PDF',
      variant: 'secondary'
    }, {
      label: 'Export Excel',
      variant: 'secondary'
    }]} onAction={action => showToast(`${action.label} started.`, 'success')} />
      <PageToolbar actions={[{
      label: 'Back to Dashboard',
      to: '/operating-manager/dashboard',
      variant: 'ghost'
    }]} onAction={action => navigate(action.to)} />
    </div>;
}
function LiveHistoricalTrendsPage() {
  const [filters, setFilters] = useState({
    preset: 'this_year',
    startDate: '',
    endDate: '',
    branchId: 'all'
  });
  const {
    data,
    loading,
    error
  } = useOperatingManagerAnalytics(filters);
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await getPerformanceHistory(buildAnalyticsParams(filters));
      if (!cancelled && result.success) setHistory(result.data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.preset, filters.startDate, filters.endDate, filters.branchId]);
  if (loading) return <LoadingState message="Loading historical trends…" />;
  if (error || !data) return <EmptyState title="Historical trends unavailable" description={error || 'No trend data available.'} />;
  return <div className="page">
      <AnalyticsFilterBar filters={filters} setFilters={setFilters} branchOptions={data.branchSummary || []} />
      <div className="grid two-up">
        <ChartCard title="Collections Trend" subtitle="Current vs previous period">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.trends.collections.map((point, index) => ({
            ...point,
            previous: data.trends.collectionsPrevious[index]?.amount ?? 0
          }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="amount" name="Current" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="previous" name="Previous" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Sales Trend" subtitle="Current vs previous period">
          <ResponsiveContainer width="100%" height="240">
            <LineChart data={data.trends.sales.map((point, index) => ({
            ...point,
            previous: data.trends.salesPrevious[index]?.amount ?? 0
          }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="amount" name="Current" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="previous" name="Previous" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {history?.byBranch?.length ? <section className="panel content-panel">
          <div className="panel-section-header"><h3>Historical Performance Summary</h3></div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead><tr><th>Branch</th><th>Latest Sales</th><th>Latest Collections</th><th>Inventory Accuracy</th></tr></thead>
              <tbody>
                {history.byBranch.map(branch => {
              const latest = branch.data[branch.data.length - 1];
              if (!latest) return null;
              return <tr key={branch.branchName}>
                      <td>{branch.branchName}</td>
                      <td>{formatCurrency(latest.totalSales)}</td>
                      <td>{formatCurrency(latest.totalCollections)}</td>
                      <td>{latest.inventoryAccuracy}%</td>
                    </tr>;
            })}
              </tbody>
            </table>
          </div>
        </section> : null}
    </div>;
}
function LiveLeafletPage({
  navigate,
  subPage
}) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    branch: 'All Branches',
    dateRange: 'This Month',
    staffType: 'All Staff'
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await apiClient.get('/dashboard/branches');
        if (!cancelled && response.data.success) setBranches(response.data.data);
      } catch (err) {
        console.error('[LiveLeafletPage] load error:', err.message);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  const markers = useMemo(() => branches.filter(branch => branch.latitude && branch.longitude).map(branch => ({
    id: branch.id,
    position: [Number(branch.latitude), Number(branch.longitude)],
    label: (branch.branch_name || branch.name || '').slice(0, 2).toUpperCase(),
    color: '#2563eb',
    popup: `${branch.branch_name || branch.name} · ${branch.status}`
  })), [branches]);
  if (loading) return <LoadingState message="Loading map data…" />;
  return <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Map Filters</h3></div>
        <div className="accounts-filters">
          <select className="filter-select" value={filters.branch} onChange={e => setFilters(current => ({
          ...current,
          branch: e.target.value
        }))}>
            <option>All Branches</option>
            {branches.map(branch => <option key={branch.id}>{branch.branch_name || branch.name}</option>)}
          </select>
          <select className="filter-select" value={filters.dateRange} onChange={e => setFilters(current => ({
          ...current,
          dateRange: e.target.value
        }))}>
            {['Today', 'This Week', 'This Month', 'This Quarter', 'This Year'].map(value => <option key={value}>{value}</option>)}
          </select>
          <select className="filter-select" value={filters.staffType} onChange={e => setFilters(current => ({
          ...current,
          staffType: e.target.value
        }))}>
            {['All Staff', 'Collectors', 'Sales Agents'].map(value => <option key={value}>{value}</option>)}
          </select>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{subPage ? {
            delinquency: 'Delinquency Heatmap',
            profitability: 'Profitability Analysis',
            territory: 'Territory Analysis'
          }[subPage] : 'Leaflet | OpenStreetMap'}</h3>
        </div>
        <LeafletMap markers={markers} center={[6.7534, 125.6558]} zoom={8} height={560} />
      </section>
      <PageToolbar actions={[{
      label: 'Delinquency Heatmap',
      to: '/operating-manager/leaflet/delinquency',
      variant: 'secondary'
    }, {
      label: 'Profitability Analysis',
      to: '/operating-manager/leaflet/profitability',
      variant: 'secondary'
    }, {
      label: 'Territory Analysis',
      to: '/operating-manager/leaflet/territory',
      variant: 'secondary'
    }]} onAction={action => navigate(action.to)} />
    </div>;
}

// ── Digital Receipts ──────────────────────────────────────────────────────────
function DigitalReceiptsPage({
  navigate,
  showToast
}) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await fetchDigitalReceipts(search ? {
          search
        } : {});
        if (result.success) setReceipts(result.data || []);
      } catch (err) {
        showToast('Failed to load digital receipts.', 'error');
      }
      setLoading(false);
    }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);
  const pagination_receipts = usePagination(receipts);
  const paginated_receipts = pagination_receipts.paginatedData;
  if (loading) return <LoadingState message="Loading digital receipts…" />;
  return <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header">
          <h3>Digital Receipts <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({receipts.length})</span></h3>
        </div>
        <div className="list-section-toolbar">
          <div className="search-bar">
            <NavIcon name="search" />
            <input className="search-input" type="search" placeholder="Search by receipt # or name…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {receipts.length === 0 ? <EmptyState title="No receipts found" description="No digital receipts match your search." /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Receipt #</th><th>Customer</th><th>Amount</th><th>Payment Method</th><th>Generated By</th><th>Receipt Date</th></tr></thead>
              <tbody>
                {paginated_receipts.map(r => <tr key={r.receipts_id}>
                    <td style={{
                  fontFamily: 'monospace'
                }}>{r.receipt_number}</td>
                    <td>{r.customer_name || '—'}</td>
                    <td>{r.collection_amount ? formatCurrency(Number(r.collection_amount)) : '—'}</td>
                    <td>{r.payment_method || '—'}</td>
                    <td>{r.generated_by_name || '—'}</td>
                    <td>{formatDisplayDateTime(r.receipt_date)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_receipts} /></>}
      </section>
    </div>;
}

// ── SAW Results (View-Only) ───────────────────────────────────────────────────
function SawResultsPage({
  navigate,
  showToast
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await fetchSawResults(search ? {
          search
        } : {});
        if (result.success) setResults(result.data || []);
      } catch (err) {
        showToast('Failed to load SAW results.', 'error');
      }
      setLoading(false);
    }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);
  const pagination_results = usePagination(results);
  const paginated_results = pagination_results.paginatedData;
  if (loading) return <LoadingState message="Loading SAW results…" />;
  return <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header">
          <h3>SAW Results <span className="text-ink/70" style={{
              fontWeight: 400,
              fontSize: '0.88rem'
            }}>({results.length})</span></h3>
        </div>
        <div className="list-section-toolbar">
          <p className="list-section-subtitle">Simple Additive Weighting — view only</p>
          <div className="search-bar">
            <NavIcon name="search" />
            <input className="search-input" type="search" placeholder="Search by customer name…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {results.length === 0 ? <EmptyState title="No SAW results found" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Rank</th><th>Customer</th><th>Score</th><th>Generated At</th></tr></thead>
              <tbody>
                {paginated_results.map(r => <tr key={r.result_id}>
                    <td><strong>#{r.ranking}</strong></td>
                    <td>{r.customer_name || `Customer #${r.customer_id}`}</td>
                    <td style={{
                  fontFamily: 'monospace'
                }}>{Number(r.score).toFixed(4)}</td>
                    <td>{formatDisplayDateTime(r.generated_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_results} /></>}
      </section>
    </div>;
}

// ── Performance Summary ───────────────────────────────────────────────────────
function PerformanceSummaryPage({
  navigate,
  showToast
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await getPerformanceHistory();
        if (!cancelled && result && result.success) setData(result.data.raw || []);
      } catch (err) {
        if (!cancelled) showToast('Failed to load performance data.', 'error');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  const pagination_data = usePagination(data);
  const paginated_data = pagination_data.paginatedData;
  if (loading) return <LoadingState message="Loading performance summary…" />;
  return <div className="page">
      <section className="panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Performance Summary</h3>
        </div>
        {data.length === 0 ? <EmptyState title="No performance data" /> : <>
            <div className="grid two-up" style={{
          marginBottom: 24
        }}>
              <div className="panel content-panel">
                <h4 style={{
              marginBottom: 12
            }}>Sales Trend</h4>
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{
                  fontSize: 11
                }} />
                    <YAxis tick={{
                  fontSize: 11
                }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Area type="monotone" dataKey="total_sales" name="Sales" stroke="#2563eb" fill="#2563eb" fillOpacity={0.08} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="panel content-panel">
                <h4 style={{
              marginBottom: 12
            }}>Collections Trend</h4>
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{
                  fontSize: 11
                }} />
                    <YAxis tick={{
                  fontSize: 11
                }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Area type="monotone" dataKey="total_collections" name="Collections" stroke="#10b981" fill="#10b981" fillOpacity={0.08} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <><div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead><tr><th>Date</th><th>Branch</th><th>Total Sales</th><th>Total Collections</th><th>Inventory Accuracy</th></tr></thead>
                <tbody>
                  {paginated_data.map((row, i) => <tr key={i}>
                      <td>{formatDisplayDate(row.date || row.generated_at)}</td>
                      <td>{row.branch_name || `Branch #${row.branch_id}`}</td>
                      <td>{formatCurrency(Number(row.total_sales))}</td>
                      <td>{formatCurrency(Number(row.total_collections))}</td>
                      <td>{Number(row.inventory_accuracy).toFixed(1)}%</td>
                    </tr>)}
                </tbody>
              </table>
            </div><Pagination {...pagination_data} /></>
          </>}
      </section>
    </div>;
}
export function OperatingManagerPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  if (page.module === 'admin') return <AdminPageBody page={page} navigate={navigate} showToast={showToast} />;
  if (page.module === 'operations') return <BranchManagerPageBody page={page} navigate={navigate} showToast={showToast} currentUser={getCurrentUser()} />;
  const props = {
    branchId: page.params?.branchId,
    customerId: page.params?.customerId,
    navigate,
    showToast
  };
  switch (page.pageType) {
    case 'dashboard':
      return <LiveOperationsDashboardPage {...props} />;
    case 'branchPerformance':
      return <LiveBranchComparisonPage {...props} />;
    case 'branchComparison':
      return <LiveBranchComparisonPage {...props} />;
    case 'branchDetail':
      return <BranchDetailPage {...props} />;
    case 'historicalTrends':
      return <LiveHistoricalTrendsPage {...props} />;
    case 'leafletMap':
      return <LiveLeafletPage {...props} />;
    case 'leafletDelinquency':
      return <LiveLeafletPage {...props} subPage="delinquency" />;
    case 'leafletProfitability':
      return <LiveLeafletPage {...props} subPage="profitability" />;
    case 'leafletTerritory':
      return <LiveLeafletPage {...props} subPage="territory" />;
    case 'reports':
    case 'reportCollections':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency':
    case 'reportExecutive':
      return <LiveReportsPage {...props} />;
    case 'alerts':
      return <AlertsPage {...props} />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'profile':
      return <ProfilePage {...props} />;
    case 'customers':
      return <CustomerRecordsPage {...props} />;
    case 'customerDetail':
      return <CustomerDetailPage {...props} />;
    case 'territories':
      return <TerritoriesPage {...props} />;
    case 'digitalReceipts':
      return <DigitalReceiptsPage {...props} />;
    case 'sawResults':
      return <SawResultsPage {...props} />;
    case 'performanceSummary':
      return <PerformanceSummaryPage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}