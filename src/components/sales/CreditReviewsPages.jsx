import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  convertSalesCreditRecommendation,
  fetchCustomerById,
  fetchSalesCreditInvestigationById,
  fetchSalesCreditInvestigations,
  fetchSalesCreditRecommendations,
} from '../../api/salesService';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { usePagination } from '../../hooks/usePagination';
import {
  CREDIT_REVIEW_FILTERS,
  formatCreditAmount,
  mapCreditReviewRow,
} from '../../utils/creditReview';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { RowActionMenu } from '../shared/RowActionMenu';
import { ConfirmModal } from '../shared/ConfirmModal';
import { StatusBadge } from '../StatusBadge';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';

function limitCell(review) {
  const suggested = review.suggestion?.suggested_limit ?? review.snapshot?.suggestion?.suggested_limit;
  const current = review.currentLimit;
  const requested = review.requestedLimit;
  const parts = [];
  if (requested != null) parts.push(`Req ${formatCreditAmount(requested)}`);
  if (current != null && Number(current) > 0) parts.push(`Cur ${formatCreditAmount(current)}`);
  else if (suggested != null) parts.push(`Sug ${formatCreditAmount(suggested)}`);
  else if (!parts.length) parts.push(formatCreditAmount(null));
  return parts.join(' · ');
}

function activityLabel(event) {
  if (event === 'bm_decision') return 'Branch Manager decision';
  if (event === 'sales_resubmit') return 'Sales resubmit';
  return event || 'Update';
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
  const previous = snap.previous_decisions || live?.previous_decisions || [];
  const revisionHistory = review.revisionHistory || [];
  const showDecisionHistory = ['Approved', 'Rejected', 'Revision Requested'].includes(review.status);

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
            { label: 'Outstanding Balance', value: formatCreditAmount(financial.outstanding_balance, { emptyLabel: 'No records available' }) },
            { label: 'Approved Credit Limit', value: formatCreditAmount(financial.credit_limit) },
            { label: 'Remaining Credit', value: formatCreditAmount(financial.remaining_credit) },
            {
              label: 'Utilization',
              value: financial.utilization_pct != null ? `${financial.utilization_pct}%` : 'Not on file',
            },
            { label: 'Requested Limit', value: formatCreditAmount(review.requestedLimit, { emptyLabel: 'Not provided' }) },
          ]}
        />
        {liveFinancial && (review.status === 'Pending' || review.status === 'Revision Requested') ? (
          <div style={{ marginTop: 16 }}>
            <h4 className="subsection-title">Live updates since request</h4>
            <p className="muted">Newer payments or balance changes while this review waits for BM.</p>
            <DetailRowsTable
              rows={[
                { label: 'Live Outstanding', value: formatCreditAmount(liveFinancial.outstanding_balance, { emptyLabel: 'No records available' }) },
                { label: 'Live Limit', value: formatCreditAmount(liveFinancial.credit_limit) },
                { label: 'Live Remaining', value: formatCreditAmount(liveFinancial.remaining_credit) },
                {
                  label: 'Live Overdue',
                  value: liveFinancial.overdue_count
                    ? `${liveFinancial.overdue_count} · ${formatCreditAmount(liveFinancial.overdue_amount)}`
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
                ? `${overdue.length} · ${formatCreditAmount(financial.overdue_amount)}`
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
                    <td>{decision.reason || decision.request_reason || '—'}</td>
                    <td>{decision.risk_level || '—'}</td>
                    <td><StatusBadge status={decision.status} /></td>
                    <td>{formatCreditAmount(decision.approved_credit_limit ?? decision.requested_credit_limit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showDecisionHistory ? (
        <>
          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Branch Manager Decision</h3>
            </div>
            <DetailRowsTable
              rows={[
                { label: 'Status', value: <StatusBadge status={review.displayStatus} /> },
                { label: 'Decided By', value: review.approvedBy || '—' },
                { label: 'Decided At', value: review.decidedAt ? formatDisplayDateTime(review.decidedAt) : '—' },
                { label: 'Approved Limit', value: formatCreditAmount(review.approvedLimit) },
                {
                  label: review.status === 'Rejected' ? 'Rejection Reason' : 'Decision Remarks',
                  value: review.decisionRemarks || review.rejectionReason || '—',
                },
              ]}
            />
          </section>

          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Investigation Activity</h3>
              <p className="muted">Decision and resubmit trail for this credit investigation.</p>
            </div>
            {revisionHistory.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {revisionHistory.slice().reverse().map((event, index) => (
                  <li key={`${event.at}-${index}`} style={{ marginBottom: 8 }}>
                    <strong>{activityLabel(event.event)}</strong>
                    {' · '}
                    {event.previous_status || '—'}
                    {event.new_status ? ` → ${event.new_status}` : ''}
                    {' · '}
                    {event.at ? formatDisplayDateTime(event.at) : '—'}
                    {event.remarks ? ` · ${event.remarks}` : ''}
                    {event.approved_credit_limit != null
                      ? ` · Limit ${formatCreditAmount(event.approved_credit_limit)}`
                      : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No investigation activity recorded yet.</p>
            )}
          </section>
        </>
      ) : (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Branch Manager Decision</h3>
          </div>
          <DetailRowsTable
            rows={[
              { label: 'Status', value: <StatusBadge status={review.displayStatus} /> },
              { label: 'Decided By', value: review.approvedBy || '—' },
              { label: 'Decided At', value: review.decidedAt ? formatDisplayDateTime(review.decidedAt) : '—' },
              { label: 'Approved Limit', value: formatCreditAmount(review.approvedLimit) },
              { label: 'Decision Remarks', value: review.decisionRemarks || review.rejectionReason || '—' },
            ]}
          />
        </section>
      )}
    </>
  );
}

const REC_REASON_MAP = {
  'First Limit': 'First installment',
  'Limit Increase': 'Need higher limit',
  Delinquency: 'Customer over limit but wants another sale',
  'Initial CI': 'First installment',
  KYC: 'Other',
  Exposure: 'Customer over limit but wants another sale',
  'Collector Flag': 'Other',
};

function recommendationNeedsFirstCreditProfile(row) {
  if (!row) return false;
  if (['First Limit', 'Initial CI'].includes(row.recommendation_type)) return true;
  return !(Number(row.credit_limit) > 0);
}

function resolveSalesListApiStatus(filter) {
  if (filter === 'All') return undefined;
  if (filter === 'Needs BM') return 'Pending';
  if (filter === 'Needs More Info') return 'Revision Requested';
  return filter;
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
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recsPanelOpen, setRecsPanelOpen] = useState(false);
  const [requestCustomer, setRequestCustomer] = useState(null);
  const [requestReason, setRequestReason] = useState('');
  const [convertingId, setConvertingId] = useState(null);
  const [confirmConvert, setConfirmConvert] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const raw = params.get('filter');
    if (!raw) return;
    const decoded = decodeURIComponent(raw).replace(/\+/g, ' ').trim();
    if (CREDIT_REVIEW_FILTERS.includes(decoded)) setFilter(decoded);
  }, [location.search]);

  // Apply for Credit from customers list: /sales/credit-investigations?customerId=
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const rawId = params.get('customerId');
    if (!rawId) return;
    const customerId = Number(rawId);
    if (!Number.isFinite(customerId)) return;

    let cancelled = false;
    (async () => {
      const customerRes = await fetchCustomerById(customerId);
      if (cancelled) return;
      if (!customerRes.success || !customerRes.data) {
        showToast?.(customerRes.message || 'Customer not found for credit application.', 'error');
        return;
      }
      const limit = Number(
        customerRes.data.creditInfo?.credit_limit
        ?? customerRes.data.credit_info?.credit_limit
        ?? customerRes.data.credit_limit
        ?? 0
      );
      setRequestReason(limit > 0 ? 'Need higher limit' : 'First installment');
      setRequestCustomer(customerRes.data);
      params.delete('customerId');
      const next = params.toString();
      navigate(
        next ? `/sales/credit-investigations?${next}` : '/sales/credit-investigations',
        { replace: true }
      );
    })();

    return () => { cancelled = true; };
  }, [location.search, navigate, showToast]);

  const reload = async () => {
    setLoading(true);
    const apiStatus = resolveSalesListApiStatus(filter);
    const res = await fetchSalesCreditInvestigations({ status: apiStatus });
    if (res.success) {
      setItems((res.data || []).map(mapCreditReviewRow));
    } else {
      showToast?.(res.message || 'Failed to load credit reviews.', 'error');
    }
    setLoading(false);
  };

  const reloadRecommendations = async () => {
    setRecLoading(true);
    const res = await fetchSalesCreditRecommendations({ status: 'New', limit: 50 });
    if (res.success) setRecommendations(res.data || []);
    else setRecommendations([]);
    setRecLoading(false);
  };

  useEffect(() => {
    reload();
  }, [filter]);

  useEffect(() => {
    // Prefetch count for the toggle badge without forcing the panel open.
    reloadRecommendations();
  }, []);

  const pagination = usePagination(items);
  const rows = pagination.paginatedData;

  async function openRequestFromRecommendation(row) {
    setConvertingId(row.recommendation_id);
    const customerRes = await fetchCustomerById(row.customer_id);
    setConvertingId(null);
    if (!customerRes.success || !customerRes.data) {
      showToast?.(customerRes.message || 'Customer not found.', 'error');
      return;
    }
    setRequestReason(REC_REASON_MAP[row.recommendation_type] || 'Other');
    setRequestCustomer({
      ...customerRes.data,
      _recommendationId: row.recommendation_id,
      _recommendationTrigger: row.trigger_reason,
    });
  }

  async function convertRecommendationDirect(row) {
    if (recommendationNeedsFirstCreditProfile(row)) {
      await openRequestFromRecommendation(row);
      return;
    }
    setConfirmConvert(row);
  }

  async function confirmConvertRecommendation() {
    const row = confirmConvert;
    if (!row) return;
    setConvertingId(row.recommendation_id);
    const res = await convertSalesCreditRecommendation(row.recommendation_id, {
      request_reason: REC_REASON_MAP[row.recommendation_type] || 'Other',
      request_remarks: row.trigger_reason || undefined,
    });
    setConvertingId(null);
    setConfirmConvert(null);
    if (!res.success) {
      showToast?.(res.message || 'Conversion failed.', 'error');
      if (res.data?.ci_id) navigate(`/sales/credit-investigations/${res.data.ci_id}`);
      return;
    }
    showToast?.(res.message || 'Credit review submitted.', 'success');
    navigate(`/sales/credit-investigations/${res.data?.ci_id}`);
  }

  if (loading && !items.length) return <LoadingState message="Loading credit reviews…" />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Credit Reviews</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Status of credit checks for your customers — prepared using payment and account information, with Branch Manager decisions when needed.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={recLoading}
            onClick={async () => {
              const next = !recsPanelOpen;
              setRecsPanelOpen(next);
              if (next) await reloadRecommendations();
            }}
            title="Show or hide credit recommendations for your customers"
          >
            {recLoading && !recsPanelOpen
              ? 'Loading recommendations…'
              : recsPanelOpen
                ? 'Hide recommendations'
                : `My credit recommendations${recommendations.length ? ` (${recommendations.length})` : ''}`}
          </button>
        </div>

        {recsPanelOpen ? (
          <div className="panel" style={{ margin: '12px 0 0', padding: 12 }}>
            <div className="flex flex-wrap justify-between gap-2 items-center" style={{ marginBottom: 8 }}>
              <strong>Recommended for Credit Review</strong>
              <button
                className="button ghost"
                type="button"
                style={{ padding: '2px 8px' }}
                onClick={reloadRecommendations}
                disabled={recLoading}
              >
                Refresh
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              System and collector flags for your assigned customers. These are not formal applications until you submit a credit review.
            </p>
            {recLoading ? (
              <LoadingState message="Loading recommendations…" />
            ) : recommendations.length ? (
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Recommendation</th>
                      <th>Trigger</th>
                      <th>Credit Limit</th>
                      <th>Outstanding</th>
                      <th>Suggested Action</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendations.map((row) => (
                      <tr key={row.recommendation_id}>
                        <td>
                          <strong>{row.customer_name}</strong>
                          {row.customer_code ? <div className="muted" style={{ fontSize: '0.78rem' }}>{row.customer_code}</div> : null}
                        </td>
                        <td>{row.recommendation_type}</td>
                        <td>{row.trigger_reason || '—'}</td>
                        <td>{formatCreditAmount(row.credit_limit)}</td>
                        <td>{formatCreditAmount(row.outstanding_balance, { emptyLabel: 'No records available' })}</td>
                        <td>{row.suggested_action || '—'}</td>
                        <td><StatusBadge status={row.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for ${row.customer_name}`}
                            items={[
                              {
                                key: 'prefill',
                                label: 'View / Prefill',
                                disabled: convertingId === row.recommendation_id,
                                onSelect: () => openRequestFromRecommendation(row),
                              },
                              {
                                key: 'request',
                                label: 'Request Credit Review',
                                disabled: convertingId === row.recommendation_id,
                                onSelect: () => convertRecommendationDirect(row),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No recommendations"
                description="When utilization, delinquency, KYC, or collector flags apply to your customers, they appear here."
              />
            )}
          </div>
        ) : null}

        <div className="list-section-toolbar" style={{ marginTop: 16, marginBottom: 12 }}>
          <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
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
                        <RowActionMenu
                          label={`Actions for credit review of ${review.customerName}`}
                          items={[
                            {
                              key: 'view',
                              label: 'View',
                              onSelect: () => navigate(`/sales/credit-investigations/${review.ciId}`),
                            },
                            review.status === 'Revision Requested' ? {
                              key: 'revise',
                              label: 'Revise',
                              onSelect: () => navigate(`/sales/credit-investigations/${review.ciId}?revise=1`),
                            } : null,
                          ]}
                        />
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

      <CreditReviewRequestModal
        customer={requestCustomer}
        open={Boolean(requestCustomer)}
        isFirstCredit={
          !requestCustomer?.creditInfo
          || Number(requestCustomer?.creditInfo?.credit_limit || 0) <= 0
        }
        defaultReason={requestReason}
        recommendationId={requestCustomer?._recommendationId || null}
        showToast={showToast}
        onClose={() => setRequestCustomer(null)}
        onSubmitted={(ciId) => {
          setRequestCustomer(null);
          reloadRecommendations();
          reload();
          if (ciId) navigate(`/sales/credit-investigations/${ciId}`);
        }}
      />

      <ConfirmModal
        open={Boolean(confirmConvert)}
        title="Submit credit review?"
        description={confirmConvert
          ? `Submit a formal credit review for ${confirmConvert.customer_name}?`
          : ''}
        details={confirmConvert ? [
          { label: 'Customer', value: confirmConvert.customer_name },
          { label: 'Recommendation', value: confirmConvert.recommendation_type },
          { label: 'Trigger', value: confirmConvert.trigger_reason || '—', fullWidth: true },
        ] : []}
        confirmLabel="Submit review"
        cancelLabel="Cancel"
        busy={Boolean(convertingId)}
        onCancel={() => { if (!convertingId) setConfirmConvert(null); }}
        onConfirm={confirmConvertRecommendation}
      />
    </div>
  );
}

export function SalesCreditReviewDetailPage({ ciId, navigate, showToast }) {
  const location = useLocation();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [modalCustomer, setModalCustomer] = useState(null);
  const [openingRequest, setOpeningRequest] = useState(false);

  async function loadReview() {
    const res = await fetchSalesCreditInvestigationById(ciId);
    if (res.success && res.data) {
      const mapped = mapCreditReviewRow(res.data);
      setReview({
        ...mapped,
        revisionHistory: res.data.revision_history || [],
        live: res.data.live || mapped.live || null,
      });
      return mapped;
    }
    setReview(null);
    showToast?.(res.message || 'Credit review not found.', 'error');
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      await loadReview();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [ciId, showToast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    if (params.get('revise') !== '1') return;
    if (!review || review.status !== 'Revision Requested') return;
    openRequestModal();
    params.delete('revise');
    const next = params.toString();
    navigate(
      next ? `/sales/credit-investigations/${ciId}?${next}` : `/sales/credit-investigations/${ciId}`,
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, review?.status, ciId]);

  async function openRequestModal() {
    if (!review?.customerId) return;
    setOpeningRequest(true);
    const customerRes = await fetchCustomerById(review.customerId);
    setOpeningRequest(false);
    if (!customerRes.success || !customerRes.data) {
      showToast?.(customerRes.message || 'Could not load customer for revision.', 'error');
      return;
    }
    setModalCustomer(customerRes.data);
    setRequestOpen(true);
  }

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
  const isRevision = review.status === 'Revision Requested';
  const firstCredit = !(Number(review.currentLimit) > 0)
    && !(Number(modalCustomer?.creditInfo?.credit_limit || modalCustomer?.credit_limit) > 0);

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
            { label: 'Requested Limit', value: formatCreditAmount(review.requestedLimit, { emptyLabel: 'Not provided' }) },
            { label: 'Remarks', value: review.requestRemarks || '—' },
            ...(review.status === 'Revision Requested' ? [{
              label: 'BM Revision Instructions',
              value: review.decisionRemarks || review.rejectionReason || '—',
            }] : []),
            ...(review.status === 'Rejected' ? [{
              label: 'Rejection Reason',
              value: review.rejectionReason || review.decisionRemarks || '—',
            }] : []),
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
          <button
            className="button"
            type="button"
            disabled={openingRequest}
            onClick={openRequestModal}
          >
            {openingRequest
              ? 'Loading…'
              : (isRevision ? 'Revise and Resubmit' : 'Reapply for Credit')}
          </button>
        ) : null}
      </div>

      <CreditReviewRequestModal
        open={requestOpen}
        customer={modalCustomer}
        isFirstCredit={firstCredit}
        onClose={() => {
          setRequestOpen(false);
          setModalCustomer(null);
        }}
        showToast={showToast}
        defaultReason={review.reason || ''}
        defaultRequestedLimit={review.requestedLimit != null ? review.requestedLimit : ''}
        defaultRemarks={review.requestRemarks || ''}
        resubmitCiId={isRevision ? review.ciId : null}
        onSubmitted={async (newId) => {
          setRequestOpen(false);
          setModalCustomer(null);
          if (newId) {
            navigate(`/sales/credit-investigations/${newId}`);
            if (String(newId) === String(ciId)) await loadReview();
          } else {
            navigate('/sales/credit-investigations');
          }
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
          You do not need to re-enter payment history already on the customer record.
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
        isFirstCredit={
          !customer?.creditInfo
          || Number(customer?.creditInfo?.credit_limit || 0) <= 0
        }
        defaultReason={
          !customer?.creditInfo || Number(customer?.creditInfo?.credit_limit || 0) <= 0
            ? 'First installment'
            : 'Need higher limit'
        }
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
