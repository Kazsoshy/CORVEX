import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchCustomerById,
  fetchSalesCreditInvestigationById,
  fetchSalesCreditInvestigations,
} from '../../api/salesService';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../data/salesMockData';
import { usePagination } from '../../hooks/usePagination';
import {
  CREDIT_REVIEW_FILTERS,
  formatMoneyOrNA,
  mapCreditReviewRow,
} from '../../utils/creditReview';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';

function limitCell(review) {
  const suggested = review.suggestion?.suggested_limit ?? review.snapshot?.suggestion?.suggested_limit;
  const current = review.currentLimit;
  const requested = review.requestedLimit;
  const parts = [];
  if (requested != null) parts.push(`Req ${formatCurrency(requested)}`);
  if (current != null && current > 0) parts.push(`Cur ${formatCurrency(current)}`);
  else if (suggested != null) parts.push(`Sug ${formatCurrency(suggested)}`);
  else if (!parts.length) parts.push('Not available');
  return parts.join(' · ');
}

function SnapshotSections({ review }) {
  const snap = review.snapshot || {};
  const live = review.live;
  const customer = snap.customer || {};
  const financial = snap.financial || {};
  const liveFinancial = live?.financial;
  const payments = (live?.financial?.payment_history || financial.payment_history || review.paymentHistory || []).slice(0, 5);
  const openInvoices = financial.open_invoices || [];
  const overdue = financial.overdue_invoices || [];
  const previous = snap.previous_decisions || [];

  return (
    <>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Customer Profile</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Customer', value: customer.name || review.customerName || '—' },
            { label: 'Customer Code', value: customer.customer_code || review.customerCode || '—' },
            { label: 'Account Status', value: customer.status || '—' },
            { label: 'ID / KYC', value: customer.id_verification_status || '—' },
            { label: 'Credit Status', value: customer.credit_status || '—' },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Credit Snapshot</h3>
          <p className="muted">
            Frozen at request{snap.captured_at ? ` · ${formatDisplayDateTime(snap.captured_at)}` : ''}
          </p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Outstanding Balance', value: formatMoneyOrNA(financial.outstanding_balance) },
            { label: 'Approved Credit Limit', value: formatMoneyOrNA(financial.credit_limit) },
            { label: 'Remaining Credit', value: formatMoneyOrNA(financial.remaining_credit) },
            {
              label: 'Utilization',
              value: financial.utilization_pct != null ? `${financial.utilization_pct}%` : 'Not available',
            },
            { label: 'Requested Limit', value: formatMoneyOrNA(review.requestedLimit) },
          ]}
        />
        {liveFinancial && (review.status === 'Pending' || review.status === 'Revision Requested') ? (
          <div style={{ marginTop: 16 }}>
            <h4 className="subsection-title">Live updates since request</h4>
            <p className="muted">Newer payments or balance changes while this review waits for BM.</p>
            <DetailRowsTable
              rows={[
                { label: 'Live Outstanding', value: formatMoneyOrNA(liveFinancial.outstanding_balance) },
                { label: 'Live Limit', value: formatMoneyOrNA(liveFinancial.credit_limit) },
                { label: 'Live Remaining', value: formatMoneyOrNA(liveFinancial.remaining_credit) },
                {
                  label: 'Live Overdue',
                  value: liveFinancial.overdue_count
                    ? `${liveFinancial.overdue_count} · ${formatMoneyOrNA(liveFinancial.overdue_amount)}`
                    : 'None',
                },
              ]}
            />
          </div>
        ) : null}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Payment History</h3>
          <p className="muted">Last five records from the shared payment ledger — not manually re-entered.</p>
        </div>
        {payments.length ? (
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount Paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th>Receipt / Invoice</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment, index) => (
                  <tr key={payment.credit_id || payment.collection_id || index}>
                    <td>{formatDisplayDate(payment.payment_date || payment.date)}</td>
                    <td>{formatCurrency(payment.amount || payment.amount_paid)}</td>
                    <td>{payment.remaining_balance != null ? formatCurrency(payment.remaining_balance) : '—'}</td>
                    <td><StatusBadge status={payment.payment_status || payment.status || '—'} /></td>
                    <td>
                      {[payment.receipt_number, payment.invoice_number, payment.reference_number]
                        .filter(Boolean)
                        .filter((value, idx, arr) => arr.indexOf(value) === idx)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payment history" description="No confirmed payments were on file when this review was prepared." />
        )}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Open Invoices &amp; Overdue</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Open Invoices', value: String(openInvoices.length) },
            {
              label: 'Overdue',
              value: overdue.length
                ? `${overdue.length} · ${formatMoneyOrNA(financial.overdue_amount)}`
                : 'None detected',
            },
          ]}
        />
        {openInvoices.length ? (
          <div className="table-shell" style={{ marginTop: 12 }}>
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.slice(0, 10).map((invoice) => (
                  <tr key={invoice.invoice_number}>
                    <td>{invoice.invoice_number}</td>
                    <td>{formatCurrency(invoice.total_amount)}</td>
                    <td>{invoice.due_date ? formatDisplayDate(invoice.due_date) : '—'}</td>
                    <td><StatusBadge status={invoice.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Risk Assessment</h3>
          <p className="muted">Rule-based from account evidence — not entered by Sales.</p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Risk', value: <StatusBadge status={review.riskLevel || '—'} /> },
            { label: 'Score', value: review.riskScore != null ? String(review.riskScore) : '—' },
          ]}
        />
        {review.riskReasons?.length ? (
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {review.riskReasons.map((reason) => (
              <li key={reason} className="muted">{reason}</li>
            ))}
          </ul>
        ) : null}
        {review.suggestion?.message ? (
          <p style={{ marginTop: 12 }}><strong>Suggestion:</strong> {review.suggestion.message}</p>
        ) : null}
      </section>

      {previous.length ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Previous Credit Decisions</h3>
          </div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Reason</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Limit</th>
                </tr>
              </thead>
              <tbody>
                {previous.map((decision) => (
                  <tr key={decision.ci_id}>
                    <td>{formatDisplayDate(decision.decided_at || decision.created_at)}</td>
                    <td>{decision.reason || '—'}</td>
                    <td>{decision.risk_level || '—'}</td>
                    <td><StatusBadge status={decision.status} /></td>
                    <td>{formatMoneyOrNA(decision.approved_credit_limit || decision.requested_credit_limit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Branch Manager Decision</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Status', value: <StatusBadge status={review.displayStatus} /> },
            { label: 'Decided By', value: review.approvedBy || '—' },
            { label: 'Decided At', value: review.decidedAt ? formatDisplayDateTime(review.decidedAt) : '—' },
            { label: 'Approved Limit', value: formatMoneyOrNA(review.approvedLimit) },
            { label: 'Decision Remarks', value: review.decisionRemarks || review.rejectionReason || '—' },
          ]}
        />
      </section>
    </>
  );
}

export function SalesCreditReviewsPage({ navigate, showToast }) {
  const location = useLocation();
  const initialFilter = (() => {
    const raw = new URLSearchParams(location.search || '').get('filter') || 'All';
    const decoded = decodeURIComponent(raw).replace(/\+/g, ' ').trim();
    return CREDIT_REVIEW_FILTERS.includes(decoded) ? decoded : 'All';
  })();
  const [filter, setFilter] = useState(initialFilter);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = new URLSearchParams(location.search || '').get('filter');
    if (!raw) return;
    const decoded = decodeURIComponent(raw).replace(/\+/g, ' ').trim();
    if (CREDIT_REVIEW_FILTERS.includes(decoded)) setFilter(decoded);
  }, [location.search]);

  const reload = async () => {
    setLoading(true);
    // API stores Pending/Revision Requested; UI label is "Needs BM"
    const apiStatus = filter === 'All'
      ? undefined
      : filter === 'Needs BM'
        ? 'Pending'
        : filter;
    const res = await fetchSalesCreditInvestigations({ status: apiStatus });
    if (res.success) {
      const mapped = (res.data || []).map(mapCreditReviewRow);
      setItems(
        filter === 'Needs BM'
          ? mapped.filter((row) => row.status === 'Pending' || row.status === 'Revision Requested')
          : mapped
      );
    } else {
      showToast?.(res.message || 'Failed to load credit reviews.', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [filter]);

  const pagination = usePagination(items);
  const rows = pagination.paginatedData;

  if (loading && !items.length) return <LoadingState message="Loading credit reviews…" />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header">
          <h3>Credit Reviews</h3>
          <p className="muted">
            Status of credit checks for your customers — prepared using payment and account information, with Branch Manager decisions when needed.
          </p>
        </div>
        <div className="list-section-toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented-control">
            {CREDIT_REVIEW_FILTERS.map((option) => (
              <button
                key={option}
                className={filter === option ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {items.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Why / Trigger</th>
                    <th>Risk</th>
                    <th>Suggested / Current Limit</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((review) => (
                    <tr
                      key={review.id}
                      className="clickable-row"
                      onClick={() => navigate(`/sales/credit-investigations/${review.ciId}`)}
                    >
                      <td>
                        <div>{review.customerName}</div>
                        {review.customerCode ? <div className="muted">{review.customerCode}</div> : null}
                      </td>
                      <td>{review.reason || '—'}</td>
                      <td><StatusBadge status={review.riskLevel || '—'} /></td>
                      <td>{limitCell(review)}</td>
                      <td><StatusBadge status={review.displayStatus} /></td>
                      <td>{formatDisplayDate(review.updatedAt || review.submissionDate)}</td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View"
                          aria-label={`View credit review for ${review.customerName}`}
                          onClick={() => navigate(`/sales/credit-investigations/${review.ciId}`)}
                        >
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
        ) : (
          <EmptyState
            title="No credit reviews"
            description="No credit reviews — sales within the customer's credit limit do not require a review."
            actionLabel="Browse customers"
            onAction={() => navigate('/sales/customers')}
          />
        )}
      </section>
    </div>
  );
}

export function SalesCreditReviewDetailPage({ ciId, navigate, showToast }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchSalesCreditInvestigationById(ciId);
      if (res.success && res.data) setReview(mapCreditReviewRow(res.data));
      else {
        setReview(null);
        showToast?.(res.message || 'Credit review not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [ciId, showToast]);

  if (loading) return <LoadingState message="Loading credit review…" />;
  if (!review) {
    return (
      <EmptyState
        title="Not found"
        description="This credit review is not on your account."
        actionLabel="Back to Credit Reviews"
        onAction={() => navigate('/sales/credit-investigations')}
      />
    );
  }

  const canRerequest = review.status === 'Rejected' || review.status === 'Revision Requested';

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Credit Review · {review.customerName}</h3>
          <p className="muted">
            {review.reason || 'Credit review'} · Submitted {formatDisplayDateTime(review.submissionDate)}
          </p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Status', value: <StatusBadge status={review.displayStatus} /> },
            { label: 'Risk', value: <StatusBadge status={review.riskLevel || '—'} /> },
            { label: 'Requested Limit', value: formatMoneyOrNA(review.requestedLimit) },
            { label: 'Remarks', value: review.requestRemarks || '—' },
          ]}
        />
      </section>

      <SnapshotSections review={review} />

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/credit-investigations')}>
          Back to Credit Reviews
        </button>
        {review.customerId ? (
          <>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/sales/customer-detail/${review.customerId}?from=customers`)}
            >
              Customer Details
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/sales/credit-history?customerId=${review.customerId}`)}
            >
              View Payment History
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/sales/log-sale/${review.customerId}`)}
            >
              Log a Sale
            </button>
          </>
        ) : null}
        {canRerequest && review.customerId ? (
          <button className="button" type="button" onClick={() => setRequestOpen(true)}>
            Request Again
          </button>
        ) : null}
      </div>

      <CreditReviewRequestModal
        open={requestOpen}
        customer={{
          customer_id: review.customerId,
          first_name: review.customerName,
          customer_code: review.customerCode,
        }}
        onClose={() => setRequestOpen(false)}
        showToast={showToast}
        defaultReason={review.reason || ''}
        onSubmitted={(newId) => {
          setRequestOpen(false);
          if (newId) navigate(`/sales/credit-investigations/${newId}`);
          else navigate('/sales/credit-investigations');
        }}
      />
    </div>
  );
}

/** Replaces the old long CI form with a one-tap request page. */
export function SalesCreditReviewRequestPage({
  customerId,
  parentContext,
  navigate,
  showToast,
}) {
  const [open, setOpen] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (res.success && res.data) setCustomer(res.data);
      else setCustomer({ customer_id: Number(customerId) });
      setLoading(false);
    }
    load();
  }, [customerId]);

  if (loading) return <LoadingState message="Loading customer…" />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Request Credit Review</h3>
          <p className="muted">
            Provide a reason. The system prepares the financial case for Branch Manager.
          </p>
        </div>
        <p className="muted">
          You do not need to re-enter payment history, income, or references already on the customer record.
        </p>
        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/sales/customer-detail/${customerId}?from=${parentContext || 'customers'}`)}
          >
            Cancel
          </button>
          <button className="button" type="button" onClick={() => setOpen(true)}>
            Continue
          </button>
        </div>
      </section>
      <CreditReviewRequestModal
        open={open}
        customer={customer}
        onClose={() => {
          setOpen(false);
          navigate(`/sales/customer-detail/${customerId}?from=${parentContext || 'customers'}`);
        }}
        showToast={showToast}
        onSubmitted={(newId) => {
          if (newId) navigate(`/sales/credit-investigations/${newId}`);
          else navigate('/sales/credit-investigations');
        }}
      />
    </div>
  );
}
