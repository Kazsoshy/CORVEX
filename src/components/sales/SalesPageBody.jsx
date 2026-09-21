import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomerById, fetchCustomers, fetchFieldVisits, fetchFieldVisitById, fetchInvoices, updateFieldVisit } from '../../api/salesService';
import { getCurrentUser } from '../../api/authService.js';
import {
  AUDIT_LOGS,
  CUSTOMERS,
  DASHBOARD_SUMMARY,
  LOW_STOCK_ITEMS,
  NOTIFICATIONS,
  OFFLINE_STATUS,
  PRODUCTS,
  ROUTE_TRACKING,
  SALES_ANALYTICS,
  SALES_HISTORY,
  SCHEDULE_STOPS,

  formatCurrency,

  getCustomerById,
  getProductById,
} from '../../data/salesMockData';
import { CustomerCard } from './CustomerCard';
import { InvoiceDetailsPage } from './InvoiceDetailsPage';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';



function StatsGrid({ stats }) {
  if (!stats?.length) return null;
  return (
    <section className="stats-grid">
      {stats.map((stat, index) => (
        <article key={stat.label} className="stat-card" style={{ '--stat-index': index }}>
          <div className="stat-card-top">
            <span className="stat-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="stat-dot" aria-hidden="true" />
          </div>
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>
      ))}
    </section>
  );
}

function OfflineBanner() {
  if (!OFFLINE_STATUS.enabled) return null;
  return (
    <section className={`panel offline-banner${OFFLINE_STATUS.isOnline ? ' online' : ' offline'}`}>
      <div>
        <strong>{OFFLINE_STATUS.isOnline ? 'Online' : 'Offline Mode Active'}</strong>
        <p className="muted">
          Last sync: {OFFLINE_STATUS.lastSync}
          {OFFLINE_STATUS.pendingSync > 0 ? ` · ${OFFLINE_STATUS.pendingSync} pending sync` : ''}
        </p>
      </div>
      <span className="offline-cache muted">
        Cached: {OFFLINE_STATUS.cachedSchedules} schedules, {OFFLINE_STATUS.cachedInventory} products
      </span>
    </section>
  );
}

function DashboardPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;
  const firstPending = SCHEDULE_STOPS.find((c) => c.status !== 'Completed');
  const agentName = currentUser?.fullName || 'Sales Agent';

  return (
    <div className="page">
      <OfflineBanner />

      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Good morning</p>
          <h2>{agentName}</h2>
          <p className="muted">{today}</p>
        </div>
        <Link to="/sales/notifications" className="notification-bell" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid
        stats={[
          { label: 'Accounts to Visit Today', value: String(DASHBOARD_SUMMARY.accountsToVisit) },
          { label: 'Sales Commitments Logged', value: String(DASHBOARD_SUMMARY.salesLogged) },
          { label: 'Pending Visits', value: String(DASHBOARD_SUMMARY.pendingVisits) },
          { label: 'Completed Visits', value: String(DASHBOARD_SUMMARY.completedVisits) },
        ]}
      />

      {LOW_STOCK_ITEMS.length ? (
        <section className="panel content-panel alert-panel">
          <div className="panel-section-header">
            <h3>Low Stock Alerts</h3>
          </div>
          <ul className="widget-list">
            {LOW_STOCK_ITEMS.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted">{item.sku} · {item.branch}</span>
                </div>
                <span className={`stock-status stock-${item.status.toLowerCase()}`}>{item.stock} units · {item.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button" type="button" onClick={() => navigate('/sales/schedule')}>View Today's Schedule</button>
        <button className="button secondary" type="button" onClick={() => navigate(firstPending ? `/sales/visit-log/${firstPending.id}` : '/sales/schedule')}>Log a Sale</button>
        <button className="button secondary" type="button" onClick={() => navigate('/sales/inventory')}>Check Inventory</button>
      </div>

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Today&apos;s Revenue</h3></div>
          <p className="analytics-value">{formatCurrency(SALES_ANALYTICS.dailyRevenue)}</p>
          <p className="muted">Weekly: {formatCurrency(SALES_ANALYTICS.weeklyRevenue)} · Monthly: {formatCurrency(SALES_ANALYTICS.monthlyRevenue)}</p>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Visit Completion Progress</h3></div>
          <div className="progress-bar" role="progressbar" aria-valuenow={DASHBOARD_SUMMARY.visitProgress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${DASHBOARD_SUMMARY.visitProgress}%` }} />
          </div>
          <p className="muted progress-caption">{DASHBOARD_SUMMARY.completedVisits} of {DASHBOARD_SUMMARY.accountsToVisit} visits completed</p>
        </section>
      </div>

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Sales</h3></div>
          <ul className="widget-list">
            {SALES_HISTORY.slice(0, 3).map((sale) => (
              <li key={sale.id}>
                <div><strong>{sale.customerName || sale.first_name + ' ' + sale.last_name}</strong><span className="muted">{sale.date}</span></div>
                <span>{formatCurrency(sale.totalAmount)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Top Selling Products</h3></div>
          <ul className="widget-list">
            {SALES_ANALYTICS.topProducts.map((product) => (
              <li key={product.name}>
                <div><strong>{product.name}</strong></div>
                <span>{product.units} units</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Sales Analytics</h3>
          <button className="button ghost" type="button" onClick={() => navigate('/sales/route-tracking')}>Route Tracking</button>
        </div>
        <div className="analytics-grid three-up">
          <div className="analytics-card"><span className="metric-label">Daily Total</span><strong>{formatCurrency(SALES_ANALYTICS.dailyRevenue)}</strong></div>
          <div className="analytics-card"><span className="metric-label">Weekly Total</span><strong>{formatCurrency(SALES_ANALYTICS.weeklyRevenue)}</strong></div>
          <div className="analytics-card"><span className="metric-label">Monthly Total</span><strong>{formatCurrency(SALES_ANALYTICS.monthlyRevenue)}</strong></div>
        </div>
        <h4 className="subsection-title">Top Customers</h4>
        <ul className="widget-list">
          {SALES_ANALYTICS.topCustomers.map((customer) => (
            <li key={customer.name}><div><strong>{customer.name}</strong></div><span>{formatCurrency(customer.revenue)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function haversine(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]);
  const la2 = toRad(b[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function SchedulePage({ pageType, navigate, showToast }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchFieldVisits();
      if (result.success) {
        setVisits(result.data || []);
      } else {
        setError(result.message || 'Failed to load field visits.');
        if (showToast) showToast(result.message || 'Failed to load field visits', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);

  const [filter, setFilter] = useState('All');
  const [showMap, setShowMap] = useState(pageType === 'scheduleMap');

  const filtered = useMemo(() => {
    if (filter === 'All') return visits;
    return visits.filter((v) => v.status === filter);
  }, [filter, visits]);

  const completed = visits.filter((v) => v.status === 'Completed').length;

  const coordVisits = visits.filter((v) => v.latitude && v.longitude);
  const mapCenter = coordVisits.length
    ? [
      coordVisits.reduce((s, v) => s + Number(v.latitude), 0) / coordVisits.length,
      coordVisits.reduce((s, v) => s + Number(v.longitude), 0) / coordVisits.length,
    ]
    : [7.1907, 125.4553];

  const totalDistance = useMemo(() => {
    const sorted = [...coordVisits].sort((a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0));
    let sum = 0;
    for (let i = 1; i < sorted.length; i++) {
      sum += haversine(
        [Number(sorted[i - 1].latitude), Number(sorted[i - 1].longitude)],
        [Number(sorted[i].latitude), Number(sorted[i].longitude)]
      );
    }
    return sum;
  }, [coordVisits]);

  const visitColor = (v) => (v.status === 'Completed' ? '#10b981' : v.status === 'Pending' ? '#093850' : '#f59e0b');

  const mapMarkers = filtered.map((v) => ({
    id: v.visit_id,
    position: v.latitude && v.longitude ? [Number(v.latitude), Number(v.longitude)] : mapCenter,
    label: String(v.visit_id),
    color: visitColor(v),
    popup: `<strong>Visit #${v.visit_id}</strong> · ${v.visit_type || '—'}<br/>${v.customer_name || `${v.first_name || ''} ${v.last_name || ''}`.trim() || '—'}<br/>${v.agent_name || '—'} · ${v.status}`,
  }));



  if (loading) return <LoadingState message="Loading schedule..." />;

  if (error && !visits.length) {
    return (
      <EmptyState
        title="Unable to load schedule"
        description={error}
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (pageType === 'scheduleMap' || showMap) {
    return (
      <div className="page">
        {/* Removed redundant top Schedule/Map buttons */}
        <StatsGrid stats={[
          { label: 'Visits Scheduled', value: String(visits.length) },
          { label: 'Distance Covered', value: totalDistance ? `${totalDistance.toFixed(1)} km` : '—' },
          { label: 'Completed', value: String(completed) },
        ]} />
        <section className="panel content-panel">
          <div className="panel-section-header">
            <div className="inline-toolbar">
              <div className="segmented-control">
                {['All', 'Pending', 'Completed'].map((item) => (
                  <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>{item}</button>
                ))}
              </div>
              <button className="button secondary" type="button" onClick={() => setShowMap(false)}>Show List View</button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <LeafletMap
              center={mapCenter}
              zoom={13}
              height={500}
              markers={mapMarkers}
              polylines={totalDistance ? [{
                id: 'route',
                positions: [...coordVisits]
                  .sort((a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0))
                  .map((v) => [Number(v.latitude), Number(v.longitude)]),
                color: '#093850',
              }] : []}
            />
          </div>
          <p className="muted">Visits mapped: {filtered.length}{totalDistance ? ` · Route distance: ${totalDistance.toFixed(1)} km` : ''}</p>
        </section>
        {filtered.length ? (
          <section className="panel content-panel">
            <div className="panel-section-header"><h3>Visit List</h3></div>
            <div className="table-shell">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Visit ID</th>
                    <th>Customer</th>
                    <th>Visit Type</th>
                    <th>Scheduled</th>
                    <th>Status</th>
                    <th>Agent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => (
                    <tr key={v.visit_id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{v.visit_id}</span></td>
                      <td>{v.customer_name || `${v.first_name || ''} ${v.last_name || ''}`.trim() || '—'}</td>
                      <td>{v.visit_type || '—'}</td>
                      <td>{v.scheduled_date ? new Date(v.scheduled_date).toLocaleDateString('en-PH') : '—'}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td>{v.agent_name || '—'}</td>
                      <td>
                        <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/visit-log/${v.visit_id}`)}>
                          <NavIcon name="view" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : <EmptyState title="No visits match this filter" description="Try a different status filter." />}
      </div>
    );
  }

  return (
    <div className="page">
      {/* Removed redundant top Schedule/Map buttons */}
      <StatsGrid stats={[
        { label: 'Visits Scheduled', value: String(visits.length) },
        { label: 'Distance Covered', value: totalDistance ? `${totalDistance.toFixed(1)} km` : '—' },
        { label: 'Completed', value: String(completed) },
      ]} />

      <section className="panel content-panel">
        <div className="panel-section-header">
          <div className="inline-toolbar">
            <div className="segmented-control">
              {['All', 'Pending', 'Completed'].map((item) => (
                <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule/map')}>Territory Map View</button>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Visit ID</th>
                  <th>User ID</th>
                  <th>Visit Type</th>
                  <th>Scheduled Date</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Customer ID</th>
                  <th>Agent</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.visit_id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{v.visit_id}</span></td>
                    <td>{v.user_id ?? '—'}</td>
                    <td>{v.visit_type || '—'}</td>
                    <td>{v.scheduled_date ? new Date(v.scheduled_date).toLocaleDateString('en-PH') : '—'}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td>{v.customer_name || `${v.first_name || ''} ${v.last_name || ''}`.trim() || '—'}</td>
                    <td>{v.customer_id ?? '—'}</td>
                    <td>{v.agent_name || '—'}</td>
                    <td>{v.created_at ? new Date(v.created_at).toLocaleString() : '—'}</td>
                    <td>{v.updated_at ? new Date(v.updated_at).toLocaleString() : '—'}</td>
                    <td>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/visit-log/${v.visit_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No visits match this filter" description="Try a different status filter." />
        )}
      </section>
    </div>
  );
}

function CustomersPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active Customers');
  const [sortBy, setSortBy] = useState('Name');
  const [loading, setLoading] = useState(true);
  const [customersData, setCustomersData] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomers();
      if (res.success) {
        setCustomersData(res.data);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filteredCustomers = useMemo(() => {
    let results = [...customersData];
    const query = search.trim().toLowerCase();
    if (query) {
      results = results.filter(
        (c) => (c.first_name + ' ' + c.last_name).toLowerCase().includes(query) ||
          (c.contact_person_fname + ' ' + c.contact_person_lname).toLowerCase().includes(query) ||
          (c.contact_phone || '').includes(query)
      );
    }
    switch (filter) {
      case 'Active Customers': results = results.filter((c) => c.status === 'Active'); break;
      case 'Inactive Customers': results = results.filter((c) => c.status !== 'Active'); break;
      default: break;
    }
    switch (sortBy) {
      case 'Name':
      default:
        results.sort((a, b) => (a.first_name + ' ' + a.last_name).localeCompare(b.first_name + ' ' + b.last_name));
        break;
    }
    return results;
  }, [customersData, search, filter, sortBy]);

  if (loading) return <LoadingState message="Loading customers..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto flex-1">
            <input className="filter-input search" type="search" placeholder="Search by customer name, or contact number" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', flex: 1, minWidth: '200px' }} />
            <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
              {['Active Customers', 'Inactive Customers', 'All Customers'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
              {['Name'].map((o) => <option key={o} value={o}>Sort: {o}</option>)}
            </select>
          </div>
          <button className="button secondary" type="button" onClick={() => showToast('Export initiated.', 'success')}>Export Data</button>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Customer List</h3></div>
      </section>
      {filteredCustomers.length ? (
        <div className="account-card-grid">
          {filteredCustomers.map((customer) => (
            <CustomerCard
              key={customer.customer_id}
              customer={{
                ...customer,
                id: String(customer.customer_id),
                // Handle both quoted (camelCase) and unquoted (lowercase) pg aliases
                lastVisitDate: customer.lastVisitDate || customer.lastvisitdate || 'N/A',
                totalPurchaseVolume: Number(customer.totalPurchaseVolume || customer.totalpurchasevolume || 0),
                phone: customer.contact_phone || customer.phone || '—',
              }}
              onViewDetails={(c) => navigate(`/sales/customer-detail/${c.id}?from=customers`)}
              onNavigate={() => showToast(`Opening navigation to ${customer.address}`, 'success')}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No customers found" description="Adjust your search or filters." actionLabel="Clear filters" onAction={() => { setSearch(''); setFilter('Active Customers'); }} />
      )}
    </div>
  );
}

function CustomerDetailPage({ customerId, parentContext, navigate, showToast }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (res.success && res.data) {
        setCustomer(res.data);
      }
      setLoading(false);
    }
    load();
  }, [customerId]);

  if (loading) return <LoadingState message="Loading customer details..." />;
  if (!customer) return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/sales/customers')} />;

  const purchaseVolume = customer.activity?.purchase_volume || 0;
  const outstandingBalance = customer.activity?.outstanding_balance || 0;
  const lastVisit = customer.activity?.last_sales_visit ? new Date(customer.activity.last_sales_visit).toLocaleDateString('en-PH') : 'N/A';
  const creditLimit = customer.creditInfo?.credit_limit || 10000;
  const avgOrder = customer.paymentHistory && customer.paymentHistory.length
    ? Math.round(purchaseVolume / customer.paymentHistory.length)
    : purchaseVolume;
  const customerSince = customer.created_at
    ? new Date(customer.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';

  return (
    <div className="page account-detail-page">
      <StatsGrid stats={[
        { label: 'Customer ID', value: String(customer.customer_id) },
        { label: 'Purchase Volume', value: formatCurrency(purchaseVolume) },
        { label: 'Outstanding', value: formatCurrency(outstandingBalance) },
        { label: 'Last Visit', value: lastVisit },
        { label: 'Account Manager', value: customer.account_manager_name || '—' },
        { label: 'Customer Since', value: customerSince },
      ]} />

      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>{customer.first_name} {customer.last_name}</h3>
          <p className="muted">Customer ID: {customer.customer_id} · Status: {customer.status}</p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Customer ID:</strong> {customer.customer_id}</p>
            <p><strong>User ID:</strong> {customer.user_id || '—'}</p>
            <p><strong>Branch ID:</strong> {customer.branch_id}</p>
            <p><strong>Branch Name:</strong> {customer.branch_name || '—'}</p>
            <p><strong>Account Manager ID:</strong> {customer.account_manager_id || '—'}</p>
            <p><strong>Account Manager:</strong> {customer.account_manager_name || '—'}</p>
            <p><strong>Territory ID:</strong> {customer.territory_id || '—'}</p>
          </div>
          <div>
            <p><strong>First Name:</strong> {customer.first_name}</p>
            <p><strong>Last Name:</strong> {customer.last_name}</p>
            <p><strong>Address:</strong> {customer.address}</p>
            <p><strong>Latitude:</strong> {customer.latitude}</p>
            <p><strong>Longitude:</strong> {customer.longitude}</p>
            <p><strong>Contact Phone:</strong> {customer.contact_phone}</p>
            <p><strong>Contact Person:</strong> {customer.contact_person_fname} {customer.contact_person_lname}</p>
            <p><strong>Contact Person Phone:</strong> {customer.contact_person_phone}</p>
            <p><strong>Status:</strong> {customer.status}</p>
            <p><strong>Created At:</strong> {customer.created_at ? new Date(customer.created_at).toLocaleString() : 'N/A'}</p>
            <p><strong>Updated At:</strong> {customer.updated_at ? new Date(customer.updated_at).toLocaleString() : 'N/A'}</p>
          </div>
        </div>
      </section>

      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>Customer Activity</h3>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Purchase Volume:</strong> {formatCurrency(purchaseVolume)}</p>
            <p><strong>Outstanding Balance:</strong> {formatCurrency(outstandingBalance)}</p>
            <p><strong>Last Sales Visit:</strong> {lastVisit}</p>
            <p><strong>Last Collection Date:</strong> {customer.activity?.last_collection_date ? new Date(customer.activity.last_collection_date).toLocaleDateString('en-PH') : 'N/A'}</p>
          </div>
          <div>
            <h4 className="subsection-title">Credit Performance</h4>
            <p>Credit Limit: {formatCurrency(creditLimit)}</p>
            <p>Outstanding Balance: {formatCurrency(outstandingBalance)}</p>
            <div className="progress-bar-container" style={{ marginTop: 8 }}>
              <div className="progress-bar" style={{ width: `${Math.min((outstandingBalance / (creditLimit || 1)) * 100, 100)}%`, backgroundColor: outstandingBalance > creditLimit * 0.8 ? '#ef4444' : '#3b82f6' }} />
            </div>
          </div>
        </div>
      </section>

      {customer.creditInfo && (
        <section className="panel content-panel account-detail-panel">
          <div className="panel-section-header">
            <h3>Credit Information</h3>
          </div>
          <div className="account-detail-grid two-up">
            <div>
              <p><strong>Credit Limit:</strong> {formatCurrency(Number(customer.creditInfo.credit_limit || 0))}</p>
              <p><strong>Monthly Income:</strong> {formatCurrency(Number(customer.creditInfo.monthly_income || 0))}</p>
              <p><strong>Credit Score:</strong> {customer.creditInfo.credit_score || '—'}</p>
              <p><strong>Employment Status:</strong> {customer.creditInfo.employment_status || '—'}</p>
            </div>
            <div>
              <p><strong>Approved By:</strong> {customer.creditInfo.approved_by_name || '—'}</p>
              <p><strong>Approved Date:</strong> {customer.creditInfo.approved_date ? new Date(customer.creditInfo.approved_date).toLocaleDateString('en-PH') : '—'}</p>
              <p><strong>Credit Info ID:</strong> {customer.creditInfo.credit_info_id || '—'}</p>
              <p><strong>Created At:</strong> {customer.creditInfo.created_at ? new Date(customer.creditInfo.created_at).toLocaleString() : '—'}</p>
              <p><strong>Updated At:</strong> {customer.creditInfo.updated_at ? new Date(customer.creditInfo.updated_at).toLocaleString() : '—'}</p>
            </div>
          </div>
        </section>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Location Map</h3>
          <p className="muted">Customer address: {customer.address}</p>
        </div>
        <div style={{ minHeight: 300, borderRadius: 8, overflow: 'hidden' }}>
          <LeafletMap
            center={customer.latitude && customer.longitude ? [Number(customer.latitude), Number(customer.longitude)] : [7.1907, 125.4553]}
            zoom={15}
            height={300}
            markers={[
              {
                id: customer.customer_id,
                position: customer.latitude && customer.longitude ? [Number(customer.latitude), Number(customer.longitude)] : [7.1907, 125.4553],
                popup: `<strong>${customer.first_name} ${customer.last_name}</strong><br/>${customer.address}`,
                label: String(customer.customer_id),
                color: '#093850'
              }
            ]}
          />
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Recent Payments</h3>
        </div>
        <div className="table-shell">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt #</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Collector</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customer.paymentHistory && customer.paymentHistory.length ? customer.paymentHistory.map((p) => (
                <tr key={p.payment_id || p.receipt_number}>
                  <td>{new Date(p.payment_date).toLocaleDateString('en-PH')}</td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{p.receipt_number || '—'}</span></td>
                  <td>{formatCurrency(Number(p.amount))}</td>
                  <td>{p.payment_method || 'Cash'}</td>
                  <td>{p.collector_name || '—'}</td>
                  <td>
                    <StatusBadge status={p.payment_status || 'Completed'} />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#64748b', padding: 16 }}>No recent payments</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function VisitLogPage({ visitId, parentContext, navigate, showToast }) {
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function load() {
      if (!visitId) {
        setError('No visit id provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const res = await fetchFieldVisitById(visitId);
      if (res.success && res.data) {
        setVisit(res.data);
      } else {
        setError(res.message || 'Field visit not found.');
        if (showToast) showToast(res.message || 'Field visit not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [visitId, showToast]);

  const handleMarkCompleted = async () => {
    if (!visit) return;
    setUpdating(true);
    const res = await updateFieldVisit(visitId, { status: 'Completed' });
    if (res.success && res.data) {
      setVisit(res.data);
      showToast('Visit marked as completed.', 'success');
    } else {
      showToast(res.message || 'Failed to update visit.', 'error');
    }
    setUpdating(false);
  };

  if (loading) return <LoadingState message="Loading field visit..." />;

  if (error) {
    return (
      <EmptyState
        title="Visit not found"
        description={error}
        actionLabel="Back to Schedule"
        onAction={() => navigate('/sales/schedule')}
      />
    );
  }

  const customerName = visit.customer_name || `${visit.first_name || ''} ${visit.last_name || ''}`.trim() || '—';

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Visit Record</h3>
          <p className="muted">Visit ID: {visit.visit_id}</p>
        </div>
        <StatsGrid stats={[
          { label: 'Visit ID', value: String(visit.visit_id) },
          { label: 'User ID', value: String(visit.user_id ?? '—') },
          { label: 'Visit Type', value: visit.visit_type || '—' },
          { label: 'Scheduled Date', value: visit.scheduled_date ? new Date(visit.scheduled_date).toLocaleDateString('en-PH') : '—' },
          { label: 'Status', value: <StatusBadge status={visit.status} /> },
          { label: 'Customer', value: customerName },
        ]} />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Visit Details</h3>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Visit ID:</strong> {visit.visit_id}</p>
            <p><strong>User ID:</strong> {visit.user_id ?? '—'}</p>
            <p><strong>Visit Type:</strong> {visit.visit_type || '—'}</p>
            <p><strong>Scheduled Date:</strong> {visit.scheduled_date ? new Date(visit.scheduled_date).toLocaleDateString('en-PH') : '—'}</p>
            <p><strong>Status:</strong> <StatusBadge status={visit.status} /></p>
            <p><strong>Created At:</strong> {visit.created_at ? new Date(visit.created_at).toLocaleString() : '—'}</p>
            <p><strong>Updated At:</strong> {visit.updated_at ? new Date(visit.updated_at).toLocaleString() : '—'}</p>
          </div>
          <div>
            <h4 className="subsection-title">Agent</h4>
            <p><strong>User ID:</strong> {visit.user_id ?? '—'}</p>
            <p><strong>Agent Name:</strong> {visit.agent_name || '—'}</p>
            <p><strong>Agent:</strong> {visit.agent_first_name || visit.agent_last_name ? `${visit.agent_first_name || ''} ${visit.agent_last_name || ''}`.trim() : '—'}</p>
          </div>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Customer Information</h3>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Customer ID:</strong> {visit.customer_id ?? '—'}</p>
            <p><strong>Name:</strong> {customerName}</p>
            <p><strong>Address:</strong> {visit.address || '—'}</p>
            <p><strong>Contact Phone:</strong> {visit.contact_phone || '—'}</p>
            <p><strong>Contact Person:</strong> {visit.contact_person_fname ? `${visit.contact_person_fname} ${visit.contact_person_lname || ''}` : '—'}</p>
            <p><strong>Contact Person Phone:</strong> {visit.contact_person_phone || '—'}</p>
            <p><strong>Customer Status:</strong> {visit.customer_status || '—'}</p>
          </div>
          <div>
            <p><strong>Latitude:</strong> {visit.latitude ?? '—'}</p>
            <p><strong>Longitude:</strong> {visit.longitude ?? '—'}</p>
            {visit.latitude && visit.longitude ? (
              <div style={{ minHeight: 240, borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
                <LeafletMap
                  center={[Number(visit.latitude), Number(visit.longitude)]}
                  zoom={15}
                  height={240}
                  markers={[
                    {
                      id: visit.visit_id,
                      position: [Number(visit.latitude), Number(visit.longitude)],
                      popup: `<strong>${customerName}</strong><br/>${visit.address || ''}`,
                      label: String(visit.visit_id),
                      color: visit.status === 'Completed' ? '#10b981' : '#093850',
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule')}>Back to Schedule</button>
        <button className={visit.status === 'Completed' ? 'button secondary' : 'button'} type="button" onClick={() => handleMarkCompleted()} disabled={updating || visit.status === 'Completed'}>Mark Completed</button>
      </div>
    </div>
  );
}

function CIFormPage({ customerId, parentContext, navigate, showToast }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const contextQuery = `?from=${parentContext}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (res.success && res.data) setCustomer(res.data);
      setLoading(false);
    }
    load();
  }, [customerId]);

  if (loading) return <LoadingState message="Loading customer..." />;
  if (!customer) return <EmptyState title="Customer not found" actionLabel="Back" onAction={() => navigate('/sales/customers')} />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Credit Investigation Form</h3><p className="muted">Customer: {customer.first_name} {customer.last_name}</p></div>
        <div className="form-group"><label>Purpose of CI</label><select className="filter-select" value={formData.purpose ?? ''} onChange={(e) => setFormData((p) => ({ ...p, purpose: e.target.value }))}><option value="">Select purpose</option>{['Credit Limit Increase', 'New Account', 'Delinquency Review'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Monthly Income</label><input type="number" placeholder="PHP amount" value={formData.income ?? ''} onChange={(e) => setFormData((p) => ({ ...p, income: e.target.value }))} /></div>
        <div className="form-group"><label>Business Type</label><select className="filter-select" value={formData.businessType ?? ''} onChange={(e) => setFormData((p) => ({ ...p, businessType: e.target.value }))}><option value="">Select type</option>{['Retail', 'Wholesale', 'Convenience Store', 'Service'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Character References</label><textarea placeholder="Reference names and contacts..." value={formData.references ?? ''} onChange={(e) => setFormData((p) => ({ ...p, references: e.target.value }))} /></div>
        <div className="form-group"><label>Remarks</label><textarea placeholder="Additional notes..." value={formData.remarks ?? ''} onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))} /></div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`/sales/customer-detail/${customer.id}${contextQuery}`)}>Cancel</button>
        <button className="button" type="button" onClick={() => { showToast('CI Form sent to Operating Manager.', 'success'); navigate(`/sales/customer-detail/${customer.id}${contextQuery}`); }}>Submit to Operating Manager</button>
      </div>
    </div>
  );
}

function InventoryPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('Name');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const apiClient = (await import('../../api/apiClient.js')).default;
        const res = await apiClient.get('/products');
        if (res.data.success) {
          setProducts(res.data.data);
          setCategories(res.data.categories || []);
        }
      } catch (err) {
        console.error('[SalesInventory] load error:', err.message);
      }
      setLoading(false);
    }
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    let results = [...products];
    const query = search.trim().toLowerCase();
    if (query) results = results.filter((p) => p.product_name.toLowerCase().includes(query) || (p.category_name && p.category_name.toLowerCase().includes(query)));
    if (category !== 'All') results = results.filter((p) => p.category_id === Number(category));
    if (sortBy === 'Product Name') results.sort((a, b) => a.product_name.localeCompare(b.product_name));
    else if (sortBy === 'Unit Price') results.sort((a, b) => a.unit_price - b.unit_price);
    return results;
  }, [products, search, category, sortBy]);

  if (loading) return <LoadingState message="Loading inventory..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto flex-1">
            <input className="filter-input search" type="search" placeholder="Search products by name or category" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', flex: 1, minWidth: '200px' }} />
            <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
              <option value="All">All Categories</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
            <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
              {['Product Name', 'Unit Price'].map((o) => <option key={o} value={o}>Sort: {o}</option>)}
            </select>
          </div>
          <button className="button secondary" type="button" onClick={() => showToast('Export initiated.', 'success')}>Export Data</button>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Inventory Viewer</h3><span className="muted">Read-only access</span></div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="corvex-table">
              <thead><tr><th>Product ID</th><th>Product Name</th><th>Category</th><th>Unit Price</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.product_id}>
                    <td>{product.product_id}</td>
                    <td>{product.product_name}</td>
                    <td>{product.category_name || product.category_id}</td>
                    <td>{formatCurrency(product.unit_price)}</td>
                    <td><StatusBadge status={product.status} /></td>
                    <td>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/inventory/${product.product_id}`)}><NavIcon name="view" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No products found" description="Adjust your search or category filter." />}
      {selectedProduct ? (
        <aside className="panel content-panel product-drawer" role="dialog" aria-label="Product details">
          <div className="panel-section-header">
            <h3>{selectedProduct.name}</h3>
            <button className="toast-dismiss" type="button" onClick={() => setSelectedProduct(null)} aria-label="Close">×</button>
          </div>
          <ul className="info-grid">
            <li><span className="info-item-label">SKU</span><span className="info-item-value">{selectedProduct.sku}</span></li>
            <li><span className="info-item-label">Category</span><span className="info-item-value">{selectedProduct.category}</span></li>
            <li><span className="info-item-label">Stock</span><span className="info-item-value">{selectedProduct.stock} units</span></li>
            <li><span className="info-item-label">Unit Price</span><span className="info-item-value">{formatCurrency(selectedProduct.unitPrice)}</span></li>
            <li><span className="info-item-label">Branch</span><span className="info-item-value">{selectedProduct.branch}</span></li>
            <li><span className="info-item-label">Status</span><span className="info-item-value">{selectedProduct.status}</span></li>
          </ul>
          <button className="button" type="button" onClick={() => navigate(`/sales/inventory/${selectedProduct.id}`)}>Open Product Details</button>
        </aside>
      ) : null}
    </div>
  );
}

function ProductDetailsPage({ productId, navigate }) {
  const product = getProductById(productId);
  if (!product) return <EmptyState title="Product not found" actionLabel="Back to Inventory" onAction={() => navigate('/sales/inventory')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Current Stock', value: String(product.stock) },
        { label: 'Unit Price', value: formatCurrency(product.unitPrice) },
        { label: 'Status', value: product.status },
      ]} />
      <section className="panel content-panel">
        <ul className="info-grid">
          <li><span className="info-item-label">Product</span><span className="info-item-value">{product.name}</span></li>
          <li><span className="info-item-label">SKU</span><span className="info-item-value">{product.sku}</span></li>
          <li><span className="info-item-label">Category</span><span className="info-item-value">{product.category}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{product.branch}</span></li>
          <li><span className="info-item-label">Minimum Stock</span><span className="info-item-value">{product.minStock} units</span></li>
        </ul>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/inventory')}>Back to Inventory</button>
      </div>
    </div>
  );
}

function SalesHistoryPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchInvoices({ limit: 100 });

      if (!active) return;

      if (result.success) {
        setInvoices(result.data || []);
        setPagination(result.pagination || null);
      } else {
        setError(result.message || 'Failed to load sales history.');
        if (showToast) showToast(result.message || 'Failed to load sales history.', 'error');
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [showToast]);

  const productNames = useMemo(
    () => Array.from(new Set(invoices.flatMap((item) => item.product_names || []))).sort(),
    [invoices]
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((item) => {
      const customerName = item.customer_name || `${item.first_name || ''} ${item.last_name || ''}`.trim();
      const invoiceDate = String(item.invoices_date || '').slice(0, 10);
      const matchesSearch = !query || customerName.toLowerCase().includes(query) || String(item.invoice_number || '').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesFrom = !dateFrom || invoiceDate >= dateFrom;
      const matchesTo = !dateTo || invoiceDate <= dateTo;
      const matchesProduct = productFilter === 'All' || (item.product_names || []).includes(productFilter);
      return matchesSearch && matchesStatus && matchesFrom && matchesTo && matchesProduct;
    });
  }, [search, statusFilter, dateFrom, dateTo, productFilter, invoices]);

  if (loading) return <LoadingState message="Loading sales history..." />;

  if (error && !invoices.length) {
    return (
      <EmptyState
        title="Unable to load sales history"
        description={error}
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto flex-1">
            <input className="filter-input search" type="search" placeholder="Search by customer or invoice number" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', flex: 1, minWidth: '200px' }} />
            <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>{['All', 'Confirmed', 'Pending Review', 'Draft'].map((o) => <option key={o}>{o}</option>)}</select>
            <select className="filter-select" value={productFilter} onChange={(e) => setProductFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}><option value="All">All Products</option>{productNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            <input className="filter-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
            <input className="filter-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }} />
          </div>
          <button className="button secondary" type="button" onClick={() => showToast('Export initiated.', 'success')}>Export Data</button>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Sales Transactions</h3>
          {pagination ? <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Showing {filtered.length} of {pagination.total} invoices</span> : null}
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="corvex-table">
              <thead><tr><th>Invoice Number</th><th>Customer Name</th><th>Total Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.invoice_number || item.sales_invoices_id}>
                    <td>{item.invoice_number}</td>
                    <td>{item.customer_name || item.first_name + ' ' + item.last_name}</td>
                    <td>{formatCurrency(item.total_amount)}</td>
                    <td>{String(item.invoices_date || '').slice(0, 10)}</td>
                    <td>{item.status}</td>
                    <td><button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/invoices/${encodeURIComponent(item.invoice_number)}`)}><NavIcon name="view" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No sales records found" description="Adjust your search or filters." />}
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter((n) => !n.read);
    if (filter === 'Read') return notifications.filter((n) => n.read);
    if (filter === 'Stock') return notifications.filter((n) => n.type === 'stock');
    if (filter === 'Schedule') return notifications.filter((n) => n.type === 'schedule');
    if (filter === 'Sales') return notifications.filter((n) => n.type === 'sale');
    if (filter === 'Assignments') return notifications.filter((n) => n.type === 'assignment');
    if (filter === 'CI') return notifications.filter((n) => n.type === 'ci');
    return notifications;
  }, [notifications, filter]);

  return (
    <div className="page">
      <div className="flex justify-end mt-2 mb-2">
        <button className="button secondary" type="button" onClick={() => { setNotifications((items) => items.map((n) => ({ ...n, read: true }))); showToast('All notifications marked as read.', 'success'); }}>Mark All as Read</button>
      </div>
      <section className="panel content-panel">
        <div className="segmented-control">
          {['All', 'Unread', 'Read', 'Stock', 'Schedule', 'Sales', 'Assignments', 'CI'].map((item) => (
            <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
      </section>
      {filtered.length ? (
        <div className="notification-list">
          {filtered.map((item) => (
            <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div><h4>{item.title}</h4><p className="muted">{item.message}</p><span className="notification-time">{item.time}</span></div>
              <div className="notification-actions">
                {!item.read ? <button className="button ghost" type="button" onClick={() => { setNotifications((items) => items.map((n) => (n.id === item.id ? { ...n, read: true } : n))); showToast('Marked as read.', 'success'); }}>Mark as Read</button> : null}
                <button className="button secondary" type="button" onClick={() => navigate(item.relatedTo)}>Open Related Record</button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No notifications" description="You're all caught up." />}
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const profile = currentUser || {};

  return (
    <div className="page">
      <OfflineBanner />
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{(profile.fullName || 'SA').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</div>
          <div><h3>{profile.fullName || 'Sales Agent'}</h3><p className="muted">{profile.email || ''}</p></div>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Assigned Branch</span><span className="info-item-value">{profile.branch?.name || '—'}</span></li>
          <li><span className="info-item-label">Role</span><span className="info-item-value">{profile.role?.name || '—'}</span></li>
          <li><span className="info-item-label">Status</span><span className="info-item-value">{profile.status || '—'}</span></li>
        </ul>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/audit-log')}>Audit Log</button>
        <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
        <button className="button secondary" type="button" onClick={() => showToast('Change Password form would open here.', 'success')}>Change Password</button>
        <button className="button" type="button" onClick={() => showToast('Update Profile form would open here.', 'success')}>Update Profile</button>
      </div>
    </div>
  );
}

function RouteTrackingPage({ navigate }) {
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'GPS Status', value: ROUTE_TRACKING.gpsEnabled ? 'Active' : 'Off' },
        { label: 'Territory Coverage', value: `${ROUTE_TRACKING.territoryCoverage}%` },
        { label: 'Visits Verified', value: `${ROUTE_TRACKING.visitsVerified}/${ROUTE_TRACKING.visitsPlanned}` },
      ]} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Territory Coverage Map</h3></div>
        <div style={{ marginTop: 16 }}>
          <LeafletMap
            center={[7.1907, 125.4553]}
            zoom={13}
            height={500}
            polylines={[{
              id: 'route',
              positions: customers.map((stop, i) => [7.1907 + (i * 0.006), 125.4553 + (i * 0.006)]),
              color: '#10b981'
            }]}
            markers={customers.map((stop, i) => ({
              id: stop.id,
              position: [7.1907 + (i * 0.006), 125.4553 + (i * 0.006)],
              label: stop.id.replace('customer-', ''),
              color: stop.status === 'Completed' ? '#10b981' : '#f59e0b',
              popup: `${stop.first_name} ${stop.last_name} - ${stop.status}`
            }))}
          />
        </div>
        <p className="muted">Current location: {ROUTE_TRACKING.currentLocation}</p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Visit Verification</h3></div>
        <ul className="widget-list">
          {customers.filter((c) => c.status === 'Completed').map((c) => (
            <li key={c.id}><div><strong>{c.first_name} {c.last_name}</strong><span className="muted">GPS verified · {c.lastVisitDate}</span></div><span className="status-badge status-completed">Verified</span></li>
          ))}
        </ul>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/dashboard')}>Back to Dashboard</button>
      </div>
    </div>
  );
}

function AuditLogPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3><p className="muted">Tracks login, sales, inventory views, CI submissions, and schedule completion.</p></div>
        <div className="table-shell">
          <table className="corvex-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>
              {AUDIT_LOGS.map((log) => (
                <tr key={log.id}><td>{log.action}</td><td>{log.detail}</td><td>{log.timestamp}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/profile')}>Back to Profile</button>
      </div>
    </div>
  );
}

function SettingsPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Settings</h3></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Enable offline mode</label></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Auto-sync when online</label></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Enable GPS route tracking</label></div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/dashboard')}>Back to Dashboard</button>
      </div>
    </div>
  );
}

export function SalesPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = { customerId: page.params?.customerId, visitId: page.params?.visitId, productId: page.params?.productId, invoiceId: page.params?.invoiceId, parentContext: page.parentContext, navigate, showToast };
  switch (page.pageType) {
    case 'dashboard': return <DashboardPage {...props} />;
    case 'settings': return <SettingsPage {...props} />;
    case 'scheduleList':
    case 'scheduleMap': return <SchedulePage pageType={page.pageType} {...props} />;
    case 'customers': return <CustomersPage {...props} />;
    case 'clients': return <CustomersPage {...props} />;
    case 'customerDetail': return <CustomerDetailPage {...props} />;
    case 'clientDetail': return <CustomerDetailPage {...props} />;
    case 'visitLog': return <VisitLogPage {...props} />;
    case 'ciForm': return <CIFormPage {...props} />;
    case 'inventory': return <InventoryPage {...props} />;
    case 'productDetails': return <ProductDetailsPage {...props} />;
    case 'history': return <SalesHistoryPage {...props} />;
    case 'invoiceDetails': return <InvoiceDetailsPage {...props} />;
    case 'saleDetails': return <InvoiceDetailsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    case 'routeTracking': return <RouteTrackingPage {...props} />;
    case 'auditLog': return <AuditLogPage {...props} />;
    case 'creditHistory': return <CreditHistoryListPage navigate={navigate} showToast={showToast} basePath="/sales/credit-history" userBranch={getCurrentUser()?.branch?.name} />;
    case 'creditDetail': return <CreditHistoryDetailPage creditId={page.params?.creditId} navigate={navigate} basePath="/sales/credit-history" />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}







