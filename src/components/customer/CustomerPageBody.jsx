import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { login as apiLogin, getEntryPathForRole, requestLogout } from '../../api/authService.js';
import { updateMyProfile } from '../../api/profileService.js';
import {
  fetchCustomerPortalMe,
  fetchCustomerPortalPayments,
  fetchCustomerPortalProducts,
  fetchCustomerPortalReceiptById,
  fetchCustomerPortalReceipts,
  fetchCustomerPurchaseRequests,
  fetchCustomerStatementSummary,
  submitCustomerPurchaseRequest,
  updateCustomerPortalContact,
} from '../../api/customerPortalService.js';
import { downloadPdf } from '../../utils/dataExport.js';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { fetchNotifications } from '../../api/notificationService.js';
import { formatDisplayDate, formatDisplayDateTime, formatCurrency, formatPhone } from '../../utils/formatters.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';

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

const CAROUSEL_MAX_SLIDES = 5;
const CAROUSEL_SWIPE_THRESHOLD = 48;

function CustomerProductCarousel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchCustomerPortalProducts();
      if (!cancelled) {
        if (res.success) {
          setProducts((res.data || []).slice(0, CAROUSEL_MAX_SLIDES));
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const slideCount = products.length;

  const goTo = (index) => {
    if (!slideCount) return;
    const next = ((index % slideCount) + slideCount) % slideCount;
    setActiveIndex(next);
  };

  const goPrev = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);

  const onTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchDeltaX.current = 0;
  };

  const onTouchMove = (event) => {
    if (touchStartX.current == null) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchDeltaX.current = touch.clientX - touchStartX.current;
  };

  const onTouchEnd = () => {
    const delta = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (Math.abs(delta) < CAROUSEL_SWIPE_THRESHOLD) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  if (loading || !slideCount) return null;

  return (
    <section className="customer-product-carousel" aria-roledescription="carousel" aria-label="Featured products">
      <div
        className="customer-product-carousel__stage"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="customer-product-carousel__track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {products.map((product, index) => {
            const name = product.product_name || 'Product';
            const category = product.category_name || 'Uncategorized';
            const price = formatCurrency(Number(product.unit_price || 0));
            return (
              <article
                key={product.product_id}
                className="customer-product-carousel__slide"
                aria-hidden={index !== activeIndex}
                aria-label={`${index + 1} of ${slideCount}`}
              >
                <p className="customer-product-carousel__eyebrow">{category}</p>
                <h3 className="customer-product-carousel__title">{name}</h3>
                <p className="customer-product-carousel__price">{price}</p>
              </article>
            );
          })}
        </div>

        <button
          type="button"
          className="customer-product-carousel__arrow customer-product-carousel__arrow--prev"
          aria-label="Previous product"
          onClick={goPrev}
        >
          <span className="customer-product-carousel__chevron" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="customer-product-carousel__arrow customer-product-carousel__arrow--next"
          aria-label="Next product"
          onClick={goNext}
        >
          <span className="customer-product-carousel__chevron" aria-hidden="true" />
        </button>

        <div className="customer-product-carousel__dots" role="tablist" aria-label="Carousel slides">
          {products.map((product, index) => (
            <button
              key={product.product_id}
              type="button"
              role="tab"
              aria-label={`Show product ${index + 1}`}
              aria-selected={index === activeIndex}
              className={`customer-product-carousel__dot${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HomePage({
  navigate
}) {
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
      <section className="panel dashboard-greeting customer-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Welcome back</p>
          <h2>{customerName}</h2>
          <p className="text-ink/70">Account {accountNumber}</p>
        </div>
        <Link to="/customer/notifications" className="relative p-2 text-ink/70 hover:text-blue hover:bg-blue/5 rounded-full transition-colors cursor-pointer" aria-label={`${unread} unread notifications`}>
          <NavIcon name="bell" />
          {unread > 0 ? <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex justify-center items-center rounded-full bg-red text-white text-[0.7rem] font-bold border-2 border-mint">{unread}</span> : null}
        </Link>
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

      <CustomerProductCarousel />

      <div className="flex flex-wrap gap-2 justify-end mt-4 mb-4">
        <button className="button secondary" type="button" onClick={() => navigate('/customer/statements')}>Statements</button>
        <button className="button secondary" type="button" onClick={() => navigate('/customer/account-details')}>Account Details</button>
        <button className="button secondary" type="button" onClick={() => navigate('/customer/receipts')}>Receipts</button>
        <button className="button" type="button" onClick={() => navigate('/customer/payment-history')}>Payment History</button>
        <button className="button" type="button" onClick={() => navigate('/customer/purchase-requests')}>Request Purchase</button>
      </div>

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
    </div>;
}
function AccountDetailsPage({
  navigate,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState({ contactNumber: '', email: '' });
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerPortalMe();
      if (res.success && res.data) {
        setAccount(res.data);
        setContact({
          contactNumber: res.data.contact_phone || '',
          email: res.data.portal_email || '',
        });
      }
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
          { label: 'Account Number', value: <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{account.customer_code || account.customer_id || '—'}</span> },
          { label: 'Address', value: account.address || '—' },
          { label: 'Branch', value: account.branch_name || '—' },
          { label: 'Account Status', value: <StatusBadge status={account.status || '—'} /> },
          { label: 'Portal Status', value: <StatusBadge status={portalStatusLabel(account.portal_status)} /> },
        ]} />
      </section>

      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Contact Information</h3></div>
        <label>Contact Number<input value={contact.contactNumber} onChange={e => setContact(c => ({
          ...c,
          contactNumber: e.target.value
        }))} /></label>
        <label>Email<input type="email" value={contact.email} onChange={e => setContact(c => ({
          ...c,
          email: e.target.value
        }))} /></label>
      </section>

      {showPassword ? <section className="panel form-panel content-panel">
        <div className="form-grid">
          <label>Current password<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label>
          <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" /></label>
          <label>Confirm new password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" autoComplete="new-password" /></label>
        </div>
      </section> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
        <button className="button secondary" type="button" disabled={saving} onClick={async () => {
          if (!showPassword) {
            setShowPassword(true);
            return;
          }
          if (!currentPassword) {
            showToast('Enter your current password.', 'error');
            return;
          }
          if (password.trim().length < 8) {
            showToast('Password must be at least 8 characters.', 'error');
            return;
          }
          if (password.trim() !== confirmPassword.trim()) {
            showToast('New password and confirmation do not match.', 'error');
            return;
          }
          setSaving(true);
          const result = await updateMyProfile({
            current_password: currentPassword,
            password: password.trim(),
            confirm_password: confirmPassword.trim(),
          });
          setSaving(false);
          if (result.success) {
            setCurrentPassword('');
            setPassword('');
            setConfirmPassword('');
            setShowPassword(false);
            showToast(result.message || 'Password updated.', 'success');
          } else showToast(result.message || 'Failed to change password.', 'error');
        }}>{showPassword ? 'Save Password' : 'Change Password'}</button>
        {showPassword ? <button className="button ghost" type="button" disabled={saving} onClick={() => {
          setShowPassword(false);
          setCurrentPassword('');
          setPassword('');
          setConfirmPassword('');
        }}>Cancel</button> : null}
        <button className="button" type="button" disabled={saving} onClick={async () => {
          setSaving(true);
          const result = await updateCustomerPortalContact({
            contact_phone: contact.contactNumber,
            portal_email: contact.email,
          });
          setSaving(false);
          if (result.success) {
            setAccount(result.data);
            showToast('Contact information updated.', 'success');
          } else showToast(result.message || 'Failed to update contact information.', 'error');
        }}>Update Contact Information</button>
      </div>
    </div>;
}
function PaymentHistoryPage({
  navigate,
  showToast
}) {
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    paymentType: 'All'
  });
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const filtered = payments;
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading payment history…" />;
  return <div className="page customer-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Payment History</h3></div>
        <div className="list-section-controls" style={{ marginBottom: 12 }}>
          <label className="table-filter-field">From Date<input className="filter-input" type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({
            ...f,
            dateFrom: e.target.value
          }))} /></label>
          <label className="table-filter-field">To Date<input className="filter-input" type="date" value={filters.dateTo} onChange={e => setFilters(f => ({
            ...f,
            dateTo: e.target.value
          }))} /></label>
          <label className="table-filter-field">Payment Type<select className="filter-select" value={filters.paymentType} onChange={e => setFilters(f => ({
            ...f,
            paymentType: e.target.value
          }))}>
            {paymentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select></label>
        </div>
        {filtered.length === 0 ? <EmptyState title="No payments found" description="Try adjusting your date range or payment type filter." /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Payment Date</th><th>Amount</th><th>Collector</th><th>Receipt #</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_filtered.map(p => <tr key={p.collectionpayment_id}>
                    <td>{formatDisplayDate(p.payment_date)}</td>
                    <td>{formatCurrency(Number(p.amount))}</td>
                    <td>{p.collector_name || '—'}</td>
                    <td>{p.receipt_number || '—'}</td>
                    <td className="table-actions">
                      {p.receipts_id ? (
                        <button className="icon-action-button" type="button" title="View receipt" onClick={() => navigate(`/customer/receipts/${p.receipts_id}`)}>
                          <NavIcon name="view" />
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        }
      </section>

      <div className="flex justify-end mt-4">
        <button className="button secondary" type="button" onClick={() => {
          const rows = filtered.map((p) => ({
            date: p.payment_date,
            amount: p.amount,
            method: p.payment_method,
            collector: p.collector_name || '',
            receipt: p.receipt_number || '',
          }));
          if (downloadPdf(rows, { filename: 'payment-statement.pdf', title: 'Payment Statement' })) showToast('Statement exported as PDF.', 'success');
          else showToast('Nothing to export.', 'error');
        }}>Export PDF</button>
      </div>
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
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/customer/receipts/${r.receipts_id}`)}>
                        <NavIcon name="view" />
                      </button>
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
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Outstanding Balance Summary</h3></div>
        <StatsGrid stats={[{
          label: 'Current Outstanding Balance',
          value: formatCurrency(Number(summary?.outstanding_balance || 0))
        }]} />
      </section>

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
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/customer/statements/${encodeURIComponent(id)}`)}>
                        <NavIcon name="view" />
                      </button>
                      <button className="icon-action-button" type="button" title="Export PDF" onClick={() => {
                        const ok = downloadPdf([{
                          month: label,
                          total_paid: s.total_paid,
                          outstanding_balance: summary?.outstanding_balance || 0,
                        }], { filename: `statement-${id}.pdf`, title: `${label} Statement` });
                        if (ok) showToast('Statement exported as PDF.', 'success');
                        else showToast('Nothing to export.', 'error');
                      }}>
                        <NavIcon name="download" />
                      </button>
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
  return <NotificationsInbox navigate={navigate} showToast={showToast} resolveRelatedPath={(item) => {
    const category = String(item.category || '').toLowerCase();
    if (category.includes('receipt')) return '/customer/receipts';
    if (category.includes('payment')) return '/customer/payment-history';
    return null;
  }} />;
}
function ProfilePage({
  navigate,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState({ contactNumber: '', email: '' });
  const [otpEnabled, setOtpEnabled] = useState(() => localStorage.getItem('corvex_customer_otp') !== '0');
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function load() {
      const res = await fetchCustomerPortalMe();
      if (res.success && res.data) {
        setAccount(res.data);
        setContact({
          contactNumber: res.data.contact_phone || '',
          email: res.data.portal_email || '',
        });
      }
      setLoading(false);
    }
    load();
  }, []);
  if (loading) return <LoadingState message="Loading profile…" />;
  if (!account) return <EmptyState title="Profile unavailable" description="Could not load your customer record." />;
  const customerName = `${account.first_name || ''} ${account.middle_name || ''} ${account.last_name || ''}`.replace(/\s+/g, ' ').trim() || '—';
  return <div className="page customer-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Personal Information</h3></div>
        <DetailRowsTable rows={[
          { label: 'Name', value: <strong>{customerName}</strong> },
          { label: 'Account Number', value: <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{account.customer_code || account.customer_id || '—'}</span> },
          { label: 'Branch', value: account.branch_name || '—' },
          { label: 'Status', value: <StatusBadge status={account.status || '—'} /> },
        ]} />
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Contact Information</h3></div>
        {editingContact ? (
          <div className="form-grid">
            <label>Phone<input value={contact.contactNumber} onChange={e => setContact(c => ({ ...c, contactNumber: e.target.value }))} /></label>
            <label>Email<input type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} /></label>
            <label>Address<input value={account.address || ''} readOnly /></label>
          </div>
        ) : (
          <DetailRowsTable rows={[
            { label: 'Phone', value: formatPhone(account.contact_phone) },
            { label: 'Email', value: account.portal_email || '—' },
            { label: 'Address', value: account.address || '—' },
          ]} />
        )}
      </section>

      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Security Settings</h3></div>
        <label className="toggle-label">
          <input type="checkbox" checked={otpEnabled} onChange={e => {
            setOtpEnabled(e.target.checked);
            localStorage.setItem('corvex_customer_otp', e.target.checked ? '1' : '0');
          }} />
          Enable OTP for login
        </label>
      </section>

      {showPassword ? <section className="panel form-panel content-panel">
        <div className="form-grid">
          <label>Current password<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label>
          <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" /></label>
          <label>Confirm new password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" autoComplete="new-password" /></label>
        </div>
      </section> : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
        <button className="button secondary" type="button" disabled={saving} onClick={async () => {
          if (!showPassword) {
            setShowPassword(true);
            return;
          }
          if (!currentPassword) {
            showToast('Enter your current password.', 'error');
            return;
          }
          if (password.trim().length < 8) {
            showToast('Password must be at least 8 characters.', 'error');
            return;
          }
          if (password.trim() !== confirmPassword.trim()) {
            showToast('New password and confirmation do not match.', 'error');
            return;
          }
          setSaving(true);
          const result = await updateMyProfile({
            current_password: currentPassword,
            password: password.trim(),
            confirm_password: confirmPassword.trim(),
          });
          setSaving(false);
          if (result.success) {
            setCurrentPassword('');
            setPassword('');
            setConfirmPassword('');
            setShowPassword(false);
            showToast(result.message || 'Password updated.', 'success');
          } else showToast(result.message || 'Failed to change password.', 'error');
        }}>{showPassword ? 'Save Password' : 'Change Password'}</button>
        {showPassword ? <button className="button ghost" type="button" disabled={saving} onClick={() => {
          setShowPassword(false);
          setCurrentPassword('');
          setPassword('');
          setConfirmPassword('');
        }}>Cancel</button> : null}
        {editingContact ? <>
            <button className="button ghost" type="button" disabled={saving} onClick={() => {
              setEditingContact(false);
              setContact({
                contactNumber: account.contact_phone || '',
                email: account.portal_email || '',
              });
            }}>Cancel</button>
            <button className="button" type="button" disabled={saving} onClick={async () => {
              setSaving(true);
              const result = await updateCustomerPortalContact({
                contact_phone: contact.contactNumber,
                portal_email: contact.email,
              });
              setSaving(false);
              if (result.success) {
                setAccount(result.data);
                setEditingContact(false);
                showToast('Profile updated.', 'success');
              } else showToast(result.message || 'Failed to update profile.', 'error');
            }}>Save Profile</button>
          </> : <button className="button" type="button" onClick={() => setEditingContact(true)}>Update Profile</button>}
      </div>
    </div>;
}
function CustomerPurchaseRequestsPage({ navigate, showToast }) {
  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const load = async () => {
    setLoading(true);
    const [productsRes, requestsRes] = await Promise.all([
      fetchCustomerPortalProducts(),
      fetchCustomerPurchaseRequests(),
    ]);
    if (productsRes.success) setProducts(productsRes.data || []);
    if (requestsRes.success) setRequests(requestsRes.data || []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!productId || !Number.isInteger(qty) || qty <= 0) {
      showToast('Select a product and valid quantity.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await submitCustomerPurchaseRequest({
      notes: notes.trim() || undefined,
      items: [{ product_id: Number(productId), quantity: qty }],
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Failed to submit request.', 'error');
      return;
    }
    showToast(result.message || 'Request submitted.', 'success');
    setNotes('');
    setQuantity('1');
    load();
  };
  if (loading) return <LoadingState message="Loading purchase requests…" />;
  return <div className="page customer-page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Request New Purchase</h3>
          <p className="muted">Submit a request to your sales agent. They will review it before a sales order or invoice is created.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pr-product">Product</label>
            <select id="pr-product" className="filter-select" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.product_id} value={p.product_id}>
                  {p.product_name} {p.sku ? `(${p.sku})` : ''} — {formatCurrency(Number(p.unit_price || 0))}
                </option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pr-qty">Quantity</label>
            <input id="pr-qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pr-notes">Notes (optional)</label>
            <textarea id="pr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Request'}</button>
        </form>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Your Requests</h3></div>
        {!requests.length ? <EmptyState title="No requests yet" description="Submitted purchase requests will appear here with status updates from your sales agent." /> : (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>ID</th><th>Status</th><th>Items</th><th>Submitted</th></tr></thead>
              <tbody>
                {requests.map((req) => <tr key={req.request_id}>
                    <td>{req.request_id}</td>
                    <td><StatusBadge status={req.status} /></td>
                    <td>{(req.items || []).map((item) => `${item.product_name} × ${item.quantity}`).join(', ')}</td>
                    <td>{formatDisplayDateTime(req.created_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>;
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
    case 'purchaseRequests':
      return <CustomerPurchaseRequestsPage {...props} />;
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
    case 'profile':
      return <ProfilePage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}