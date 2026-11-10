import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatsGrid } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../shared/Pagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import { downloadPdf } from '../../utils/dataExport.js';
import {
  fetchCustomerPortalBalances,
  fetchCustomerPortalDashboard,
  fetchCustomerPortalInvoice,
  fetchCustomerPortalInvoices,
  fetchCustomerPortalPayments,
} from '../../api/customerPortalService.js';
import { getCurrentUser } from '../../api/authService.js';
import { fetchNotifications } from '../../api/notificationService.js';

function isInstallment(invoice) {
  return String(invoice?.pay_type || '').toLowerCase() === 'installment';
}

function payTypeLabel(invoice) {
  return isInstallment(invoice) ? 'Installment (Monthly)' : 'Pay in Full';
}

function termsLabel(invoice) {
  if (!isInstallment(invoice)) return 'Pay in Full';
  const months = Number(invoice.term_months);
  if (!months) return 'Installment (Monthly)';
  return `${months} month${months === 1 ? '' : 's'} · ${formatCurrency(invoice.monthly_amount || 0)}/month`;
}

function invoiceRows(invoices) {
  return (invoices || []).map((invoice) => ({
    invoice: invoice.invoice_number,
    date: formatDisplayDate(invoice.invoices_date),
    products: invoice.products_summary || '—',
    terms: termsLabel(invoice),
    total: formatCurrency(invoice.total_amount),
    paid: formatCurrency(invoice.amount_paid),
    remaining: formatCurrency(invoice.remaining_balance),
    due: formatDisplayDate(invoice.next_due_date || invoice.due_date || invoice.first_due_date),
    status: invoice.payment_status,
    agent: invoice.sales_agent_name || '—',
  }));
}

function BalanceTable({ title, rows, onOpen }) {
  const pagination = usePagination(rows);
  return (
    <section className="panel content-panel relative overflow-hidden">
      <div className="list-section-header"><h3>{title} <span className="text-ink/70">({rows.length})</span></h3></div>
      {rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()}`} description="Invoices in this group will appear here." /> : (
        <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Terms</th>
                  <th>Original Amount</th>
                  <th>Amount Paid</th>
                  <th>Remaining Balance</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedData.map((invoice) => (
                  <tr key={invoice.sales_invoices_id}>
                    <td>{invoice.invoice_number}</td>
                    <td>{termsLabel(invoice)}</td>
                    <td>{formatCurrency(invoice.total_amount)}</td>
                    <td>{formatCurrency(invoice.amount_paid)}</td>
                    <td>{formatCurrency(invoice.remaining_balance)}</td>
                    <td>{formatDisplayDate(invoice.next_due_date || invoice.due_date || invoice.first_due_date)}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View invoice" onClick={() => onOpen(invoice.sales_invoices_id)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </>
      )}
    </section>
  );
}

function paymentPill(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'paid') return 'cp-pill cp-pill--paid';
  if (key === 'partial') return 'cp-pill cp-pill--partial';
  if (key === 'overdue') return 'cp-pill cp-pill--overdue';
  return 'cp-pill cp-pill--unpaid';
}

function dueParts(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { month: '—', day: '—' };
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

function localTodayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isOnOrAfterToday(value, date = new Date()) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= localTodayKey(date);
}

function dueTone(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Upcoming';
  const days = Math.ceil((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return 'Overdue';
  if (days <= 7) return 'Due Soon';
  return 'Upcoming';
}

function timeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function greetingName(name, date = new Date()) {
  const first = String(name || 'there').trim().split(/\s+/)[0];
  return `${timeGreeting(date)}, ${first}!`;
}

function CustomerNotifyBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    fetchNotifications().then((result) => {
      if (!active || !result.success) return;
      setUnread((result.data || []).filter((item) => item.status !== 'Read').length);
    });
    return () => { active = false; };
  }, []);
  return (
    <button className="cp-bell" type="button" aria-label={`${unread} unread notifications`} onClick={() => navigate('/customer/notifications')}>
      <NavIcon name="bell" />
      {unread > 0 ? <span>{unread > 9 ? '9+' : unread}</span> : null}
    </button>
  );
}

export function CustomerDashboardPage() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [data, setData] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [nextDue, setNextDue] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      const [dash, invoiceRes, paymentRes] = await Promise.all([
        fetchCustomerPortalDashboard(),
        fetchCustomerPortalInvoices(),
        fetchCustomerPortalPayments(),
      ]);
      if (!active) return;
      if (dash.success) setData(dash.data);
      const invoices = invoiceRes.success ? (invoiceRes.data || []) : [];
      setPurchases(invoices.filter((invoice) => invoice.workflow_status === 'Confirmed').slice(0, 4));
      const open = invoices.filter((invoice) => (
        invoice.workflow_status === 'Confirmed'
        && ['Unpaid', 'Partial', 'Overdue'].includes(invoice.payment_status)
      ));
      setOpenInvoices(open.slice(0, 3));
      setNextDue(open
        .filter((invoice) => isOnOrAfterToday(invoice.next_due_date))
        .sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)))[0] || null);
      setPayments((paymentRes.success ? paymentRes.data || [] : []).filter((payment) => payment.status !== 'Cancelled').slice(0, 3));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);
  if (loading) return <LoadingState message="Loading your dashboard…" />;
  if (!data) return <EmptyState title="Dashboard unavailable" description="Could not load your account summary." />;
  const due = dueParts(nextDue?.next_due_date);
  const tone = nextDue ? dueTone(nextDue.next_due_date) : '';
  const displayName = user?.fullName || user?.name || 'there';
  const downloadPayment = (payment) => {
    const ok = downloadPdf([{
      reference: payment.receipt_number,
      date: formatDisplayDate(payment.payment_date),
      amount: payment.amount,
      method: payment.payment_method || '',
    }], { filename: `receipt-${payment.receipt_number || payment.collectionpayment_id}.pdf`, title: `Receipt ${payment.receipt_number || ''}` });
    return ok;
  };
  return (
    <div className="cp-dash">
      <section className="cp-hero">
        <CustomerNotifyBell />
        <h2>{greetingName(displayName)}</h2>
        <p>Here's an overview of your account.</p>
      </section>
      <div className="cp-stats">
        <button className="cp-stat cp-stat--blue" type="button" onClick={() => navigate('/customer/balances')}>
          <span className="cp-stat-icon"><NavIcon name="peso" /></span>
          <span>Outstanding Balance</span>
          <strong>{formatCurrency(data.outstanding_balance)}</strong>
        </button>
        <button className="cp-stat cp-stat--mint" type="button" onClick={() => navigate('/customer/purchases')}>
          <span className="cp-stat-icon"><NavIcon name="package" /></span>
          <span>Total Purchases</span>
          <strong>{formatCurrency(data.total_purchases)}</strong>
        </button>
        <button className="cp-stat cp-stat--green" type="button" onClick={() => navigate('/customer/payment-history')}>
          <span className="cp-stat-icon"><NavIcon name="credit-card" /></span>
          <span>Total Payments</span>
          <strong>{formatCurrency(data.total_payments)}</strong>
        </button>
        <button className="cp-stat cp-stat--lilac" type="button" onClick={() => navigate('/customer/purchases')}>
          <span className="cp-stat-icon"><NavIcon name="reports" /></span>
          <span>Active Invoices</span>
          <strong>{data.active_unpaid_invoices || 0}</strong>
        </button>
      </div>
      <div className="cp-dash-mid">
        <section className="cp-card">
          <header>
            <h3><NavIcon name="package" /> Recent Purchases</h3>
            <button type="button" onClick={() => navigate('/customer/purchases')}>View All</button>
          </header>
          {purchases.length === 0 ? <EmptyState title="No purchases yet" description="Confirmed invoices will appear here." /> : (
            <div className="corvex-table-wrapper">
              <table className="corvex-table cp-table">
                <thead><tr><th>Invoice #</th><th>Date</th><th>Products</th><th>Terms</th><th>Total Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {purchases.map((invoice) => (
                    <tr key={invoice.sales_invoices_id} onClick={() => navigate(`/customer/purchases/${invoice.sales_invoices_id}`)}>
                      <td>{invoice.invoice_number}</td>
                      <td>{formatDisplayDate(invoice.invoices_date)}</td>
                      <td className="cp-clip" title={invoice.products_summary || ''}>{invoice.products_summary || '—'}</td>
                      <td>{termsLabel(invoice)}</td>
                      <td>{formatCurrency(invoice.total_amount)}</td>
                      <td><span className={paymentPill(invoice.payment_status)}>{invoice.payment_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="cp-due">
          <header><h3><NavIcon name="clock" /> Upcoming Payment Due</h3></header>
          {nextDue ? (
            <>
              <div className="cp-due-body">
                <div className="cp-due-date"><small>{due.month}</small><strong>{due.day}</strong></div>
                <div>
                  <p>{nextDue.invoice_number}</p>
                  <strong>{formatCurrency(nextDue.remaining_balance)}</strong>
                  <small className="cp-terms">{termsLabel(nextDue)}</small>
                  <span className={tone === 'Overdue' ? 'cp-pill cp-pill--overdue' : 'cp-pill cp-pill--soon'}>{tone}</span>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/customer/balances')}>View Outstanding Balances</button>
            </>
          ) : <p className="cp-due-empty">No upcoming payment due.</p>}
        </section>
      </div>
      <div className="cp-dash-low">
        <section className="cp-card">
          <header>
            <h3><NavIcon name="peso" /> Outstanding Balances</h3>
            <button type="button" onClick={() => navigate('/customer/balances')}>View Details</button>
          </header>
          {openInvoices.length === 0 ? <EmptyState title="Nothing outstanding" description="Open invoices will appear here." /> : (
            <ul className="cp-balance-list">
              {openInvoices.map((invoice) => (
                <li key={invoice.sales_invoices_id}>
                  <button type="button" onClick={() => navigate(`/customer/purchases/${invoice.sales_invoices_id}`)}>
                    <span>{invoice.invoice_number}</span>
                    <span className={paymentPill(invoice.payment_status)}>{invoice.payment_status}</span>
                  </button>
                  <div>
                    <strong>{formatCurrency(invoice.remaining_balance)}</strong>
                    <small className="cp-terms">{termsLabel(invoice)}</small>
                    <small>Due {formatDisplayDate(invoice.next_due_date || invoice.due_date)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="cp-balance-total">
            <span>Total Outstanding Balance</span>
            <strong>{formatCurrency(data.outstanding_balance)}</strong>
          </div>
        </section>
        <section className="cp-card">
          <header>
            <h3><NavIcon name="clock" /> Payment History</h3>
            <button type="button" onClick={() => navigate('/customer/payment-history')}>View All</button>
          </header>
          {payments.length === 0 ? <EmptyState title="No payments yet" description="Collections will appear here." /> : (
            <div className="corvex-table-wrapper">
              <table className="corvex-table cp-table">
                <thead><tr><th>Payment Ref.</th><th>Date</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.collectionpayment_id}>
                      <td>{payment.receipt_number || '—'}</td>
                      <td>{formatDisplayDate(payment.payment_date)}</td>
                      <td>{formatCurrency(Number(payment.amount))}</td>
                      <td>{payment.payment_method || '—'}</td>
                      <td>
                        <button className="cp-download" type="button" title="Download receipt" onClick={() => downloadPayment(payment)}>
                          <NavIcon name="download" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function CustomerPurchasesPage({ showToast }) {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchCustomerPortalInvoices();
      if (!active) return;
      if (res.success) setInvoices((res.data || []).filter((invoice) => invoice.workflow_status !== 'Pending Review'));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);
  const pagination = usePagination(invoices);
  const exportHistory = () => {
    const ok = downloadPdf(invoiceRows(invoices), {
      filename: 'purchase-history.pdf',
      title: 'Purchase History',
    });
    showToast?.(ok ? 'Purchase history exported as PDF.' : 'Nothing to export.', ok ? 'success' : 'error');
  };
  if (loading) return <LoadingState message="Loading purchases…" />;
  return (
    <div className="page customer-page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Purchase History</h3>
          <button className="button secondary" type="button" onClick={exportHistory}>Download PDF</button>
        </div>
        {invoices.length === 0 ? <EmptyState title="No purchases yet" description="Confirmed invoices will appear here." /> : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Purchase Date</th>
                    <th>Products Purchased</th>
                    <th>Total Amount</th>
                    <th>Terms</th>
                    <th>Sales Agent</th>
                    <th>Payment Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((invoice) => (
                    <tr key={invoice.sales_invoices_id}>
                      <td>{invoice.invoice_number}</td>
                      <td>{formatDisplayDate(invoice.invoices_date)}</td>
                      <td className="cp-clip" title={invoice.products_summary || ''}>{invoice.products_summary || '—'}</td>
                      <td>{formatCurrency(invoice.total_amount)}</td>
                      <td>{termsLabel(invoice)}</td>
                      <td className="cp-clip" title={invoice.sales_agent_name || ''}>{invoice.sales_agent_name || '—'}</td>
                      <td><StatusBadge status={invoice.payment_status} /></td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="View invoice details" onClick={() => navigate(`/customer/purchases/${invoice.sales_invoices_id}`)}>
                          <NavIcon name="view" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        )}
      </section>
    </div>
  );
}

export function CustomerPurchaseDetailPage({ invoiceId, showToast }) {
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchCustomerPortalInvoice(invoiceId);
      if (!active) return;
      if (res.success) setInvoice(res.data);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [invoiceId]);
  if (loading) return <LoadingState message="Loading invoice…" />;
  if (!invoice) return <EmptyState title="Invoice not found" actionLabel="Back to purchases" onAction={() => navigate('/customer/purchases')} />;
  const exportInvoice = () => {
    const rows = (invoice.items || []).map((item) => ({
      product: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }));
    const ok = downloadPdf(rows.length ? rows : [{ invoice: invoice.invoice_number, total: invoice.total_amount }], {
      filename: `${invoice.invoice_number}.pdf`,
      title: `Invoice ${invoice.invoice_number}`,
      subtitle: `${formatDisplayDate(invoice.invoices_date)} · ${payTypeLabel(invoice)} · ${invoice.payment_status}`,
    });
    showToast?.(ok ? 'Invoice exported as PDF.' : 'Nothing to export.', ok ? 'success' : 'error');
  };
  return (
    <div className="page customer-page">
      <section className="panel content-panel">
        <div className="list-section-header">
          <h3>Invoice {invoice.invoice_number}</h3>
          <button className="button secondary" type="button" onClick={exportInvoice}>Download PDF</button>
        </div>
        <DetailRowsTable rows={[
          { label: 'Purchase Date', value: formatDisplayDate(invoice.invoices_date) },
          { label: 'Sales Agent', value: invoice.sales_agent_name || '—' },
          { label: 'Pay Type', value: payTypeLabel(invoice) },
          { label: 'Payment Method', value: invoice.payment_method || '—' },
          ...(isInstallment(invoice) ? [
            { label: 'Down Payment', value: formatCurrency(invoice.down_payment || 0) },
            { label: 'Months', value: invoice.term_months ?? '—' },
            { label: 'Monthly Amount', value: formatCurrency(invoice.monthly_amount || 0) },
            { label: 'First Due Date', value: formatDisplayDate(invoice.first_due_date) },
            { label: 'Next Due Date', value: formatDisplayDate(invoice.next_due_date) },
          ] : [
            { label: 'Due Date', value: formatDisplayDate(invoice.due_date) },
          ]),
          { label: 'Original Amount', value: formatCurrency(invoice.total_amount) },
          { label: 'Amount Paid', value: formatCurrency(invoice.amount_paid) },
          { label: 'Remaining Balance', value: formatCurrency(invoice.remaining_balance) },
          { label: 'Payment Status', value: <StatusBadge status={invoice.payment_status} /> },
        ]} />
      </section>
      <section className="panel content-panel">
        <div className="list-section-header"><h3>Products Purchased</h3></div>
        {(invoice.items || []).length === 0 ? <EmptyState title="No product lines" /> : (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Product</th><th>Quantity</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.item_id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.unit_price)}</td>
                    <td>{formatCurrency(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function CustomerBalancesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchCustomerPortalBalances();
      if (!active) return;
      if (res.success) setData(res.data);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);
  if (loading) return <LoadingState message="Loading outstanding balances…" />;
  if (!data) return <EmptyState title="Balances unavailable" description="Could not load your open invoices." />;
  const open = (invoice) => navigate(`/customer/purchases/${invoice}`);
  return (
    <div className="page customer-page">
      <StatsGrid stats={[
        { label: 'Total Outstanding Balance', value: formatCurrency(data.outstanding_balance) },
        { label: 'Unpaid Invoices', value: String((data.unpaid || []).length) },
        { label: 'Partially Paid Invoices', value: String((data.partial || []).length) },
        { label: 'Overdue Invoices', value: String((data.overdue || []).length) },
      ]} />
      <BalanceTable title="Unpaid Invoices" rows={data.unpaid || []} onOpen={open} />
      <BalanceTable title="Partially Paid Invoices" rows={data.partial || []} onOpen={open} />
      <BalanceTable title="Overdue Invoices" rows={data.overdue || []} onOpen={open} />
    </div>
  );
}

