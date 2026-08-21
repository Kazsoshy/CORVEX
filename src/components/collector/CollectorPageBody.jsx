import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COLLECTION_HISTORY,
  NOTIFICATIONS,
  formatCurrency,
  getReceiptById,
} from '../../data/collectorMockData';
import { fetchAccounts, fetchAccountById } from '../../api/collectorService';
import { getCurrentUser } from '../../api/authService.js';
import { AccountCard } from './AccountCard';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';

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
            <button
              key={action.label}
              className={actionButtonClass(action.variant)}
              type="button"
              onClick={() => onAction(action)}
            >
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
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>
      ))}
    </section>
  );
}

function FormPanel({ title, fields, formData, onChange, errors = {} }) {
  return (
    <section className="panel form-panel content-panel">
      <div className="panel-section-header">
        <h3>{title}</h3>
      </div>
      {fields.map((field) => (
        <div key={field.name} className="form-group">
          <label>
            {field.label}
            {field.required ? <span className="required">*</span> : null}
          </label>
          {field.type === 'text' && (
            <input
              type="text"
              placeholder={field.placeholder}
              value={formData[field.name] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.name, e.target.value)}
              disabled={field.disabled}
            />
          )}
          {field.type === 'number' && (
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step ?? '0.01'}
              placeholder={field.placeholder}
              value={formData[field.name] ?? ''}
              onChange={(e) => onChange(field.name, e.target.value)}
              disabled={field.disabled}
            />
          )}
          {field.type === 'textarea' && (
            <textarea
              placeholder={field.placeholder}
              value={formData[field.name] ?? ''}
              onChange={(e) => onChange(field.name, e.target.value)}
              disabled={field.disabled}
            />
          )}
          {field.type === 'select' && (
            <select value={formData[field.name] ?? ''} onChange={(e) => onChange(field.name, e.target.value)}>
              <option value="">{field.placeholder}</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          {field.type === 'toggle' && (
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={Boolean(formData[field.name])}
                onChange={(e) => onChange(field.name, e.target.checked)}
              />
              {field.toggleLabel}
            </label>
          )}
          {field.type === 'file' && (
            <input type="file" accept={field.accept ?? 'image/*'} onChange={(e) => onChange(field.name, e.target.files?.[0]?.name ?? '')} />
          )}
          {field.type === 'preview' && <p className="field-preview">{field.value}</p>}
          {errors[field.name] ? <p className="form-error">{errors[field.name]}</p> : null}
        </div>
      ))}
    </section>
  );
}

function DashboardPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;
  const agentName = currentUser?.fullName || 'Collector';
  const branchName = currentUser?.branch?.name || '—';
  const recentCollections = COLLECTION_HISTORY.slice(0, 3);
  const recentIncidents = NOTIFICATIONS.filter((n) => n.type === 'incident').slice(0, 3);

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Good morning</p>
          <h2>{agentName}</h2>
          <p className="muted">{today}</p>
        </div>
        <Link to="/collector/notifications" className="notification-bell" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid
        stats={[
          { label: 'Branch', value: branchName },
          { label: 'Notifications', value: String(unreadCount) },
          { label: 'Recent Collections', value: String(COLLECTION_HISTORY.length) },
        ]}
      />

      <PageToolbar
        actions={[
          { label: "Start Today's Route", to: '/collector/route' },
          { label: 'Report Incident', to: '/collector/incident/1?from=accounts', variant: 'secondary' },
          { label: 'View Accounts', to: '/collector/accounts', variant: 'secondary' },
        ]}
        onAction={(action) => navigate(action.to)}
      />

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Recent Collections</h3>
          </div>
          {recentCollections.length ? (
            <ul className="widget-list">
              {recentCollections.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.customerName}</strong>
                    <span className="muted">{item.date}</span>
                  </div>
                  <span>{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No collections yet" description="Collections logged today will appear here." />
          )}
        </section>

        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Recent Incident Reports</h3>
          </div>
          {recentIncidents.length ? (
            <ul className="widget-list">
              {recentIncidents.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span className="muted">{item.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No incidents reported" description="Incident reports you submit will appear here." />
          )}
        </section>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Today&apos;s Route Progress</h3>
          <span className="muted">View route for updates</span>
        </div>
        <div className="progress-bar" role="progressbar" aria-valuenow={0} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `0%` }} />
        </div>
        <p className="muted progress-caption">
          Visit the route page for live status
        </p>
      </section>
    </div>
  );
}

function RoutePage({ pageType, navigate, showToast }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showMap, setShowMap] = useState(pageType === 'routeMap');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccounts();
      if (result.success) {
        const prioritized = result.data
          .filter((a) => a.status === 'Active' || a.status === 'Pending' || a.status === 'Overdue')
          .map((a, i) => ({ ...a, rank: i + 1 }))
          .sort((a, b) => (b.outstandingBalance || 0) - (a.outstandingBalance || 0));
        setCustomers(prioritized);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filteredStops = useMemo(() => {
    if (filter === 'All') return customers;
    if (filter === 'Pending') return customers.filter((s) => s.status === 'Pending' || s.status === 'Overdue');
    return customers.filter((s) => s.status === 'Completed');
  }, [filter, customers]);

  const actions = [
    { label: 'Route List', to: '/collector/route', variant: pageType === 'routeList' ? undefined : 'secondary' },
    { label: 'Map View', to: '/collector/route/map', variant: pageType === 'routeMap' ? undefined : 'secondary' },
    { label: 'Route Summary', to: '/collector/route/summary', variant: pageType === 'routeSummary' ? undefined : 'secondary' },
  ];

  if (loading) return <LoadingState message="Loading route..." />;

  if (pageType === 'routeSummary') {
    return (
      <div className="page">
        <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
        <StatsGrid
          stats={[
            { label: "Today's Stops", value: String(customers.length) },
            { label: 'Overdue Customers', value: String(customers.filter((s) => s.status === 'Overdue').length) },
            { label: 'Distance Planned', value: '—' },
            { label: 'Estimated Time', value: '—' },
          ]}
        />
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Route Summary</h3>
          </div>
          <ul className="info-grid">
            <li><span className="info-item-label">Total Outstanding on Route</span><span className="info-item-value">{formatCurrency(customers.reduce((sum, s) => sum + (s.outstandingBalance || 0), 0))}</span></li>
            <li><span className="info-item-label">Pending / Overdue Visits</span><span className="info-item-value">{customers.filter((s) => s.status !== 'Completed').length} stops</span></li>
            <li><span className="info-item-label">Completed Visits</span><span className="info-item-value">{customers.filter((s) => s.status === 'Completed').length} stops</span></li>
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
      <StatsGrid
        stats={[
          { label: "Today's Stops", value: String(customers.length) },
          { label: 'Overdue Customers', value: String(customers.filter((s) => s.status === 'Overdue').length) },
          { label: 'Distance Planned', value: '—' },
        ]}
      />
      <section className="panel content-panel" style={{ padding: '14px 20px' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
          <strong style={{ color: '#1e293b' }}>Customer Priority List</strong> — Customers are ordered by outstanding balance and urgency.
        </p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{showMap || pageType === 'routeMap' ? 'Route Map View' : 'Customer Priority List'}</h3>
          <div className="inline-toolbar">
            <div className="segmented-control">
              {['All', 'Pending', 'Completed'].map((item) => (
                <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>
                  {item}
                </button>
              ))}
            </div>
            {pageType !== 'routeMap' ? (
              <button className="button secondary" type="button" onClick={() => setShowMap(!showMap)}>
                {showMap ? 'Show List View' : 'Show Map View'}
              </button>
            ) : null}
          </div>
        </div>
        {showMap || pageType === 'routeMap' ? (
          <div style={{ marginTop: 16 }}>
            <LeafletMap 
              center={[7.1907, 125.4553]} 
              zoom={13} 
              height={500}
              markers={customers.map((stop, i) => ({
                id: stop.id,
                position: [7.1907 + (i * 0.005), 125.4553 + (i * 0.005)],
                label: stop.customerName.substring(0, 2).toUpperCase(),
                color: stop.status === 'Completed' ? '#10b981' : '#2563eb',
                popup: `${stop.customerName} - ${stop.status}`
              }))}
              polylines={[{ 
                id: 'route', 
                positions: customers.map((stop, i) => [7.1907 + (i * 0.005), 125.4553 + (i * 0.005)]), 
                color: '#2563eb' 
              }]}
            />
          </div>
        ) : filteredStops.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStops.map((stop, idx) => (
                  <tr key={stop.id}>
                    <td><strong>#{idx + 1}</strong></td>
                    <td>{stop.customerName}</td>
                    <td>{stop.address}</td>
                    <td>{formatCurrency(stop.outstandingBalance || 0)}</td>
                    <td><span className={`status-badge ${stop.status === 'Completed' ? 'status-completed' : stop.status === 'Overdue' ? 'status-inactive' : ''}`}>{stop.status}</span></td>
                    <td>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/collector/account-detail/${stop.id}?from=route`)}><NavIcon name="view" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No customers match this filter" description="Try a different status filter." />
        )}
      </section>
    </div>
  );
}

function AccountsPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All Customers');
  const [sortBy, setSortBy] = useState('Name');
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccounts();
      if (result.success) setCustomers(result.data);
      setLoading(false);
    }
    load();
  }, []);

  const filteredCustomers = useMemo(() => {
    let results = [...customers];
    const query = search.trim().toLowerCase();

    if (query) {
      results = results.filter(
        (customer) =>
          (customer.customerName || '').toLowerCase().includes(query) ||
          (customer.accountNumber || '').toLowerCase().includes(query) ||
          (customer.phone || '').includes(query),
      );
    }

    switch (filter) {
      case 'Assigned Today':
        results = results.filter((a) => a.assignedToday);
        break;
      case 'Pending':
        results = results.filter((a) => a.status === 'Pending');
        break;
      case 'Completed':
        results = results.filter((a) => a.status === 'Completed');
        break;
      case 'Overdue':
        results = results.filter((a) => a.status === 'Overdue');
        break;
      case 'Blacklisted':
        results = results.filter((a) => a.blacklisted);
        break;
      default:
        break;
    }

    switch (sortBy) {
      case 'Outstanding Balance':
        results.sort((a, b) => (b.outstandingBalance || 0) - (a.outstandingBalance || 0));
        break;
      case 'Days Overdue':
        results.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
        break;
      case 'Distance':
        results.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
        break;
      default:
        results.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));
        break;
    }

    return results;
  }, [customers, search, filter, sortBy]);

  if (loading) return <LoadingState message="Loading customers..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Customer List</h3>
        </div>
        <div className="accounts-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by customer name, account number, or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="accounts-filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['All Customers', 'Assigned Today', 'Pending', 'Completed', 'Overdue', 'Blacklisted'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {['Name', 'Outstanding Balance', 'Days Overdue', 'Distance'].map((option) => (
                <option key={option} value={option}>
                  Sort: {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {filteredCustomers.length ? (
        <div className="account-card-grid">
          {filteredCustomers.map((customer) => (
            <AccountCard
              key={customer.id}
              account={customer}
              onViewDetails={(item) => navigate(`/collector/account-detail/${item.id}?from=accounts`)}
              onCall={() => showToast(`Calling ${customer.customerName}...`, 'success')}
              onNavigate={() => showToast(`Opening navigation to ${customer.address}`, 'success')}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No customers found"
          description="Adjust your search or filters to find customers."
          actionLabel="Clear search"
          onAction={() => {
            setSearch('');
            setFilter('All Customers');
          }}
        />
      )}
    </div>
  );
}

function AccountDetailPage({ accountId, parentContext, navigate, showToast }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) setAccount(result.data);
      setLoading(false);
    }
    load();
  }, [accountId]);

  if (loading) return <LoadingState message="Loading customer..." />;
  if (!account) {
    return <EmptyState title="Customer not found" description="This customer may have been removed or is unavailable." actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }

  const backTo = parentContext === 'route' ? '/collector/route' : '/collector/accounts';
  const contextQuery = `?from=${parentContext}`;

  return (
    <div className="page">
      <StatsGrid
        stats={[
          { label: 'Outstanding Balance', value: formatCurrency(account.outstandingBalance || 0) },
          { label: 'Days Overdue', value: String(account.daysOverdue || 0) },
          { label: 'Delinquency Status', value: account.status },
        ]}
      />

      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>{account.customerName}</h3>
          <p className="muted">{account.accountNumber}</p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Address:</strong> {account.address}</p>
            <p><strong>Contact:</strong> {account.phone}</p>
            <p><strong>Last Visit:</strong> {account.lastVisitDate}</p>
          </div>
          <div style={{ minHeight: 200, width: '100%', borderRadius: 8, overflow: 'hidden' }}>
            <LeafletMap 
              center={account.latitude && account.longitude ? [account.latitude, account.longitude] : [7.1907, 125.4553]} 
              zoom={15} 
              height={200}
              markers={[{
                id: account.id,
                position: account.latitude && account.longitude ? [account.latitude, account.longitude] : [7.1907, 125.4553],
                label: (account.customerName || 'CU').substring(0, 2).toUpperCase(),
                color: '#2563eb',
                popup: account.customerName
              }]}
            />
          </div>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Payment History</h3>
        </div>
        {account.paymentHistory && account.paymentHistory.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Collected By</th>
                  <th>Receipt #</th>
                </tr>
              </thead>
              <tbody>
                {account.paymentHistory.map((row) => (
                  <tr key={row.receipt}>
                    <td>{row.date}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{row.collector}</td>
                    <td>{row.receipt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payment history" description="Previous collections for this customer will appear here." />
        )}
      </section>

      <PageToolbar
        actions={[
          { label: 'Log Collection', to: `/collector/collection-log/${account.id}${contextQuery}` },
          { label: 'Submit CI Form', to: `/collector/ci-form/${account.id}${contextQuery}`, variant: 'secondary' },
          { label: 'Report Incident', to: `/collector/incident/${account.id}${contextQuery}`, variant: 'secondary' },
          { label: 'Call Customer', action: 'call', variant: 'secondary' },
          { label: 'Open Navigation', action: 'navigate', variant: 'secondary' },
          { label: 'Back', to: backTo, variant: 'ghost' },
        ]}
        onAction={(action) => {
          if (action.action === 'call') showToast(`Calling ${account.customerName}...`, 'success');
          else if (action.action === 'navigate') showToast(`Opening navigation to ${account.address}`, 'success');
          else if (action.to) navigate(action.to);
        }}
      />
    </div>
  );
}

function CollectionLogPage({ accountId, parentContext, navigate, showToast }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    customerName: '',
    amountCollected: '',
    paymentMethod: '',
    notes: '',
    partialPayment: false,
    generateReceipt: true,
    proofPhoto: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const contextQuery = `?from=${parentContext}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) {
        setAccount(result.data);
        setFormData((prev) => ({ ...prev, customerName: result.data.customerName || '' }));
      }
      setLoading(false);
    }
    load();
  }, [accountId]);

  if (loading) return <LoadingState message="Loading customer..." />;
  if (!account) {
    return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }

  const remainingBalance = Math.max((account.outstandingBalance || 0) - (Number(formData.amountCollected) || 0), 0);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = () => {
    const amount = Number(formData.amountCollected);
    const nextErrors = {};

    if (!amount || amount <= 0) nextErrors.amountCollected = 'Enter a valid amount greater than zero.';
    if (amount > (account.outstandingBalance || 0)) nextErrors.amountCollected = 'Amount cannot exceed outstanding balance.';
    if (!formData.paymentMethod) nextErrors.paymentMethod = 'Select a payment method.';
    if (submitted) nextErrors.amountCollected = 'This collection has already been submitted.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }

    setSubmitted(true);
    showToast('Collection logged successfully.', 'success');
    navigate(`/collector/receipt/${account.id}${contextQuery}`);
  };

  return (
    <div className="page">
      <FormPanel
        title="Log Payment Collection"
        formData={formData}
        onChange={handleChange}
        errors={errors}
        fields={[
          { name: 'customerName', label: 'Customer Name', type: 'text', disabled: true, defaultValue: account.customerName },
          { name: 'amountCollected', label: 'Amount Collected', type: 'number', required: true, min: 0, max: account.outstandingBalance || 0, placeholder: 'Enter amount' },
          { name: 'paymentMethod', label: 'Payment Method', type: 'select', required: true, placeholder: 'Select payment method', options: ['Cash', 'Check', 'Bank Transfer', 'Mobile Money'] },
          { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add notes about the transaction...' },
          { name: 'proofPhoto', label: 'Proof Photo Upload', type: 'file', accept: 'image/*' },
          { name: 'partialPayment', label: 'Partial Payment', type: 'toggle', toggleLabel: 'This is a partial payment' },
          { name: 'remainingPreview', label: 'Remaining Balance Preview', type: 'preview', value: formatCurrency(remainingBalance) },
          { name: 'generateReceipt', label: 'Generate Digital Receipt', type: 'toggle', toggleLabel: 'Generate receipt after submission' },
        ]}
      />
      <PageToolbar
        actions={[
          { label: 'Submit & Generate Receipt', action: 'submit' },
          { label: 'Cancel', to: `/collector/account-detail/${account.id}${contextQuery}`, variant: 'secondary' },
        ]}
        onAction={(action) => (action.action === 'submit' ? handleSubmit() : navigate(action.to))}
      />
    </div>
  );
}

function DigitalReceiptPage({ accountId, parentContext, navigate, showToast }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const contextQuery = `?from=${parentContext}`;
  const receiptNumber = `RCP-2024-${String(accountId).padStart(4, '0')}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) setAccount(result.data);
      setLoading(false);
    }
    load();
  }, [accountId]);

  if (loading) return <LoadingState message="Loading receipt..." />;
  if (!account) {
    return <EmptyState title="Receipt unavailable" actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }

  const currentUser = getCurrentUser();
  const collectorName = currentUser?.fullName || 'Collector';
  const branchName = currentUser?.branch?.name || '—';

  return (
    <div className="page">
      <StatsGrid
        stats={[
          { label: 'Receipt #', value: receiptNumber },
          { label: 'Amount Paid', value: formatCurrency(0) },
          { label: 'Payment Method', value: 'Cash' },
        ]}
      />
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Receipt Information</h3>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Customer</span><span className="info-item-value">{account.customerName}</span></li>
          <li><span className="info-item-label">Collector</span><span className="info-item-value">{collectorName}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{branchName}</span></li>
          <li><span className="info-item-label">Date & Time</span><span className="info-item-value">{new Date().toLocaleString('en-PH')}</span></li>
        </ul>
      </section>
      <PageToolbar
        actions={[
          { label: 'Download PDF', action: 'pdf' },
          { label: 'Print Receipt', action: 'print', variant: 'secondary' },
          { label: 'Send Receipt', action: 'send', variant: 'secondary' },
          { label: 'Return to Account Detail', to: `/collector/account-detail/${account.id}${contextQuery}`, variant: 'ghost' },
        ]}
        onAction={(action) => {
          if (action.to) navigate(action.to);
          else showToast(`${action.label} initiated.`, 'success');
        }}
      />
    </div>
  );
}

function CIFormPage({ accountId, parentContext, navigate, showToast }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ customerName: '' });
  const contextQuery = `?from=${parentContext}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) {
        setAccount(result.data);
        setFormData((prev) => ({ ...prev, customerName: result.data.customerName || '' }));
      }
      setLoading(false);
    }
    load();
  }, [accountId]);

  if (loading) return <LoadingState message="Loading customer..." />;
  if (!account) {
    return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }

  return (
    <div className="page">
      <FormPanel
        title="Credit Investigation Form"
        formData={formData}
        onChange={(name, value) => setFormData((prev) => ({ ...prev, [name]: value }))}
        fields={[
          { name: 'customerName', label: 'Customer Name', type: 'text', disabled: true, defaultValue: account.customerName },
          { name: 'purpose', label: 'Purpose of CI', type: 'select', required: true, placeholder: 'Select purpose', options: ['Credit Limit Increase', 'New Customer', 'Delinquency Review', 'Account Restructure'] },
          { name: 'monthlyIncome', label: 'Monthly Income', type: 'number', required: true, placeholder: 'PHP amount' },
          { name: 'businessType', label: 'Business Type', type: 'select', required: true, placeholder: 'Select type', options: ['Sari-Sari Store', 'Convenience Store', 'General Store', 'Wholesale', 'Retail', 'Service'] },
          { name: 'reference1', label: 'Character Reference 1', type: 'text', placeholder: 'Name and contact' },
          { name: 'reference2', label: 'Character Reference 2', type: 'text', placeholder: 'Name and contact' },
          { name: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Additional notes for the operating manager...' },
        ]}
      />
      <PageToolbar
        actions={[
          {
            label: 'Submit to Operating Manager',
            action: 'submit',
          },
          { label: 'Cancel', to: `/collector/account-detail/${account.id}${contextQuery}`, variant: 'secondary' },
        ]}
        onAction={(action) => {
          if (action.action === 'submit') {
            showToast('CI Form sent to Operating Manager.', 'success');
            navigate(`/collector/account-detail/${account.id}${contextQuery}`);
          } else {
            navigate(action.to);
          }
        }}
      />
    </div>
  );
}

function IncidentReportPage({ accountId, parentContext, navigate, showToast }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const contextQuery = parentContext ? `?from=${parentContext}` : '';
  const backTo = account ? `/collector/account-detail/${account.id}${contextQuery}` : '/collector/dashboard';

  useEffect(() => {
    async function load() {
      if (!accountId) return;
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) setAccount(result.data);
      setLoading(false);
    }
    load();
  }, [accountId]);

  if (loading) return <LoadingState message="Loading customer..." />;

  return (
    <div className="page">
      {account ? (
        <section className="panel content-panel">
          <p className="muted">Reporting incident for <strong>{account.customerName}</strong> ({account.accountNumber})</p>
        </section>
      ) : null}
      <FormPanel
        title="Report Incident"
        formData={formData}
        onChange={(name, value) => setFormData((prev) => ({ ...prev, [name]: value }))}
        fields={[
          { name: 'incidentType', label: 'Incident Type', type: 'select', required: true, placeholder: 'Select type', options: ['Safety Concern', 'Payment Dispute', 'Customer Aggression', 'Location Issue', 'Product Damage', 'Other'] },
          { name: 'description', label: 'Description', type: 'textarea', required: true, placeholder: 'Describe the incident in detail...' },
          { name: 'location', label: 'Location', type: 'text', placeholder: account?.address ?? 'Auto-detected or manual entry' },
          { name: 'photo', label: 'Photo Upload', type: 'file', accept: 'image/*' },
          { name: 'gps', label: 'GPS Coordinates', type: 'text', placeholder: '14.6760, 121.0437 (auto-detected)' },
          { name: 'severity', label: 'Severity Level', type: 'select', required: true, placeholder: 'Select severity', options: ['Low', 'Medium', 'High', 'Critical'] },
        ]}
      />
      <PageToolbar
        actions={[
          {
            label: 'Submit to Operating Manager',
            action: 'submit',
          },
          { label: 'Cancel', to: backTo, variant: 'secondary' },
        ]}
        onAction={(action) => {
          if (action.action === 'submit') {
            showToast('Incident report sent to Operating Manager.', 'success');
            navigate(backTo);
          } else {
            navigate(action.to);
          }
        }}
      />
    </div>
  );
}

function CollectionHistoryPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return COLLECTION_HISTORY.filter((item) => {
      const matchesSearch =
        !query || item.customerName.toLowerCase().includes(query) || item.receiptNumber.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesFrom = !dateFrom || item.date >= dateFrom;
      const matchesTo = !dateTo || item.date <= dateTo;
      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [search, statusFilter, dateFrom, dateTo]);

  if (loading) return <LoadingState message="Loading collection history..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Collection History</h3>
        </div>
        <div className="accounts-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by customer or receipt number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="accounts-filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {['All', 'Confirmed', 'Pending Review'].map((option) => (
                <option key={option} value={option}>
                  Status: {option}
                </option>
              ))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
      </section>

      {filteredHistory.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt Number</th>
                  <th>Customer Name</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{item.receiptNumber}</td>
                    <td>{item.customerName}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{item.date}</td>
                    <td>{item.status}</td>
                    <td>
                      <button className="icon-action-button" type="button" title="
                        View
                      " onClick={() => navigate(`/collector/history/${item.id}`)}><NavIcon name="view" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState title="No collection records found" description="Adjust your search or date filters." />
      )}
    </div>
  );
}

function ReceiptDetailsPage({ receiptId, navigate, showToast }) {
  const receipt = getReceiptById(receiptId);

  if (!receipt) {
    return <EmptyState title="Receipt not found" actionLabel="Back to History" onAction={() => navigate('/collector/history')} />;
  }

  return (
    <div className="page">
      <StatsGrid
        stats={[
          { label: 'Receipt Number', value: receipt.receiptNumber },
          { label: 'Amount', value: formatCurrency(receipt.amount) },
          { label: 'Status', value: receipt.status },
        ]}
      />
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Receipt Details</h3>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Customer</span><span className="info-item-value">{receipt.customerName}</span></li>
          <li><span className="info-item-label">Account</span><span className="info-item-value">{receipt.accountNumber}</span></li>
          <li><span className="info-item-label">Collector</span><span className="info-item-value">{receipt.collectorName}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{receipt.branch}</span></li>
          <li><span className="info-item-label">Payment Method</span><span className="info-item-value">{receipt.paymentMethod}</span></li>
          <li><span className="info-item-label">Date & Time</span><span className="info-item-value">{receipt.date} at {receipt.time}</span></li>
        </ul>
      </section>
      <PageToolbar
        actions={[
          { label: 'Download PDF', action: 'pdf' },
          { label: 'Print Receipt', action: 'print', variant: 'secondary' },
          { label: 'Back to History', to: '/collector/history', variant: 'ghost' },
        ]}
        onAction={(action) => {
          if (action.to) navigate(action.to);
          else showToast(`${action.label} initiated.`, 'success');
        }}
      />
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');

  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter((n) => !n.read);
    if (filter === 'Read') return notifications.filter((n) => n.read);
    if (filter === 'Assignments') return notifications.filter((n) => n.type === 'assignment');
    if (filter === 'Incidents') return notifications.filter((n) => n.type === 'incident');
    if (filter === 'Routes') return notifications.filter((n) => n.type === 'route');
    if (filter === 'Collections') return notifications.filter((n) => n.type === 'collection');
    return notifications;
  }, [notifications, filter]);

  const markAllRead = () => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    showToast('All notifications marked as read.', 'success');
  };

  return (
    <div className="page">
      <PageToolbar
        actions={[{ label: 'Mark All as Read', action: 'markAll' }]}
        onAction={() => markAllRead()}
      />
      <section className="panel content-panel">
        <div className="inline-toolbar">
          <div className="segmented-control">
            {['All', 'Unread', 'Read', 'Assignments', 'Incidents', 'Routes', 'Collections'].map((item) => (
              <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>
      {filtered.length ? (
        <div className="notification-list">
          {filtered.map((item) => (
            <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div>
                <h4>{item.title}</h4>
                <p className="muted">{item.message}</p>
                <span className="notification-time">{item.time}</span>
              </div>
              <div className="notification-actions">
                {!item.read ? (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => {
                      setNotifications((items) => items.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
                      showToast('Notification marked as read.', 'success');
                    }}
                  >
                    Mark as Read
                  </button>
                ) : null}
                <button className="button secondary" type="button" onClick={() => navigate(item.relatedTo)}>
                  Open Related Record
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No notifications" description="You're all caught up." />
      )}
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const profile = currentUser || {};

  return (
    <div className="page">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{(profile.fullName || 'CO').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</div>
          <div>
            <h3>{profile.fullName || 'Collector'}</h3>
            <p className="muted">{profile.email || ''}</p>
          </div>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Branch Assignment</span><span className="info-item-value">{profile.branch?.name || '—'}</span></li>
          <li><span className="info-item-label">Role</span><span className="info-item-value">{profile.role?.name || '—'}</span></li>
          <li><span className="info-item-label">Status</span><span className="info-item-value">{profile.status || '—'}</span></li>
        </ul>
      </section>
      <PageToolbar
        actions={[
          { label: 'Update Profile', action: 'update' },
          { label: 'Change Password', action: 'password', variant: 'secondary' },
          { label: 'Settings', to: '/collector/settings', variant: 'ghost' },
        ]}
        onAction={(action) => {
          if (action.to) navigate(action.to);
          else showToast(`${action.label} form would open here.`, 'success');
        }}
      />
    </div>
  );
}

function SettingsPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Settings</h3>
        </div>
        <div className="form-group">
          <label>Language</label>
          <select defaultValue="English">
            <option>English</option>
            <option>Filipino</option>
          </select>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" defaultChecked />
            Enable push notifications
          </label>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" defaultChecked />
            Auto-sync route data
          </label>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Dashboard', to: '/collector/dashboard', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

export function CollectorPageBody({ page, navigate, showToast }) {
  if (!page) {
    return (
      <EmptyState
        title="Page not found"
        description="This route is not available. Use the sidebar to open a supported screen."
      />
    );
  }

  const props = {
    accountId: page.params?.accountId,
    receiptId: page.params?.receiptId,
    parentContext: page.parentContext,
    navigate,
    showToast,
  };

  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...props} />;
    case 'settings':
      return <SettingsPage {...props} />;
    case 'routeList':
    case 'routeMap':
    case 'routeSummary':
      return <RoutePage pageType={page.pageType} {...props} />;
    case 'accounts':
      return <AccountsPage {...props} />;
    case 'accountDetail':
      return <AccountDetailPage {...props} />;
    case 'collectionLog':
      return <CollectionLogPage {...props} />;
    case 'digitalReceipt':
      return <DigitalReceiptPage {...props} />;
    case 'ciForm':
      return <CIFormPage {...props} />;
    case 'incidentReport':
    case 'incidentReportStandalone':
      return <IncidentReportPage {...props} />;
    case 'history':
      return <CollectionHistoryPage {...props} />;
    case 'receiptDetails':
      return <ReceiptDetailsPage {...props} />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'profile':
      return <ProfilePage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
