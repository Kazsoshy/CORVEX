import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomerById, fetchCustomers } from '../../api/salesService';
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
  getProductStock,
  getSaleById,
} from '../../data/salesMockData';
import { CustomerCard } from './CustomerCard';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';

function actionButtonClass(variant) {
  if (variant === 'secondary') return 'button secondary';
  if (variant === 'ghost') return 'button ghost';
  return 'button';
}

function PageToolbar({ actions, onAction }) {
  if (!actions?.length) return null;
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map((action) => (
            <button key={action.label} className={actionButtonClass(action.variant)} type="button" onClick={() => onAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

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
          <strong className="stat-value">{stat.value}</strong>
          <span className="stat-label">{stat.label}</span>
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

      <PageToolbar
        actions={[
          { label: "View Today's Schedule", to: '/sales/schedule' },
          { label: 'Log a Sale', to: firstPending ? `/sales/visit-log/${firstPending.id}?from=schedule` : '/sales/customers', variant: 'secondary' },
          { label: 'Check Inventory', to: '/sales/inventory', variant: 'secondary' },
        ]}
        onAction={(a) => navigate(a.to)}
      />

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

function SchedulePage({ pageType, navigate, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCustomers() {
      setLoading(true);
      const result = await fetchCustomers();
      if (result.success) {
        const scheduleData = result.data.map((customer, index) => ({
          id: String(customer.customer_id),
          first_name: customer.first_name,
          last_name: customer.last_name,
          contact_person_fname: customer.contact_person_fname,
          contact_person_lname: customer.contact_person_lname,
          address: customer.address,
          phone: customer.contact_phone,
          lastVisitDate: customer.updated_at ? new Date(customer.updated_at).toISOString().split('T')[0] : 'N/A',
          purchaseVolume: 0,
          totalPurchaseVolume: 0,
          distanceKm: 0,
          status: customer.status === 'Active' ? 'Pending' : 'Inactive',
          assignedToday: true,
          rank: index + 1,
          active: customer.status === 'Active',
          highValue: false,
          delinquent: false,
          lastPurchaseDate: 'N/A',
          paymentHistory: [],
          account_number: `ACC-${customer.customer_id}`,
          business_type: 'Retail',
          credit_limit: 0,
          outstanding_balance: 0,
          days_overdue: 0,
        }));
        setCustomers(scheduleData);
      }
      setLoading(false);
    }
    loadCustomers();
  }, []);
  const [filter, setFilter] = useState('All');
  const [showMap, setShowMap] = useState(pageType === 'scheduleMap');

  const filtered = useMemo(() => {
    if (filter === 'All') return customers;
    if (filter === 'Pending') return customers.filter((c) => c.status === 'Pending');
    if (filter === 'Completed') return customers.filter((c) => c.status === 'Completed');
    return customers.filter((c) => c.status === 'Rescheduled');
  }, [filter, customers]);

  if (loading) return <LoadingState />;

  const actions = [
    { label: 'Schedule List', to: '/sales/schedule', variant: pageType === 'scheduleList' && !showMap ? undefined : 'secondary' },
    { label: 'Territory Map', to: '/sales/schedule/map', variant: pageType === 'scheduleMap' || showMap ? undefined : 'secondary' },
  ];

  if (pageType === 'scheduleMap' || showMap) {
    return (
      <div className="page">
        <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
        <StatsGrid stats={[
          { label: 'Clients to Visit', value: String(SCHEDULE_STOPS.length) },
          { label: 'Distance Today', value: '22 km' },
          { label: 'Completed', value: String(DASHBOARD_SUMMARY.completedVisits) },
        ]} />
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Territory Route View</h3>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule')}>Show List View</button>
          </div>
          <div style={{ marginTop: 16 }}>
            <LeafletMap 
              center={[7.1907, 125.4553]} 
              zoom={13} 
              height={500}
              markers={customers.map((stop, i) => ({
                id: stop.id,
                position: [7.1907 + (i * 0.006), 125.4553 + (i * 0.006)],
                label: stop.id.replace('customer-', ''),
                color: stop.status === 'Completed' ? '#10b981' : '#2563eb',
                popup: `${stop.first_name} ${stop.last_name} - ${stop.status}`
              }))}
            />
          </div>
          <p className="muted">GPS tracking active · Territory coverage: {ROUTE_TRACKING.territoryCoverage}% · Visits verified: {ROUTE_TRACKING.visitsVerified}/{ROUTE_TRACKING.visitsPlanned}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
      <StatsGrid stats={[
        { label: 'Clients to Visit', value: String(SCHEDULE_STOPS.length) },
        { label: 'Distance Today', value: '22 km' },
        { label: 'Completed', value: String(DASHBOARD_SUMMARY.completedVisits) },
      ]} />
      <section className="panel content-panel" style={{ padding: '14px 20px' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
          <strong style={{ color: '#1e293b' }}>SAW Priority Engine</strong> — Clients are ranked using Simple Additive Weighting:
          purchase volume <strong>(40%)</strong>, delinquency risk <strong>(35%)</strong>, proximity <strong>(25%)</strong>. Highest score = visit first.
        </p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>SAW Prioritized Visit Schedule</h3>
          <div className="inline-toolbar">
            <div className="segmented-control">
              {['All', 'Pending', 'Completed', 'Rescheduled'].map((item) => (
                <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule/map')}>Territory Map View</button>
          </div>
        </div>
        {filtered.length ? (
          <div className="account-card-grid">
            {filtered.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                showRank
                onViewDetails={(c) => navigate(`/sales/customer-detail/${c.id}?from=schedule`)}
                onLogVisit={(c) => navigate(`/sales/visit-log/${c.id}?from=schedule`)}
              onNavigate={() => showToast(`Opening navigation to ${customer.address}`, 'success')}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No customers match this filter" description="Try a different status filter." />
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
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Customer List</h3></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by customer name, or contact number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['Active Customers', 'Inactive Customers', 'All Customers'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {['Name'].map((o) => <option key={o} value={o}>Sort: {o}</option>)}
            </select>
          </div>
        </div>
      </section>
      {filteredCustomers.length ? (
        <div className="account-card-grid">
          {filteredCustomers.map((customer) => (
            <CustomerCard
              key={customer.customer_id}
              customer={{...customer, id: String(customer.customer_id)}}
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
  const lastVisit = customer.activity?.last_sales_visit ? new Date(customer.activity.last_sales_visit).toLocaleDateString() : 'N/A';
  const creditLimit = customer.creditInfo?.credit_limit || 10000;
  const avgOrder = customer.paymentHistory && customer.paymentHistory.length 
    ? Math.round(purchaseVolume / customer.paymentHistory.length) 
    : purchaseVolume;

  return (
    <div className="page account-detail-page">
      <StatsGrid stats={[
        { label: 'Total Purchases', value: formatCurrency(purchaseVolume) },
        { label: 'Last Visit', value: lastVisit },
        { label: 'Avg Order', value: formatCurrency(avgOrder) },
      ]} />
      
      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>{customer.first_name} {customer.last_name}</h3>
          <p className="muted">Contact: {customer.contact_person_fname} {customer.contact_person_lname}</p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Address:</strong> {customer.address}</p>
            <p><strong>Contact:</strong> {customer.contact_phone}</p>
            <p><strong>Last Collection:</strong> {customer.activity?.last_collection_date ? new Date(customer.activity.last_collection_date).toLocaleDateString() : 'N/A'}</p>
          </div>
          <div>
            <h4 className="subsection-title">Credit Performance</h4>
            <p>Credit Limit: {formatCurrency(creditLimit)}</p>
            <p>Outstanding Balance: {formatCurrency(outstandingBalance)}</p>
            <div className="progress-bar-container" style={{ marginTop: 8 }}>
              <div className="progress-bar" style={{ width: `${Math.min((outstandingBalance / creditLimit) * 100, 100)}%`, backgroundColor: outstandingBalance > creditLimit * 0.8 ? '#ef4444' : '#3b82f6' }}></div>
            </div>
          </div>
        </div>
      </section>
      
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Recent Payments</h3>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {customer.paymentHistory && customer.paymentHistory.length ? customer.paymentHistory.map((p) => (
                <tr key={p.payment_id}>
                  <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td>{formatCurrency(p.amount)}</td>
                  <td>{p.payment_method || 'Cash'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3" className="text-center muted">No recent payments</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function VisitLogPage({ customerId, parentContext, navigate, showToast }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  
  const [formData, setFormData] = useState({ paymentMethod: 'Cash', notes: '' });
  const [submitted, setSubmitted] = useState(false);
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
  if (!customer) return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/sales/customers')} />;

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showToast(`Cannot add more. Only ${product.stock} in stock.`, 'error');
          return prev;
        }
        return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      if (product.stock <= 0) {
        showToast('Out of stock.', 'error');
        return prev;
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart((prev) => prev.map((item) => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty > item.stock) { showToast(`Only ${item.stock} in stock.`, 'error'); return item; }
        if (newQty < 1) return null;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const grandTotal = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  const handleSubmit = async () => {
    if (cart.length === 0) { showToast('Cart is empty.', 'error'); return; }
    if (!formData.paymentMethod) { showToast('Select a payment method.', 'error'); return; }
    if (submitted) return;
    
    setSubmitted(true);
    try {
      const res = await fetch('http://localhost:5000/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('corvex_token')}`,
        },
        body: JSON.stringify({
          customer_id: customer.customer_id,
          cart: cart.map(c => ({ id: c.product_id || c.id, quantity: c.quantity, unitPrice: c.unit_price || c.unitPrice })),
          payment_method_id: 1, // Assume 1 is Cash for now, since formData.paymentMethod is string
          notes: formData.notes
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Sale logged. Inventory deducted and visit marked completed.', 'success');
        navigate(`/sales/history`);
      } else {
        showToast(`Failed to log sale: ${data.message}`, 'error');
        setSubmitted(false);
      }
    } catch (err) {
      showToast('An error occurred during sale processing.', 'error');
      setSubmitted(false);
    }
  };

  const [products, setProducts] = useState([]);
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch('http://localhost:5000/api/products', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('corvex_token')}` }
        });
        const data = await res.json();
        if (data.success) {
          // Map backend product data to expected frontend format
          setProducts(data.data.map(p => ({
            id: p.product_id,
            product_id: p.product_id,
            name: p.product_name,
            sku: p.sku,
            category: p.category,
            stock: Number(p.total_quantity || p.quantity || 0),
            unitPrice: Number(p.unit_price)
          })));
        }
      } catch (err) {
        console.error('Failed to fetch products', err);
      }
    }
    loadProducts();
  }, []);

  const categories = ['All', ...new Set(products.map((p) => p.category))];
  const filteredProducts = products.filter(p => {
    if (category !== 'All' && p.category !== category) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page" style={{ height: 'calc(100vh - var(--header-height) - 48px)', display: 'flex', flexDirection: 'column' }}>
      <header className="panel-section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Log Sale: {customer.first_name} {customer.last_name}</h2>
          <p className="muted" style={{ margin: 0 }}>{customer.address}</p>
        </div>
        <button className="button ghost" onClick={() => navigate('/sales/customers')}>Cancel</button>
      </header>

      <div style={{ display: 'flex', gap: 24, flex: 1, overflow: 'hidden' }}>
        {/* Left Side: Product Grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="accounts-toolbar" style={{ marginBottom: 0 }}>
            <input type="search" className="search-input" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {filteredProducts.map(product => (
                <div 
                  key={product.id} 
                  className="quick-link-card" 
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, cursor: product.stock > 0 ? 'pointer' : 'not-allowed', opacity: product.stock > 0 ? 1 : 0.6 }}
                  onClick={() => product.stock > 0 && addToCart(product)}
                >
                  <div style={{ fontSize: '24px', textAlign: 'center', marginBottom: 8 }}>{product.image || '📦'}</div>
                  <strong style={{ fontSize: '1rem', lineHeight: '1.2' }}>{product.name}</strong>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>{product.sku}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCurrency(product.unitPrice)}</span>
                    <span style={{ fontSize: '0.8rem', color: product.stock > 0 ? 'var(--text-main)' : 'var(--danger)' }}>{product.stock > 0 ? `${product.stock} in stock` : 'Out of Stock'}</span>
                  </div>
                </div>
              ))}
            </div>
            {filteredProducts.length === 0 && <EmptyState title="No products found" />}
          </div>
        </div>

        {/* Right Side: Cart / POS Panel */}
        <div className="panel content-panel" style={{ width: 380, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--surface-3)', background: 'var(--surface-2)' }}>
            <h3 style={{ margin: 0 }}>Current Order</h3>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {cart.length === 0 ? (
              <EmptyState title="Cart is empty" description="Select products to add to the order." />
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {cart.map(item => (
                  <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', marginBottom: 4 }}>{item.name}</strong>
                      <span className="muted">{formatCurrency(item.unitPrice)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', border: '1px solid var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                        <button type="button" style={{ padding: '4px 8px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer' }} onClick={() => updateQuantity(item.id, -1)}>-</button>
                        <span style={{ padding: '4px 12px', fontSize: '0.9rem', minWidth: 32, textAlign: 'center', borderLeft: '1px solid var(--surface-3)', borderRight: '1px solid var(--surface-3)' }}>{item.quantity}</span>
                        <button type="button" style={{ padding: '4px 8px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer' }} onClick={() => updateQuantity(item.id, 1)}>+</button>
                      </div>
                      <strong style={{ minWidth: 80, textAlign: 'right' }}>{formatCurrency(item.quantity * item.unitPrice)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div style={{ padding: 16, borderTop: '1px solid var(--surface-3)', background: 'var(--surface-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: '1.25rem', fontWeight: 600 }}>
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
            
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Payment Method</label>
              <select value={formData.paymentMethod} onChange={(e) => setFormData(p => ({ ...p, paymentMethod: e.target.value }))}>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            
            <button className="button" style={{ width: '100%', padding: '12px', fontSize: '1rem' }} onClick={handleSubmit} disabled={cart.length === 0 || submitted}>
              Complete Sale
            </button>
          </div>
        </div>
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
        <div className="form-group"><label>Purpose of CI</label><select value={formData.purpose ?? ''} onChange={(e) => setFormData((p) => ({ ...p, purpose: e.target.value }))}><option value="">Select purpose</option>{['Credit Limit Increase', 'New Account', 'Delinquency Review'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Monthly Income</label><input type="number" placeholder="PHP amount" value={formData.income ?? ''} onChange={(e) => setFormData((p) => ({ ...p, income: e.target.value }))} /></div>
        <div className="form-group"><label>Business Type</label><select value={formData.businessType ?? ''} onChange={(e) => setFormData((p) => ({ ...p, businessType: e.target.value }))}><option value="">Select type</option>{['Retail', 'Wholesale', 'Convenience Store', 'Service'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Character References</label><textarea placeholder="Reference names and contacts..." value={formData.references ?? ''} onChange={(e) => setFormData((p) => ({ ...p, references: e.target.value }))} /></div>
        <div className="form-group"><label>Remarks</label><textarea placeholder="Additional notes..." value={formData.remarks ?? ''} onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))} /></div>
      </section>
      <PageToolbar
        actions={[
          { label: 'Submit to Operating Manager', action: 'submit' },
          { label: 'Cancel', to: `/sales/customer-detail/${customer.id}${contextQuery}`, variant: 'secondary' },
        ]}
        onAction={(a) => {
          if (a.action === 'submit') { showToast('CI Form sent to Operating Manager.', 'success'); navigate(`/sales/customer-detail/${customer.id}${contextQuery}`); }
          else navigate(a.to);
        }}
      />
    </div>
  );
}

function InventoryPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('Name');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/products', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('corvex_token')}` }
        });
        const data = await res.json();
        if (data.success) {
          setProducts(data.data.map(p => ({
            id: p.product_id,
            name: p.product_name,
            sku: p.sku,
            category: p.category,
            stock: Number(p.total_quantity || p.quantity || 0),
            status: p.stock_status || p.status,
            branch: p.branch_name || 'All Branches'
          })));
        }
      } catch (err) {
        console.error('Failed to fetch products', err);
      }
      setLoading(false);
    }
    loadProducts();
  }, []);

  const categories = ['All', ...new Set(products.map((p) => p.category))];
  const filtered = useMemo(() => {
    let results = [...products];
    const query = search.trim().toLowerCase();
    if (query) results = results.filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query));
    if (category !== 'All') results = results.filter((p) => p.category === category);
    if (sortBy === 'Stock Level') results.sort((a, b) => a.stock - b.stock);
    else results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }, [search, category, sortBy, products]);

  if (loading) return <LoadingState message="Loading inventory..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Inventory Viewer</h3><span className="muted">Read-only access</span></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search products by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{['Name', 'Stock Level'].map((o) => <option key={o} value={o}>Sort: {o}</option>)}</select>
          </div>
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Product Name</th><th>SKU</th><th>Current Stock</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{product.stock}</td>
                    <td>{product.branch}</td>
                    <td><span className={`stock-status stock-${product.status.toLowerCase()}`}>{product.status}</span></td>
                    <td>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/inventory/${product.id}`)}><NavIcon name="view" /></button>
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
      <PageToolbar actions={[{ label: 'Back to Inventory', to: '/sales/inventory', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function SalesHistoryPage({ navigate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return SALES_HISTORY.filter((item) => {
      const matchesSearch = !query || (item.customerName || item.first_name + ' ' + item.last_name).toLowerCase().includes(query) || item.invoiceNumber.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesFrom = !dateFrom || item.date >= dateFrom;
      const matchesTo = !dateTo || item.date <= dateTo;
      const matchesProduct = productFilter === 'All' || item.products.some((p) => p.name === productFilter);
      return matchesSearch && matchesStatus && matchesFrom && matchesTo && matchesProduct;
    });
  }, [search, statusFilter, dateFrom, dateTo, productFilter]);

  if (loading) return <LoadingState message="Loading sales history..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Sales Transactions</h3></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by customer or invoice number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{['All', 'Confirmed', 'Pending Review'].map((o) => <option key={o}>{o}</option>)}</select>
            <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}><option value="All">All Products</option>{PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Invoice Number</th><th>Customer Name</th><th>Total Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.invoiceNumber}</td>
                    <td>{item.customerName || item.first_name + ' ' + item.last_name}</td>
                    <td>{formatCurrency(item.totalAmount)}</td>
                    <td>{item.date}</td>
                    <td>{item.status}</td>
                    <td><button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/history/${item.id}`)}><NavIcon name="view" /></button></td>
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

function SaleDetailsPage({ invoiceId, navigate, showToast }) {
  const sale = getSaleById(invoiceId);
  if (!sale) return <EmptyState title="Sale not found" actionLabel="Back to History" onAction={() => navigate('/sales/history')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Invoice Number', value: sale.invoiceNumber },
        { label: 'Total Amount', value: formatCurrency(sale.totalAmount) },
        { label: 'Status', value: sale.status },
      ]} />
      <section className="panel content-panel">
        <ul className="info-grid">
          <li><span className="info-item-label">Customer</span><span className="info-item-value">{sale.customerName || sale.first_name + ' ' + sale.last_name}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{sale.branch}</span></li>
          <li><span className="info-item-label">Payment Method</span><span className="info-item-value">{sale.paymentMethod}</span></li>
          <li><span className="info-item-label">Date</span><span className="info-item-value">{sale.date}</span></li>
          <li><span className="info-item-label">Notes</span><span className="info-item-value">{sale.notes}</span></li>
        </ul>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
            <tbody>
              {sale.products.map((p) => (
                <tr key={p.name}><td>{p.name}</td><td>{p.quantity}</td><td>{formatCurrency(p.unitPrice)}</td><td>{formatCurrency(p.lineTotal)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to History', to: '/sales/history', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
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
      <PageToolbar actions={[{ label: 'Mark All as Read', action: 'markAll' }]} onAction={() => { setNotifications((items) => items.map((n) => ({ ...n, read: true }))); showToast('All notifications marked as read.', 'success'); }} />
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
      <PageToolbar
        actions={[
          { label: 'Update Profile', action: 'update' },
          { label: 'Change Password', action: 'password', variant: 'secondary' },
          { label: 'Audit Log', to: '/sales/audit-log', variant: 'ghost' },
          { label: 'Logout', action: 'logout', variant: 'ghost' },
        ]}
        onAction={(a) => {
          if (a.to) navigate(a.to);
          else if (a.action === 'logout') { requestLogout(); }
          else showToast(`${a.label} form would open here.`, 'success');
        }}
      />
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
      <PageToolbar actions={[{ label: 'Back to Dashboard', to: '/sales/dashboard', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function AuditLogPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3><p className="muted">Tracks login, sales, inventory views, CI submissions, and schedule completion.</p></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>
              {AUDIT_LOGS.map((log) => (
                <tr key={log.id}><td>{log.action}</td><td>{log.detail}</td><td>{log.timestamp}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Profile', to: '/sales/profile', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
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
      <PageToolbar actions={[{ label: 'Back to Dashboard', to: '/sales/dashboard', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

export function SalesPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = { customerId: page.params?.customerId, productId: page.params?.productId, invoiceId: page.params?.invoiceId, parentContext: page.parentContext, navigate, showToast };
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
    case 'saleDetails': return <SaleDetailsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    case 'routeTracking': return <RouteTrackingPage {...props} />;
    case 'auditLog': return <AuditLogPage {...props} />;
    case 'creditHistory': return <CreditHistoryListPage navigate={navigate} showToast={showToast} basePath="/sales/credit-history" userBranch={getCurrentUser()?.branch?.name} />;
    case 'creditDetail': return <CreditHistoryDetailPage creditId={page.params?.creditId} navigate={navigate} basePath="/sales/credit-history" />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}







