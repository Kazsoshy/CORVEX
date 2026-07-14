import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CUSTOMER_ACCOUNT,
  NOTIFICATIONS,
  PAYMENTS,
  RECEIPTS,
  STATEMENTS,
  UPCOMING_DUE_DATES,
  formatCurrency,
  getReceiptById,
  getStatementById,
} from '../../data/customerMockData';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
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
    <section className="stats-grid customer-stats">
      {stats.map((stat, index) => (
        <article key={stat.label} className="stat-card" style={{ '--stat-index': index }}>
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>
      ))}
    </section>
  );
}

function LoginPage({ navigate, showToast }) {
  const [form, setForm] = useState({ accountNumber: '', password: '', rememberDevice: false, useOtp: false });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const next = {};
    if (!form.accountNumber.trim()) next.accountNumber = 'Account number is required.';
    if (!form.password.trim()) next.password = 'Password or OTP is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = () => {
    if (!validate()) return;
    if (form.rememberDevice) showToast('Device recognized for future logins.', 'success');
    navigate('/customer/home');
  };

  return (
    <div className="page customer-login-page">
      <section className="panel form-panel narrow customer-login-panel">
        <div className="brand-card login-brand">
          <div className="brand-mark">C</div>
          <div className="brand-copy">
            <div className="brand-title">CORVEX</div>
            <div className="brand-subtitle">Customer Self-Service Portal</div>
          </div>
        </div>

        <h2>Sign in to your account</h2>
        <p className="muted">Enter your account number and password or OTP.</p>

        <label>
          Account Number
          <input
            value={form.accountNumber}
            onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
            placeholder="Enter your account number"
            autoComplete="username"
          />
          {errors.accountNumber ? <span className="form-error">{errors.accountNumber}</span> : null}
        </label>

        <label>
          {form.useOtp ? 'One-Time Password' : 'Password'}
          <input
            type={form.useOtp ? 'text' : 'password'}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={form.useOtp ? 'Enter OTP code' : 'Enter password'}
            autoComplete={form.useOtp ? 'one-time-code' : 'current-password'}
          />
          {errors.password ? <span className="form-error">{errors.password}</span> : null}
        </label>

        <label className="toggle-label">
          <input type="checkbox" checked={form.useOtp} onChange={(e) => setForm((f) => ({ ...f, useOtp: e.target.checked, password: '' }))} />
          Use OTP login instead
        </label>

        <label className="toggle-label">
          <input type="checkbox" checked={form.rememberDevice} onChange={(e) => setForm((f) => ({ ...f, rememberDevice: e.target.checked }))} />
          Remember this device
        </label>

        <div className="form-actions">
          <button className="button" type="button" onClick={handleLogin}>Login</button>
          <button className="button secondary" type="button" onClick={() => navigate('/password-reset')}>Forgot Password</button>
          {form.useOtp ? (
            <button className="button ghost" type="button" onClick={() => showToast('OTP resent to registered contact.', 'success')}>Resend OTP</button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function HomePage({ navigate }) {
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const recentPayments = PAYMENTS.slice(0, 3);
  const paidTotal = PAYMENTS.reduce((s, p) => s + p.amount, 0);
  const progressPct = Math.min(100, Math.round((paidTotal / (paidTotal + CUSTOMER_ACCOUNT.outstandingBalance)) * 100));

  return (
    <div className="page customer-page">
      <section className="panel dashboard-greeting customer-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Welcome back</p>
          <h2>{CUSTOMER_ACCOUNT.clientName}</h2>
          <p className="muted">Account {CUSTOMER_ACCOUNT.accountNumber}</p>
        </div>
        <Link to="/customer/notifications" className="notification-bell" aria-label={`${unread} unread notifications`}>
          <NavIcon name="bell" />
          {unread > 0 ? <span className="notification-badge">{unread}</span> : null}
        </Link>
      </section>

      <StatsGrid stats={[
        { label: 'Outstanding Balance', value: formatCurrency(CUSTOMER_ACCOUNT.outstandingBalance) },
        { label: 'Next Due Date', value: 'July 5, 2026' },
        { label: 'Account Status', value: CUSTOMER_ACCOUNT.accountStatus },
      ]} />

      <section className="panel content-panel">
        <p>Your account is up to date. Your next payment of {formatCurrency(CUSTOMER_ACCOUNT.nextPaymentAmount)} is due on July 5, 2026.</p>
      </section>

      <PageToolbar actions={[
        { label: 'Payment History', to: '/customer/payment-history' },
        { label: 'Receipts', to: '/customer/receipts', variant: 'secondary' },
        { label: 'Account Details', to: '/customer/account-details', variant: 'secondary' },
        { label: 'Statements', to: '/customer/statements', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Payments</h3></div>
          {recentPayments.length ? (
            <ul className="widget-list">
              {recentPayments.map((p) => (
                <li key={p.id}><div><strong>{formatCurrency(p.amount)}</strong><span className="muted">{p.date}</span></div><span>{p.receiptNumber}</span></li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No payments yet" description="Your payment history will appear here." />
          )}
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Upcoming Due Dates</h3></div>
          <ul className="widget-list">
            {UPCOMING_DUE_DATES.map((d) => (
              <li key={d.date}><div><strong>{formatCurrency(d.amount)}</strong><span className="muted">{d.label}</span></div><span>{d.date}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Payment Progress</h3></div>
        <div className="progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="muted">{progressPct}% of recent obligations paid</p>
      </section>
    </div>
  );
}

function AccountDetailsPage({ navigate, showToast }) {
  const [contact, setContact] = useState({
    contactNumber: CUSTOMER_ACCOUNT.contactNumber,
    email: CUSTOMER_ACCOUNT.email,
  });

  return (
    <div className="page customer-page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Account Information</h3></div>
        <ul className="detail-list">
          <li><span>Client Name</span><strong>{CUSTOMER_ACCOUNT.clientName}</strong></li>
          <li><span>Account Number</span><strong>{CUSTOMER_ACCOUNT.accountNumber}</strong></li>
          <li><span>Address</span><strong>{CUSTOMER_ACCOUNT.address}</strong></li>
          <li><span>Branch</span><strong>{CUSTOMER_ACCOUNT.branch}</strong></li>
          <li><span>Account Status</span><strong>{CUSTOMER_ACCOUNT.accountStatus}</strong></li>
        </ul>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Contact Information</h3></div>
        <label>Contact Number<input value={contact.contactNumber} onChange={(e) => setContact((c) => ({ ...c, contactNumber: e.target.value }))} /></label>
        <label>Email<input type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} /></label>
      </section>

      <PageToolbar actions={[
        { label: 'Update Contact Information' },
        { label: 'Change Password', variant: 'secondary' },
      ]} onAction={(a) => showToast(`${a.label} saved.`, 'success')} />
    </div>
  );
}

function PaymentHistoryPage({ navigate, showToast }) {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', paymentType: 'All' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    let results = [...PAYMENTS];
    if (filters.paymentType !== 'All') results = results.filter((p) => p.type === filters.paymentType);
    if (filters.dateFrom) results = results.filter((p) => p.date >= filters.dateFrom);
    if (filters.dateTo) results = results.filter((p) => p.date <= filters.dateTo);
    return results;
  }, [filters]);

  if (loading) return <LoadingState message="Loading payment history…" />;

  return (
    <div className="page customer-page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Filter Payments</h3></div>
        <div className="form-grid">
          <label>From Date<input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /></label>
          <label>To Date<input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} /></label>
          <label>Payment Type<select value={filters.paymentType} onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}>
            <option>All</option><option>Cash</option><option>Check</option>
          </select></label>
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState title="No payments found" description="Try adjusting your date range or payment type filter." />
      ) : (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Payment Date</th><th>Amount</th><th>Collector</th><th>Receipt #</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>{formatCurrency(p.amount)}</td>
                    <td>{p.collector}</td>
                    <td>{p.receiptNumber}</td>
                    <td className="table-actions">
                      <button className="button ghost" type="button" onClick={() => navigate(`/customer/receipts/${p.receiptNumber}`)}>View Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <PageToolbar actions={[
        { label: 'Download Statement', variant: 'secondary' },
      ]} onAction={() => showToast('Statement download started.', 'success')} />
    </div>
  );
}

function ReceiptsPage({ navigate, showToast }) {
  return (
    <div className="page customer-page">
      {RECEIPTS.length === 0 ? (
        <EmptyState title="No receipts" description="Receipts will appear here after payments are confirmed." />
      ) : (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Receipt #</th><th>Date</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody>
                {RECEIPTS.map((r) => (
                  <tr key={r.id}>
                    <td>{r.receiptNumber}</td>
                    <td>{r.date}</td>
                    <td>{formatCurrency(r.amount)}</td>
                    <td className="table-actions">
                      <button className="button ghost" type="button" onClick={() => navigate(`/customer/receipts/${r.receiptNumber}`)}>View</button>
                      <button className="button ghost" type="button" onClick={() => showToast(`Downloading ${r.receiptNumber}.pdf`, 'success')}>Download PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ReceiptDetailPage({ receiptId, showToast }) {
  const receipt = getReceiptById(receiptId);
  if (!receipt) return <EmptyState title="Receipt not found" description="Select a receipt from Digital Receipts." />;

  return (
    <div className="page customer-page">
      <section className="panel content-panel receipt-preview">
        <div className="panel-section-header"><h3>Receipt {receipt.receiptNumber}</h3></div>
        <ul className="detail-list">
          <li><span>Date</span><strong>{receipt.date}</strong></li>
          <li><span>Amount</span><strong>{formatCurrency(receipt.amount)}</strong></li>
          <li><span>Account</span><strong>{CUSTOMER_ACCOUNT.accountNumber}</strong></li>
          <li><span>Client</span><strong>{CUSTOMER_ACCOUNT.clientName}</strong></li>
        </ul>
      </section>
      <PageToolbar actions={[{ label: 'Download PDF' }]} onAction={() => showToast(`Downloading ${receipt.receiptNumber}.pdf`, 'success')} />
    </div>
  );
}

function StatementsPage({ navigate, showToast }) {
  return (
    <div className="page customer-page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Outstanding Balance Summary</h3></div>
        <div className="analytics-card highlight">
          <span className="metric-label">Current Outstanding Balance</span>
          <strong>{formatCurrency(CUSTOMER_ACCOUNT.outstandingBalance)}</strong>
        </div>
      </section>

      {STATEMENTS.length === 0 ? (
        <EmptyState title="No statements" description="Monthly statements will appear here." />
      ) : (
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Monthly Statements</h3></div>
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Month</th><th>Outstanding</th><th>Total Paid</th><th>Actions</th></tr></thead>
              <tbody>
                {STATEMENTS.map((s) => (
                  <tr key={s.id}>
                    <td>{s.month}</td>
                    <td>{formatCurrency(s.outstandingBalance)}</td>
                    <td>{formatCurrency(s.totalPaid)}</td>
                    <td className="table-actions">
                      <button className="button ghost" type="button" onClick={() => navigate(`/customer/statements/${s.id}`)}>View</button>
                      <button className="button ghost" type="button" onClick={() => showToast(`Downloading ${s.month} statement.`, 'success')}>Download PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatementDetailPage({ statementId, showToast }) {
  const statement = getStatementById(statementId);
  if (!statement) return <EmptyState title="Statement not found" description="Select a statement from the Statements page." />;

  return (
    <div className="page customer-page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>{statement.month} Statement</h3></div>
        <ul className="detail-list">
          <li><span>Generated</span><strong>{statement.generatedDate}</strong></li>
          <li><span>Outstanding Balance</span><strong>{formatCurrency(statement.outstandingBalance)}</strong></li>
          <li><span>Total Paid</span><strong>{formatCurrency(statement.totalPaid)}</strong></li>
          <li><span>Account</span><strong>{CUSTOMER_ACCOUNT.accountNumber}</strong></li>
        </ul>
      </section>
      <PageToolbar actions={[{ label: 'Download PDF Statement' }]} onAction={() => showToast(`Downloading ${statement.month} statement.`, 'success')} />
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [items, setItems] = useState(NOTIFICATIONS);

  const markRead = (id) => setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

  return (
    <div className="page customer-page">
      {items.length === 0 ? (
        <EmptyState title="No notifications" description="Payment reminders and updates will appear here." />
      ) : (
        <ul className="notification-list">
          {items.map((n) => (
            <li key={n.id} className={`notification-item${n.read ? '' : ' unread'}`}>
              <div><strong>{n.type}</strong><p className="muted">{n.message}</p></div>
              <div className="notification-actions">
                {!n.read ? <button className="button ghost" type="button" onClick={() => markRead(n.id)}>Mark as Read</button> : null}
                {n.relatedTo ? <button className="button ghost" type="button" onClick={() => navigate(n.relatedTo)}>Open</button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  const [otpEnabled, setOtpEnabled] = useState(true);

  return (
    <div className="page customer-page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Personal Information</h3></div>
        <ul className="detail-list">
          <li><span>Name</span><strong>{CUSTOMER_ACCOUNT.clientName}</strong></li>
          <li><span>Account Number</span><strong>{CUSTOMER_ACCOUNT.accountNumber}</strong></li>
          <li><span>Business Type</span><strong>{CUSTOMER_ACCOUNT.businessType}</strong></li>
        </ul>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Contact Information</h3></div>
        <ul className="detail-list">
          <li><span>Phone</span><strong>{CUSTOMER_ACCOUNT.contactNumber}</strong></li>
          <li><span>Email</span><strong>{CUSTOMER_ACCOUNT.email}</strong></li>
          <li><span>Address</span><strong>{CUSTOMER_ACCOUNT.address}</strong></li>
        </ul>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Security Settings</h3></div>
        <label className="toggle-label">
          <input type="checkbox" checked={otpEnabled} onChange={(e) => setOtpEnabled(e.target.checked)} />
          Enable OTP for login
        </label>
      </section>

      <PageToolbar actions={[
        { label: 'Change Password', variant: 'secondary' },
        { label: 'Logout', variant: 'ghost' },
      ]} onAction={(a) => {
        if (a.label === 'Logout') requestLogout();
        else showToast(`${a.label} action recorded.`, 'success');
      }} />
    </div>
  );
}

export function CustomerPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the menu to open a supported screen." />;

  const props = {
    receiptId: page.params?.receiptId,
    statementId: page.params?.statementId,
    navigate,
    showToast,
  };

  switch (page.pageType) {
    case 'login': return <LoginPage {...props} />;
    case 'home': return <HomePage {...props} />;
    case 'accountDetails': return <AccountDetailsPage {...props} />;
    case 'paymentHistory': return <PaymentHistoryPage {...props} />;
    case 'receipts': return <ReceiptsPage {...props} />;
    case 'receiptDetail': return <ReceiptDetailPage {...props} />;
    case 'statements': return <StatementsPage {...props} />;
    case 'statementDetail': return <StatementDetailPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
