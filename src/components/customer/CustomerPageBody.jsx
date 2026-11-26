import { Pagination } from '../shared/Pagination';
import { StatsGrid } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { login as apiLogin, getEntryPathForRole } from '../../api/authService.js';
import {
  fetchCustomerPortalMe,
  fetchCustomerPortalPayments,
  fetchCustomerPortalReceiptById,
  fetchCustomerPortalReceipts,
  fetchCustomerStatementSummary,
} from '../../api/customerPortalService.js';
import { downloadPdf } from '../../utils/dataExport.js';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { fetchNotifications } from '../../api/notificationService.js';
import { formatDisplayDate, formatCurrency, formatPhone } from '../../utils/formatters.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { RowActionMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import { CustomerProfilePanel } from '../shared/CustomerProfilePanel';
import { CustomerProductAdsPanel } from './CustomerProductAdsPanel.jsx';
function portalStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'invited':
    case 'pending':
      return 'Pending portal activation';
    case 'active':
      return 'Portal active';
    case 'none':
    case '':
      return 'No portal account';
    default:
      return String(status);
  }
}

function LoginPage({
  navigate,
  showToast
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleLogin = async () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required.';
    if (!password.trim()) next.password = 'Password is required.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setApiError('');
    try {
      const data = await apiLogin(email.trim(), password);
      if (data.success && data.user?.role?.slug === 'customer') {
        navigate(getEntryPathForRole('customer'));
        return;
      }
      if (data.success) {
        setApiError('This login is for customer portal accounts only. Use the main login page for staff.');
        return;
      }
      setApiError(data.message || 'Login failed.');
    } catch (err) {
      setApiError(err?.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };
  return <div className="page customer-login-page">
      <section className="panel form-panel narrow customer-login-panel">
        <div className="brand-card login-brand">
          <div className="brand-mark">C</div>
          <div className="brand-copy">
            <div className="brand-title">CORVEX</div>
            <div className="brand-subtitle">Customer Self-Service Portal</div>
          </div>
        </div>

        <h2>Sign in to your account</h2>
        <p className="text-ink/70">Use the email and password you set when activating your portal account.</p>

        <label>
          Email
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="username" />
          {errors.email ? <span className="form-error">{errors.email}</span> : null}
        </label>

        <label>
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          {errors.password ? <span className="form-error">{errors.password}</span> : null}
        </label>

        {apiError ? <p className="form-error" role="alert">{apiError}</p> : null}

        <div className="form-actions">
          <button className="button" type="button" onClick={handleLogin} disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
          <button className="button secondary" type="button" onClick={() => navigate('/login')}>Staff login</button>
        </div>
      </section>
    </div>;
}
function formatStatementMonth(monthStart) {
  if (!monthStart) return '—';
  const d = new Date(monthStart);
  if (Number.isNaN(d.getTime())) return String(monthStart);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function monthStartKey(monthStart) {
  if (!monthStart) return '';
  return String(monthStart).slice(0, 10);
}

function HomePage() {
  const [account, setAccount] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerPortalMe();
      if (res.success) setAccount(res.data);
      setLoading(false);
    }
    load();
  }, []);
  useEffect(() => {
    async function loadPayments() {
      const res = await fetchCustomerPortalPayments();
      if (res.success) setRecentPayments((res.data || []).slice(0, 3));
    }
    loadPayments();
  }, []);
  useEffect(() => {
    async function loadUnread() {
      const res = await fetchNotifications();
      if (res.success) setUnread((res.data || []).filter((n) => n.status !== 'Read').length);
    }
    loadUnread();
  }, []);
  const paidTotal = recentPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = Number(account?.outstanding_balance || 0);
  const progressPct = Math.min(100, Math.round(paidTotal / (paidTotal + outstanding) * 100) || 0);
  const customerName = account ? `${account.first_name || ''} ${account.last_name || ''}`.trim() : 'Customer';
  const accountNumber = account?.customer_code || '—';
  if (loading) return <LoadingState message="Loading your account…" />;
  return <div className="page customer-page">
      <div className="customer-home-layout">
        <div className="customer-home-main">
          <section className="panel dashboard-greeting customer-greeting">
            <div className="flex flex-col gap-1">
              <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Welcome back</p>
              <h2>{customerName}</h2>
              <p className="text-ink/70">Account {accountNumber}</p>
            </div>
          </section>

          <StatsGrid stats={[{
          label: 'Outstanding Balance',
          value: formatCurrency(outstanding)
        }, {
          label: 'Branch',
          value: account?.branch_name || '—'
        }, {
          label: 'Account Status',
          value: <StatusBadge status={account?.status || '—'} />
        }]} />

          <div className="dashboard-widgets grid two-up">
            <section className="panel content-panel relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Recent Payments</h3></div>
              {recentPayments.length ? (
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Payment Date</th>
                        <th>Amount</th>
                        <th>Receipt #</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayments.map((p) => (
                        <tr key={p.collectionpayment_id}>
                          <td>{formatDisplayDate(p.payment_date)}</td>
                          <td>{formatCurrency(Number(p.amount))}</td>
                          <td>{p.receipt_number || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No payments yet" description="Your payment history will appear here after collections are recorded." />
              )}
            </section>
            <section className="panel content-panel relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Account Activity</h3></div>
              <DetailRowsTable
                fieldHeader="Activity"
                detailsHeader="Date and Time"
                rows={[
                  { label: 'Last collection', value: account?.last_collection_date ? formatDisplayDate(account.last_collection_date) : '—' },
                  { label: 'Last sales visit', value: account?.last_sales_visit ? formatDisplayDate(account.last_sales_visit) : '—' },
                ]}
              />
            </section>
          </div>

          <section className="panel content-panel relative overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Payment Progress</h3></div>
            <div className="progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{
              width: `${progressPct}%`
            }} />
            </div>
            <p className="text-ink/70">{progressPct}% of recent obligations paid</p>
          </section>
        </div>

        <CustomerProductAdsPanel />
      </div>
    </div>;
}
function AccountDetailsPage() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerPortalMe();
      if (res.success && res.data) setAccount(res.data);
      setLoading(false);
    }
    load();
  }, []);
  if (loading) return <LoadingState message="Loading account details…" />;
  if (!account) return <EmptyState title="Account unavailable" description="Could not load your customer record." />;
  return <div className="page customer-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Account Information</h3></div>
        <DetailRowsTable rows={[
          { label: 'Customer Name', value: <strong>{`${account.first_name || ''} ${account.last_name || ''}`.trim() || '—'}</strong> },
          { label: 'Account Number', value: <span className="mono-cell">{account.customer_code || account.customer_id || '—'}</span> },
          { label: 'Address', value: account.address || '—' },
          { label: 'Branch', value: account.branch_name || '—' },
          { label: 'Account Status', value: <StatusBadge status={account.status || '—'} /> },
          { label: 'Portal Status', value: <StatusBadge status={portalStatusLabel(account.portal_status)} /> },
        ]} />
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Contact Information</h3></div>
        <DetailRowsTable rows={[
          { label: 'Contact Number', value: formatPhone(account.contact_phone) },
          { label: 'Email', value: account.portal_email || '—' },
        ]} />
      </section>
    </div>;
}
function PaymentHistoryPage({
  showToast
}) {
  const [filters, setFilters] = useState({
    search: '',
    dateFrom: '',
    dateTo: '',
    paymentType: 'All'
  });
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = {};
      if (filters.dateFrom) params.start_date = filters.dateFrom;
      if (filters.dateTo) params.end_date = filters.dateTo;
      if (filters.paymentType !== 'All') params.payment_method = filters.paymentType;
      const res = await fetchCustomerPortalPayments(params);
      if (res.success) setPayments(res.data || []);
      setLoading(false);
    }
    load();
  }, [filters.dateFrom, filters.dateTo, filters.paymentType]);
  const paymentTypes = useMemo(() => {
    const set = new Set((payments || []).map((p) => p.payment_method).filter(Boolean));
    return ['All', ...set];
  }, [payments]);
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const hay = [
        p.receipt_number,
        p.collector_name,
        p.payment_method,
        p.amount,
        formatDisplayDate(p.payment_date),
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [payments, filters.search]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;

  const exportAllPdf = () => {
    const rows = filtered.map((p) => ({
      date: p.payment_date,
      amount: p.amount,
      method: p.payment_method,
      collector: p.collector_name || '',
      receipt: p.receipt_number || '',
    }));
    if (downloadPdf(rows, { filename: 'payment-history.pdf', title: 'Payment History' })) {
      showToast('Payment history exported as PDF.', 'success');
    } else showToast('Nothing to export.', 'error');
  };

  const exportSelectedPdf = () => {
    if (!selectedPayment) return;
    const rows = [{
      date: selectedPayment.payment_date,
      amount: selectedPayment.amount,
      method: selectedPayment.payment_method,
      collector: selectedPayment.collector_name || '',
      receipt: selectedPayment.receipt_number || '',
      status: selectedPayment.status || '',
    }];
    const ref = selectedPayment.receipt_number || selectedPayment.collectionpayment_id;
    if (downloadPdf(rows, { filename: `payment-${ref}.pdf`, title: 'Payment Details' })) {
      showToast('Payment exported as PDF.', 'success');
    } else showToast('Nothing to export.', 'error');
  };

  if (loading) return <LoadingState message="Loading payment history…" />;
  return <div className="page customer-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Payment History</h3></div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar payment-history-toolbar">
          <div className="list-section-controls audit-logs-filters payment-history-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search receipt, collector, amount…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              aria-label="Search payments"
            />
            <input
              className="filter-input"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              aria-label="From date"
              title="From date"
            />
            <input
              className="filter-input"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              aria-label="To date"
              title="To date"
            />
            <select
              className="filter-select"
              value={filters.paymentType}
              onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}
              aria-label="Payment type"
            >
              {paymentTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'All' ? 'All Payment Types' : type}
                </option>
              ))}
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button secondary whitespace-nowrap" type="button" onClick={exportAllPdf}>
              Export PDF
            </button>
          </div>
        </div>
        {filtered.length === 0 ? <EmptyState title="No payments found" description="Try adjusting your search or filters." /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Payment Date</th><th>Amount</th><th>Collector</th><th>Receipt #</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_filtered.map(p => <tr key={p.collectionpayment_id}>
                    <td>{formatDisplayDate(p.payment_date)}</td>
                    <td>{formatCurrency(Number(p.amount))}</td>
                    <td>{p.collector_name || '—'}</td>
                    <td>{p.receipt_number || '—'}</td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        label={`Actions for payment ${p.receipt_number || p.collectionpayment_id}`}
                        items={[
                          { key: 'view', label: 'View', onSelect: () => setSelectedPayment(p) },
                        ]}
                      />
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        }
      </section>

      {selectedPayment ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-payment-detail-title"
          onClick={() => setSelectedPayment(null)}
        >
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3 id="customer-payment-detail-title" style={{ margin: 0 }}>Payment Details</h3>
                <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                  {selectedPayment.receipt_number || `Payment #${selectedPayment.collectionpayment_id}`}
                </p>
              </div>
              {selectedPayment.status ? <StatusBadge status={selectedPayment.status} /> : null}
            </div>
            <DetailRowsTable rows={[
              { label: 'Payment Date', value: formatDisplayDate(selectedPayment.payment_date) },
              { label: 'Amount', value: <strong>{formatCurrency(Number(selectedPayment.amount))}</strong> },
              { label: 'Payment Method', value: selectedPayment.payment_method || '—' },
              { label: 'Collector', value: selectedPayment.collector_name || '—' },
              { label: 'Receipt #', value: <span className="mono-cell">{selectedPayment.receipt_number || '—'}</span> },
              ...(selectedPayment.notes ? [{ label: 'Notes', value: selectedPayment.notes }] : []),
            ]} />
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={exportSelectedPdf}>
                Export PDF
              </button>
              <button className="button" type="button" onClick={() => setSelectedPayment(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>;
}
function ReceiptsPage({
  navigate,
  showToast
}) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerPortalReceipts();
      if (res.success) setReceipts(res.data || []);
      setLoading(false);
    }
    load();
  }, []);
  const pagination_RECEIPTS = usePagination(receipts);
  const paginated_RECEIPTS = pagination_RECEIPTS.paginatedData;
  if (loading) return <LoadingState message="Loading digital receipts…" />;
  return <div className="page customer-page">
      {receipts.length === 0 ? <EmptyState title="No receipts" description="Digital receipts appear here after collector payments are recorded." /> : <section className="panel content-panel relative overflow-hidden">
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Receipt #</th><th>Date</th><th>Amount</th><th>Method</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_RECEIPTS.map(r => <tr key={r.receipts_id}>
                    <td>{r.receipt_number || '—'}</td>
                    <td>{formatDisplayDate(r.receipt_date || r.payment_date)}</td>
                    <td>{formatCurrency(Number(r.amount))}</td>
                    <td>{r.payment_method || '—'}</td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        label={`Actions for receipt ${r.receipt_number || r.receipts_id}`}
                        items={[
                          { key: 'view', label: 'View', onSelect: () => navigate(`/customer/receipts/${r.receipts_id}`) },
                        ]}
                      />
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_RECEIPTS} /></>
        </section>}
    </div>;
}
function ReceiptDetailPage({
  receiptId,
  showToast
}) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerPortalReceiptById(receiptId);
      if (res.success) setReceipt(res.data);
      setLoading(false);
    }
    load();
  }, [receiptId]);
  if (loading) return <LoadingState message="Loading receipt…" />;
  if (!receipt) return <EmptyState title="Receipt not found" description="Select a receipt from Digital Receipts." />;
  return <div className="page customer-page">
      <section className="panel content-panel receipt-preview">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Receipt {receipt.receipt_number}</h3></div>
        <DetailRowsTable rows={[
          { label: 'Date', value: formatDisplayDate(receipt.receipt_date || receipt.payment_date) },
          { label: 'Amount', value: formatCurrency(Number(receipt.amount)) },
          { label: 'Payment method', value: receipt.payment_method || '—' },
          { label: 'Collector', value: receipt.collector_name || '—' },
          { label: 'Account', value: receipt.customer_code || '—' },
          { label: 'Branch', value: receipt.branch_name || '—' },
          { label: 'Status', value: <StatusBadge status={receipt.status || '—'} /> },
        ]} />
      </section>
    </div>;
}
function StatementsPage({
  navigate,
  showToast
}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerStatementSummary();
      if (res.success) setSummary(res.data);
      setLoading(false);
    }
    load();
  }, []);
  const months = summary?.months || [];
  const pagination_STATEMENTS = usePagination(months);
  const paginated_STATEMENTS = pagination_STATEMENTS.paginatedData;
  if (loading) return <LoadingState message="Loading statements…" />;
  return <div className="page customer-page">
      {!months.length ? <EmptyState title="No statements" description="Monthly payment totals will appear here after collections are recorded." /> : <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Monthly Payment Summary</h3></div>
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Month</th><th>Total Paid</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_STATEMENTS.map(s => {
                  const id = monthStartKey(s.month_start);
                  const label = formatStatementMonth(s.month_start);
                  return <tr key={id}>
                    <td>{label}</td>
                    <td>{formatCurrency(Number(s.total_paid || 0))}</td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        label={`Actions for ${label}`}
                        items={[
                          {
                            key: 'view',
                            label: 'View',
                            onSelect: () => navigate(`/customer/statements/${encodeURIComponent(id)}`),
                          },
                          {
                            key: 'export-pdf',
                            label: 'Export PDF',
                            onSelect: () => {
                              const ok = downloadPdf([{
                                month: label,
                                total_paid: s.total_paid,
                                outstanding_balance: summary?.outstanding_balance || 0,
                              }], { filename: `statement-${id}.pdf`, title: `${label} Statement` });
                              if (ok) showToast('Statement exported as PDF.', 'success');
                              else showToast('Nothing to export.', 'error');
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div><Pagination {...pagination_STATEMENTS} /></>
        </section>}
    </div>;
}
function StatementDetailPage({
  statementId,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [monthRow, setMonthRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const monthKey = decodeURIComponent(statementId || '').slice(0, 10);
  useEffect(() => {
    async function load() {
      const [meRes, summaryRes] = await Promise.all([
        fetchCustomerPortalMe(),
        fetchCustomerStatementSummary(),
      ]);
      if (meRes.success) setAccount(meRes.data);
      if (summaryRes.success) {
        const match = (summaryRes.data?.months || []).find(
          (m) => monthStartKey(m.month_start) === monthKey
        );
        setMonthRow(match || null);
      }
      setLoading(false);
    }
    load();
  }, [monthKey]);
  if (loading) return <LoadingState message="Loading statement…" />;
  if (!monthRow) return <EmptyState title="Statement not found" description="Select a month from the Statements page." />;
  const label = formatStatementMonth(monthRow.month_start);
  return <div className="page customer-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>{label}</h3></div>
        <DetailRowsTable rows={[
          { label: 'Period', value: label },
          { label: 'Total Paid This Month', value: formatCurrency(Number(monthRow.total_paid || 0)) },
          { label: 'Current Outstanding Balance', value: formatCurrency(Number(account?.outstanding_balance || 0)) },
          { label: 'Account', value: account?.customer_code || '—' },
        ]} />
      </section>
      <div className="flex justify-end mt-4">
        <button className="button" type="button" onClick={() => {
          const ok = downloadPdf([{
            period: label,
            total_paid: monthRow.total_paid,
            outstanding_balance: account?.outstanding_balance || 0,
            account: account?.customer_code || '',
          }], { filename: `statement-${monthKey}.pdf`, title: `${label} Statement` });
          if (ok) showToast('Statement exported as PDF.', 'success');
          else showToast('Nothing to export.', 'error');
        }}>Export PDF</button>
      </div>
    </div>;
}
function NotificationsPage({
  navigate,
  showToast
}) {
  return <NotificationsInbox navigate={navigate} showToast={showToast} roleKey="customer" />;
}
function ProfilePage({
  showToast
}) {
  return <CustomerProfilePanel showToast={showToast} />;
}

export function CustomerPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the menu to open a supported screen." />;
  const props = {
    receiptId: page.params?.receiptId,
    statementId: page.params?.statementId,
    navigate,
    showToast
  };
  switch (page.pageType) {
    case 'login':
      return <LoginPage {...props} />;
    case 'home':
      return <HomePage {...props} />;
    case 'accountDetails':
      return <AccountDetailsPage {...props} />;
    case 'paymentHistory':
      return <PaymentHistoryPage {...props} />;
    case 'receipts':
      return <ReceiptsPage {...props} />;
    case 'receiptDetail':
      return <ReceiptDetailPage {...props} />;
    case 'statements':
      return <StatementsPage {...props} />;
    case 'statementDetail':
      return <StatementDetailPage {...props} />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'settings':
      return <UserSettingsPanel role="customer" showToast={showToast} />;
    case 'profile':
      return <ProfilePage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}