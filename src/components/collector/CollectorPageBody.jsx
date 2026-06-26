import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACCOUNTS,
  COLLECTION_HISTORY,
  COLLECTOR_PROFILE,
  DASHBOARD_SUMMARY,
  NOTIFICATIONS,
  ROUTE_STOPS,
  formatCurrency,
  getAccountById,
  getReceiptById,
} from '../../data/collectorMockData';
import { AccountCard } from './AccountCard';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { NavIcon } from '../../navIcons';

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
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const recentCollections = COLLECTION_HISTORY.slice(0, 3);
  const recentIncidents = NOTIFICATIONS.filter((n) => n.type === 'incident').slice(0, 2);
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Good morning</p>
          <h2>{COLLECTOR_PROFILE.name}</h2>
          <p className="muted">{today}</p>
        </div>
        <Link to="/collector/notifications" className="notification-bell" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid
        stats={[
          { label: 'Accounts Assigned', value: String(DASHBOARD_SUMMARY.accountsAssigned) },
          { label: 'Collected Today', value: String(DASHBOARD_SUMMARY.collectedToday) },
          { label: 'Pending Visits', value: String(DASHBOARD_SUMMARY.pendingVisits) },
          { label: 'Completed Visits', value: String(DASHBOARD_SUMMARY.completedVisits) },
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
                    <strong>{item.clientName}</strong>
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
          <span className="muted">{DASHBOARD_SUMMARY.routeProgress}% complete</span>
        </div>
        <div className="progress-bar" role="progressbar" aria-valuenow={DASHBOARD_SUMMARY.routeProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${DASHBOARD_SUMMARY.routeProgress}%` }} />
        </div>
        <p className="muted progress-caption">
          {DASHBOARD_SUMMARY.completedVisits} of {DASHBOARD_SUMMARY.accountsAssigned} stops completed
        </p>
      </section>
    </div>
  );
}

function RoutePage({ pageType, navigate, showToast }) {
  const [filter, setFilter] = useState('All');
  const [showMap, setShowMap] = useState(pageType === 'routeMap');

  const filteredStops = useMemo(() => {
    if (filter === 'All') return ROUTE_STOPS;
    if (filter === 'Pending') return ROUTE_STOPS.filter((s) => s.status === 'Pending' || s.status === 'Overdue');
    return ROUTE_STOPS.filter((s) => s.status === 'Completed');
  }, [filter]);

  const actions = [
    { label: 'Route List', to: '/collector/route', variant: pageType === 'routeList' ? undefined : 'secondary' },
    { label: 'Map View', to: '/collector/route/map', variant: pageType === 'routeMap' ? undefined : 'secondary' },
    { label: 'Route Summary', to: '/collector/route/summary', variant: pageType === 'routeSummary' ? undefined : 'secondary' },
  ];

  if (pageType === 'routeSummary') {
    return (
      <div className="page">
        <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
        <StatsGrid
          stats={[
            { label: "Today's Stops", value: String(ROUTE_STOPS.length) },
            { label: 'Overdue Accounts', value: String(ROUTE_STOPS.filter((s) => s.status === 'Overdue').length) },
            { label: 'Distance Planned', value: '18 km' },
            { label: 'Estimated Time', value: '4h 30m' },
          ]}
        />
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Route Summary</h3>
          </div>
          <ul className="bullet-list">
            <li>Total outstanding on route: {formatCurrency(ROUTE_STOPS.reduce((sum, s) => sum + s.outstandingBalance, 0))}</li>
            <li>Completed collections: {ROUTE_STOPS.filter((s) => s.status === 'Completed').length}</li>
            <li>Remaining visits: {ROUTE_STOPS.filter((s) => s.status !== 'Completed').length}</li>
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
          { label: "Today's Stops", value: String(ROUTE_STOPS.length) },
          { label: 'Overdue Accounts', value: String(ROUTE_STOPS.filter((s) => s.status === 'Overdue').length) },
          { label: 'Distance Planned', value: '18 km' },
        ]}
      />
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{showMap || pageType === 'routeMap' ? 'Route Map View' : 'Route List'}</h3>
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
          <div className="placeholder-map">Leaflet.js map placeholder showing ranked route stops and territory pins</div>
        ) : filteredStops.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Balance</th>
                  <th>Days Overdue</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStops.map((stop) => (
                  <tr key={stop.id}>
                    <td>{stop.rank}</td>
                    <td>{stop.clientName}</td>
                    <td>{stop.address}</td>
                    <td>{formatCurrency(stop.outstandingBalance)}</td>
                    <td>{stop.daysOverdue}</td>
                    <td>
                      <button className="link-button" type="button" onClick={() => navigate(`/collector/account-detail/${stop.id}?from=route`)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No stops match this filter" description="Try a different status filter." />
        )}
      </section>
    </div>
  );
}

function AccountsPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All Accounts');
  const [sortBy, setSortBy] = useState('Name');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredAccounts = useMemo(() => {
    let results = [...ACCOUNTS];
    const query = search.trim().toLowerCase();

    if (query) {
      results = results.filter(
        (account) =>
          account.clientName.toLowerCase().includes(query) ||
          account.accountNumber.toLowerCase().includes(query) ||
          account.phone.includes(query),
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
        results.sort((a, b) => b.outstandingBalance - a.outstandingBalance);
        break;
      case 'Days Overdue':
        results.sort((a, b) => b.daysOverdue - a.daysOverdue);
        break;
      case 'Distance':
        results.sort((a, b) => a.distanceKm - b.distanceKm);
        break;
      default:
        results.sort((a, b) => a.clientName.localeCompare(b.clientName));
        break;
    }

    return results;
  }, [search, filter, sortBy]);

  if (loading) return <LoadingState message="Loading accounts..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Account List</h3>
        </div>
        <div className="accounts-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by client name, account number, or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="accounts-filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['All Accounts', 'Assigned Today', 'Pending', 'Completed', 'Overdue', 'Blacklisted'].map((option) => (
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

      {filteredAccounts.length ? (
        <div className="account-card-grid">
          {filteredAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onViewDetails={(item) => navigate(`/collector/account-detail/${item.id}?from=accounts`)}
              onCall={() => showToast(`Calling ${account.clientName}...`, 'success')}
              onNavigate={() => showToast(`Opening navigation to ${account.address}`, 'success')}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No accounts found"
          description="Adjust your search or filters to find accounts."
          actionLabel="Clear search"
          onAction={() => {
            setSearch('');
            setFilter('All Accounts');
          }}
        />
      )}
    </div>
  );
}

function AccountDetailPage({ accountId, parentContext, navigate, showToast }) {
  const account = getAccountById(accountId);

  if (!account) {
    return <EmptyState title="Account not found" description="This account may have been removed or is unavailable." actionLabel="Back to Accounts" onAction={() => navigate('/collector/accounts')} />;
  }

  const backTo = parentContext === 'route' ? '/collector/route' : '/collector/accounts';
  const contextQuery = `?from=${parentContext}`;

  return (
    <div className="page">
      <StatsGrid
        stats={[
          { label: 'Outstanding Balance', value: formatCurrency(account.outstandingBalance) },
          { label: 'Days Overdue', value: String(account.daysOverdue) },
          { label: 'Delinquency Status', value: account.status },
        ]}
      />

      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>{account.clientName}</h3>
          <p className="muted">{account.accountNumber}</p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Address:</strong> {account.address}</p>
            <p><strong>Contact:</strong> {account.phone}</p>
            <p><strong>Last Visit:</strong> {account.lastVisitDate}</p>
          </div>
          <div className="placeholder-map mini-map">Mini map placeholder for account location</div>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Payment History</h3>
        </div>
        {account.paymentHistory.length ? (
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
          <EmptyState title="No payment history" description="Previous collections for this account will appear here." />
        )}
      </section>

      <PageToolbar
        actions={[
          { label: 'Log Collection', to: `/collector/collection-log/${account.id}${contextQuery}` },
          { label: 'Submit CI Form', to: `/collector/ci-form/${account.id}${contextQuery}`, variant: 'secondary' },
          { label: 'Report Incident', to: `/collector/incident/${account.id}${contextQuery}`, variant: 'secondary' },
          { label: 'Call Client', action: 'call', variant: 'secondary' },
          { label: 'Open Navigation', action: 'navigate', variant: 'secondary' },
          { label: 'Back', to: backTo, variant: 'ghost' },
        ]}
        onAction={(action) => {
          if (action.action === 'call') showToast(`Calling ${account.clientName}...`, 'success');
          else if (action.action === 'navigate') showToast(`Opening navigation to ${account.address}`, 'success');
          else if (action.to) navigate(action.to);
        }}
      />
    </div>
  );
}

function CollectionLogPage({ accountId, parentContext, navigate, showToast }) {
  const account = getAccountById(accountId);
  const [formData, setFormData] = useState({
    clientName: account?.clientName ?? '',
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

  if (!account) {
    return <EmptyState title="Account not found" actionLabel="Back to Accounts" onAction={() => navigate('/collector/accounts')} />;
  }

  const remainingBalance = Math.max(account.outstandingBalance - (Number(formData.amountCollected) || 0), 0);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = () => {
    const amount = Number(formData.amountCollected);
    const nextErrors = {};

    if (!amount || amount <= 0) nextErrors.amountCollected = 'Enter a valid amount greater than zero.';
    if (amount > account.outstandingBalance) nextErrors.amountCollected = 'Amount cannot exceed outstanding balance.';
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
          { name: 'clientName', label: 'Client Name', type: 'text', disabled: true, defaultValue: account.clientName },
          { name: 'amountCollected', label: 'Amount Collected', type: 'number', required: true, min: 0, max: account.outstandingBalance, placeholder: 'Enter amount' },
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
  const account = getAccountById(accountId);
  const contextQuery = `?from=${parentContext}`;
  const receiptNumber = `RCP-2024-${String(accountId).padStart(4, '0')}`;

  if (!account) {
    return <EmptyState title="Receipt unavailable" actionLabel="Back to Accounts" onAction={() => navigate('/collector/accounts')} />;
  }

  return (
    <div className="page">
      <StatsGrid
        stats={[
          { label: 'Receipt #', value: receiptNumber },
          { label: 'Amount Paid', value: formatCurrency(5000) },
          { label: 'Payment Method', value: 'Cash' },
        ]}
      />
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Receipt Information</h3>
        </div>
        <ul className="bullet-list">
          <li>Client: {account.clientName}</li>
          <li>Collector: {COLLECTOR_PROFILE.name}</li>
          <li>Branch: {COLLECTOR_PROFILE.branch}</li>
          <li>Date & Time: {new Date().toLocaleString('en-PH')}</li>
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
  const account = getAccountById(accountId);
  const [formData, setFormData] = useState({ clientName: account?.clientName ?? '' });
  const contextQuery = `?from=${parentContext}`;

  if (!account) {
    return <EmptyState title="Account not found" actionLabel="Back to Accounts" onAction={() => navigate('/collector/accounts')} />;
  }

  return (
    <div className="page">
      <FormPanel
        title="Credit Investigation Form"
        formData={formData}
        onChange={(name, value) => setFormData((prev) => ({ ...prev, [name]: value }))}
        fields={[
          { name: 'clientName', label: 'Client Name', type: 'text', disabled: true, defaultValue: account.clientName },
          { name: 'purpose', label: 'Purpose of CI', type: 'select', required: true, placeholder: 'Select purpose', options: ['Credit Limit Increase', 'New Client', 'Delinquency Review', 'Account Restructure'] },
          { name: 'monthlyIncome', label: 'Monthly Income', type: 'number', required: true, placeholder: 'PHP amount' },
          { name: 'businessType', label: 'Business Type', type: 'select', required: true, placeholder: 'Select type', options: ['Sari-Sari Store', 'Convenience Store', 'General Store', 'Wholesale', 'Retail', 'Service'] },
          { name: 'reference1', label: 'Character Reference 1', type: 'text', placeholder: 'Name and contact' },
          { name: 'reference2', label: 'Character Reference 2', type: 'text', placeholder: 'Name and contact' },
          { name: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Additional notes for branch manager...' },
        ]}
      />
      <PageToolbar
        actions={[
          {
            label: 'Submit to Branch Manager',
            action: 'submit',
          },
          { label: 'Cancel', to: `/collector/account-detail/${account.id}${contextQuery}`, variant: 'secondary' },
        ]}
        onAction={(action) => {
          if (action.action === 'submit') {
            showToast('CI Form sent to Branch Manager.', 'success');
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
  const account = accountId ? getAccountById(accountId) : null;
  const [formData, setFormData] = useState({});
  const contextQuery = parentContext ? `?from=${parentContext}` : '';
  const backTo = account ? `/collector/account-detail/${account.id}${contextQuery}` : '/collector/dashboard';

  return (
    <div className="page">
      {account ? (
        <section className="panel content-panel">
          <p className="muted">Reporting incident for <strong>{account.clientName}</strong> ({account.accountNumber})</p>
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
            label: 'Submit to Branch Manager',
            action: 'submit',
          },
          { label: 'Cancel', to: backTo, variant: 'secondary' },
        ]}
        onAction={(action) => {
          if (action.action === 'submit') {
            showToast('Incident report sent to Branch Manager.', 'success');
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
        !query || item.clientName.toLowerCase().includes(query) || item.receiptNumber.toLowerCase().includes(query);
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
            placeholder="Search by client or receipt number"
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
                  <th>Client Name</th>
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
                    <td>{item.clientName}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{item.date}</td>
                    <td>{item.status}</td>
                    <td>
                      <button className="link-button" type="button" onClick={() => navigate(`/collector/history/${item.id}`)}>
                        View
                      </button>
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
        <ul className="bullet-list">
          <li>Client: {receipt.clientName}</li>
          <li>Account: {receipt.accountNumber}</li>
          <li>Collector: {receipt.collectorName}</li>
          <li>Branch: {receipt.branch}</li>
          <li>Payment Method: {receipt.paymentMethod}</li>
          <li>Date & Time: {receipt.date} at {receipt.time}</li>
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
  return (
    <div className="page">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{COLLECTOR_PROFILE.avatarInitials}</div>
          <div>
            <h3>{COLLECTOR_PROFILE.name}</h3>
            <p className="muted">{COLLECTOR_PROFILE.employeeId}</p>
          </div>
        </div>
        <ul className="bullet-list">
          <li>Branch Assignment: {COLLECTOR_PROFILE.branch}</li>
          <li>Email: {COLLECTOR_PROFILE.email}</li>
          <li>Phone: {COLLECTOR_PROFILE.phone}</li>
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
