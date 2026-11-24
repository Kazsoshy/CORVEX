import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchCreditInvestigations,
  fetchCreditInvestigationById,
  patchCreditInvestigation,
} from '../../api/approvalsService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { InfoHint } from '../shared/InfoHint';
import { ConfirmModal } from '../shared/ConfirmModal';
import { StatusBadge } from '../StatusBadge';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import {
  agingDaysManila,
  BM_CI_APPLICATION_FILTERS,
  BM_CI_HISTORY_FILTERS,
  formatCreditAmount,
  isFirstInstallmentApplication,
  mapCreditReviewRow,
  missingInfoLabel,
  resolveCurrentCreditLimit,
  sanitizeBmSuggestionMessage,
  waitingLabelManila,
} from '../../utils/creditReview.js';

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'financials', label: 'Financials' },
  { key: 'risk', label: 'Risk & Eligibility' },
  { key: 'customer', label: 'Customer & Documents' },
  { key: 'history', label: 'History' },
];

function textOrMissing(value, kind = 'not_provided') {
  if (value == null || value === '' || value === '—') return missingInfoLabel(kind);
  return String(value);
}

function truncateText(value, max = 80) {
  if (value == null || value === '') return missingInfoLabel('not_provided');
  const text = String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildReviewConsiderations(review, { snapFin, liveFin, evCustomer, evEmployment }) {
  const findings = [];
  const kyc = evCustomer?.id_verification_status || snapFin?.id_verification_status;
  if (kyc && String(kyc).toLowerCase() !== 'verified') {
    findings.push({ key: 'kyc', text: `Identity verification is incomplete (${kyc}).` });
  }
  const payments = review.paymentHistory || snapFin?.payment_history || [];
  if (!payments.length) {
    findings.push({ key: 'payments', text: 'No payment history is available for this customer.' });
  }
  if (String(review.riskLevel || '') === 'High') {
    findings.push({ key: 'risk', text: 'Risk classification is High — review carefully before approving.' });
  }
  if (!(Number(review.requestedLimit) > 0)) {
    findings.push({ key: 'requested', text: 'No requested credit limit was provided by Sales.' });
  }

  const income = evEmployment?.monthly_income ?? snapFin?.monthly_income ?? liveFin?.monthly_income;
  const missingIncome = !(Number(income) > 0) && !(Number(review.currentLimit) > 0);
  const suggestionMissing = review.suggestion?.suggested_limit == null;
  const rawSuggestion = sanitizeBmSuggestionMessage(review.suggestion?.message);
  const suggestionIsIncomeGap = /income|revenue|evidence is incomplete|supporting evidence/i.test(rawSuggestion);

  if (missingIncome || (suggestionMissing && suggestionIsIncomeGap)) {
    findings.push({
      key: 'income-suggestion',
      text: 'No reliable system limit suggestion — income or revenue evidence is incomplete. Set the approved limit after review.',
    });
  } else if (suggestionMissing) {
    findings.push({
      key: 'suggestion',
      text: rawSuggestion || 'No system credit limit suggestion is available for this application.',
    });
  }

  const overdue = Number(liveFin?.overdue_count ?? snapFin?.overdue_count ?? 0);
  if (overdue > 0) {
    findings.push({
      key: 'overdue',
      text: `${overdue} overdue invoice(s) on file — confirm collection standing before increasing credit.`,
    });
  }
  return findings;
}

function resolveInitialQueueTab(searchParams) {
  const tab = (searchParams.get('tab') || '').toLowerCase();
  if (tab === 'history' || tab === 'investigation-history') return 'history';
  const raw = searchParams.get('filter') || searchParams.get('status') || '';
  const decoded = decodeURIComponent(raw).replace(/\+/g, ' ').trim();
  if (decoded === 'Completed' || decoded === 'Approved' || decoded === 'Rejected') return 'history';
  return 'applications';
}

function resolveInitialStatusFilter(searchParams, mainTab) {
  const raw = searchParams.get('filter') || searchParams.get('status') || '';
  const decoded = decodeURIComponent(raw).replace(/\+/g, ' ').trim();
  if (mainTab === 'history') {
    if (decoded === 'Approved' || decoded === 'Rejected' || decoded === 'Completed') return decoded;
    return 'Completed';
  }
  if (decoded === 'Needs BM' || decoded === 'Needs Decision' || !decoded) return 'Needs Decision';
  if (decoded === 'Needs More Info') return 'Revision Requested';
  if (BM_CI_APPLICATION_FILTERS.some((f) => f.value === decoded)) return decoded;
  return 'Needs Decision';
}

export function CreditInvestigationQueuePage({ navigate, opsBase, showToast }) {
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);

  const urlTab = resolveInitialQueueTab(searchParams);
  const urlCustomerId = (() => {
    const raw = searchParams.get('customerId');
    return raw && Number.isFinite(Number(raw)) ? String(raw) : '';
  })();
  const [mainTab, setMainTab] = useState(urlTab);
  const [statusFilter, setStatusFilter] = useState(() => resolveInitialStatusFilter(searchParams, urlTab));
  const [search, setSearch] = useState('');
  const [customerIdFilter, setCustomerIdFilter] = useState(urlCustomerId);
  const [riskFilter, setRiskFilter] = useState('All');
  const [sort, setSort] = useState(urlTab === 'history' ? 'newest' : 'oldest');
  const [items, setItems] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  // Keep queue aligned when deep-links change (?tab=history, ?status=, ?customerId=).
  const deepLinkKey = `${urlTab}|${searchParams.get('filter') || searchParams.get('status') || ''}|${urlCustomerId}`;
  const [lastDeepLink, setLastDeepLink] = useState(deepLinkKey);
  if (deepLinkKey !== lastDeepLink) {
    setLastDeepLink(deepLinkKey);
    setMainTab(urlTab);
    setStatusFilter(resolveInitialStatusFilter(searchParams, urlTab));
    setCustomerIdFilter(urlCustomerId);
    setSort(urlTab === 'history' ? 'newest' : 'oldest');
  }

  function switchTab(tab) {
    setMainTab(tab);
    if (tab === 'applications') {
      setStatusFilter('Needs Decision');
      setSort('oldest');
    } else {
      setStatusFilter('Completed');
      setSort('newest');
    }
  }

  const filterKey = `${mainTab}|${statusFilter}|${search}|${riskFilter}|${sort}|${customerIdFilter}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterKey,
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const res = await fetchCreditInvestigations({
        status: statusFilter,
        search: search.trim() || undefined,
        risk_level: riskFilter !== 'All' ? riskFilter : undefined,
        customer_id: customerIdFilter || undefined,
        sort,
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
      });
      if (!active) return;
      if (res.success) {
        setItems((res.data || []).map(mapCreditReviewRow));
        setTotalRecords(Number(res.pagination?.total) || 0);
      } else {
        setItems([]);
        setTotalRecords(0);
        showToast?.(res.message || 'Failed to load credit investigations.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [mainTab, statusFilter, search, riskFilter, sort, pagination.currentPage, customerIdFilter, showToast]);

  const statusOptions = mainTab === 'history' ? BM_CI_HISTORY_FILTERS : BM_CI_APPLICATION_FILTERS;
  const isHistory = mainTab === 'history';

  return (
    <div className="page">
      <section className="panel content-panel mb-4">
        <div className="list-section-header">
          <div>
            <h3>Credit Investigations</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Review credit applications and prior Branch Manager decisions for this branch.
            </p>
          </div>
        </div>
        <div className="segmented-control" style={{ marginTop: 12 }}>
          <button
            type="button"
            className={mainTab === 'applications' ? 'segment active' : 'segment'}
            onClick={() => switchTab('applications')}
          >
            Applications
          </button>
          <button
            type="button"
            className={mainTab === 'history' ? 'segment active' : 'segment'}
            onClick={() => switchTab('history')}
          >
            Investigation History
          </button>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="list-section-controls" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div className="ci-search-field">
            <span className="ci-search-field__icon" aria-hidden="true">⌕</span>
            <input
              className="filter-input search"
              type="search"
              placeholder="Search customer, code, or CI ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search credit investigations"
            />
          </div>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusOptions.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select className="filter-select" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
            {['All', 'High', 'Medium', 'Low'].map((s) => (
              <option key={s} value={s}>{s === 'All' ? 'All Risk Levels' : `${s} Risk`}</option>
            ))}
          </select>
          <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="oldest">Oldest First</option>
            <option value="newest">Newest Submitted</option>
            <option value="risk">Highest Risk First</option>
            <option value="updated">Recently Updated</option>
          </select>
          {customerIdFilter ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                setCustomerIdFilter('');
                navigate(`${opsBase}/ci-approvals`, { replace: true });
              }}
            >
              Clear customer filter
            </button>
          ) : null}
        </div>

        {loading && !items.length ? (
          <LoadingState message={isHistory ? 'Loading investigation history…' : 'Loading applications…'} />
        ) : items.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table ci-queue-table">
                <thead>
                  {isHistory ? (
                    <tr>
                      <th>Customer / CI</th>
                      <th>Reason</th>
                      <th>Requested</th>
                      <th>Approved Limit</th>
                      <th>Final Decision</th>
                      <th>Remarks</th>
                      <th>BM</th>
                      <th>Decided At</th>
                      <th>Open</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Customer / CI</th>
                      <th>Reason</th>
                      <th>Requested</th>
                      <th>Current Limit</th>
                      <th>Outstanding</th>
                      <th>Risk</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Review</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {items.map((row) => {
                    const aging = agingDaysManila(row.submissionDate);
                    return (
                      <tr
                        key={row.ciId}
                        className="clickable-row ci-queue-row"
                        onClick={() => navigate(`${opsBase}/ci-approvals/${row.ciId}`)}
                      >
                        <td>
                          <strong>{row.customerName}</strong>
                          <div className="muted ci-id-cell" style={{ fontSize: '0.78rem' }}>
                            CI #{row.ciId}
                            {row.customerCode ? ` · ${row.customerCode}` : ''}
                          </div>
                        </td>
                        <td>{row.reason || missingInfoLabel('not_provided')}</td>
                        <td>{formatCreditAmount(row.requestedLimit, { emptyLabel: missingInfoLabel('not_provided') })}</td>
                        {isHistory ? (
                          <>
                            <td>{formatCreditAmount(row.approvedLimit)}</td>
                            <td><StatusBadge status={row.displayStatus} /></td>
                            <td style={{ maxWidth: 220 }}>
                              {truncateText(row.decisionRemarks || row.rejectionReason, 72)}
                            </td>
                            <td>{textOrMissing(row.approvedBy, 'not_on_file')}</td>
                            <td>
                              {row.decidedAt
                                ? formatDisplayDateTime(row.decidedAt)
                                : missingInfoLabel('not_on_file')}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                className="button secondary"
                                type="button"
                                onClick={() => navigate(`${opsBase}/ci-approvals/${row.ciId}`)}
                              >
                                Open
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{formatCreditAmount(row.currentLimit)}</td>
                            <td>{formatCreditAmount(row.outstandingBalance, { emptyLabel: missingInfoLabel('no_records') })}</td>
                            <td>
                              <StatusBadge status={row.riskLevel || '—'} />
                              {row.riskLevel ? (
                                <span className="sr-only">{row.riskLevel} risk</span>
                              ) : null}
                            </td>
                            <td>
                              {formatDisplayDate(row.submissionDate)}
                              <div className="muted" style={{ fontSize: '0.75rem' }}>
                                {waitingLabelManila(row.submissionDate) || `${aging}d open`}
                              </div>
                            </td>
                            <td><StatusBadge status={row.displayStatus} /></td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                className="button"
                                type="button"
                                onClick={() => navigate(`${opsBase}/ci-approvals/${row.ciId}`)}
                              >
                                Review
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title={isHistory ? 'No completed investigations' : 'No applications in this filter'}
            description={
              isHistory
                ? 'Approved and rejected credit investigations will appear here.'
                : 'Formal credit applications from Sales appear here after submission.'
            }
          />
        )}
      </section>
    </div>
  );
}

function remarksCopyForHint(hint) {
  if (hint === 'Revision Requested') {
    return {
      label: 'Revision instructions',
      placeholder: 'Tell Sales what to correct or attach before resubmitting.',
    };
  }
  if (hint === 'Rejected') {
    return {
      label: 'Rejection reason',
      placeholder: 'Required — explain why this application is declined.',
    };
  }
  if (hint === 'Approved') {
    return {
      label: 'Approval remarks (optional)',
      placeholder: 'Optional notes for the decision record.',
    };
  }
  return {
    label: 'Decision remarks',
    placeholder: 'Required for Request Revision and Reject.',
  };
}

function DecisionPanel({
  canDecide,
  awaitingSalesRevision,
  review,
  allowRevision,
  approvedLimit,
  setApprovedLimit,
  remarks,
  setRemarks,
  deciding,
  decide,
  decisionHint,
  setDecisionHint,
  stickyClass,
}) {
  if (awaitingSalesRevision) {
    return (
      <section className={`panel content-panel ${stickyClass || ''}`.trim()}>
        <div className="panel-section-header">
          <h3>Awaiting Sales Revision</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Revision was requested. Decision buttons reopen after Sales updates and resubmits this investigation.
          </p>
        </div>
        <DetailRowsTable
          dense
          rows={[
            { label: 'Status', value: <StatusBadge status={review.displayStatus || review.status} /> },
            {
              label: 'Revision Instructions',
              value: textOrMissing(review.decisionRemarks || review.rejectionReason, 'not_provided'),
            },
            {
              label: 'Requested By',
              value: textOrMissing(review.approvedBy, 'not_on_file'),
            },
            {
              label: 'Requested At',
              value: review.decidedAt
                ? formatDisplayDateTime(review.decidedAt)
                : missingInfoLabel('not_on_file'),
            },
          ]}
        />
      </section>
    );
  }

  if (!canDecide) {
    return (
      <section className={`panel content-panel ${stickyClass || ''}`.trim()}>
        <div className="panel-section-header"><h3>Decision Record</h3></div>
        <DetailRowsTable
          dense
          rows={[
            { label: 'Status', value: <StatusBadge status={review.status} /> },
            { label: 'Approved Limit', value: formatCreditAmount(review.approvedLimit) },
            { label: 'Decided By', value: textOrMissing(review.approvedBy, 'not_on_file') },
            { label: 'Decided At', value: review.decidedAt ? formatDisplayDateTime(review.decidedAt) : missingInfoLabel('not_on_file') },
            { label: 'Remarks', value: textOrMissing(review.decisionRemarks || review.rejectionReason, 'not_provided') },
          ]}
        />
      </section>
    );
  }

  const remarksCopy = remarksCopyForHint(decisionHint);

  return (
    <section className={`panel content-panel ci-decision-panel ${stickyClass || ''}`.trim()}>
      <div className="panel-section-header">
        <h3>Decision</h3>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {allowRevision
            ? 'Enter the authorized limit yourself. Suggested and requested amounts are guidance only.'
            : 'Limit increase — approve or reject. Request Revision is only available on first-installment applications.'}
        </p>
      </div>
      <div className="form-group">
        <label htmlFor="ci-approved-limit">Approved Credit Limit (₱)</label>
        <input
          id="ci-approved-limit"
          type="number"
          min="0"
          step="0.01"
          value={approvedLimit}
          onChange={(e) => setApprovedLimit(e.target.value)}
          onFocus={() => setDecisionHint?.('Approved')}
          placeholder="Enter authorized limit"
        />
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
          Requested: {formatCreditAmount(review.requestedLimit, { emptyLabel: 'not provided' })}
          {' · '}
          Suggested: {formatCreditAmount(review.suggestion?.suggested_limit, { emptyLabel: 'none' })}
        </p>
      </div>
      <div className="form-group">
        <label htmlFor="ci-remarks">{remarksCopy.label}</label>
        <textarea
          id="ci-remarks"
          rows={3}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder={
            allowRevision
              ? remarksCopy.placeholder
              : (decisionHint === 'Rejected'
                ? remarksCopy.placeholder
                : 'Optional notes for approval, or required rejection reason.')
          }
        />
      </div>
      <div className="ci-decision-actions" style={{ marginTop: 12 }}>
        <button
          className="button ci-decision-btn"
          type="button"
          disabled={deciding}
          onClick={() => { setDecisionHint?.('Approved'); decide('Approved'); }}
        >
          Approve Application
        </button>
        {allowRevision ? (
          <button
            className="button secondary ci-decision-btn"
            type="button"
            disabled={deciding}
            onClick={() => { setDecisionHint?.('Revision Requested'); decide('Revision Requested'); }}
          >
            Request Revision
          </button>
        ) : null}
        <button
          className="button ghost ci-decision-btn"
          type="button"
          disabled={deciding}
          onClick={() => { setDecisionHint?.('Rejected'); decide('Rejected'); }}
        >
          Reject Application
        </button>
      </div>
    </section>
  );
}

function LabelWithHint({ label, hint }) {
  return (
    <span className="ci-label-with-hint">
      {label}
      {hint}
    </span>
  );
}

export function CreditInvestigationDetailPage({
  ciId,
  navigate,
  opsBase,
  showToast,
}) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [approvedLimit, setApprovedLimit] = useState('');
  const [remarks, setRemarks] = useState('');
  const [decisionHint, setDecisionHint] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [pendingDecision, setPendingDecision] = useState(null);

  async function reload() {
    const res = await fetchCreditInvestigationById(ciId);
    if (res.success && res.data) {
      const mapped = mapCreditReviewRow(res.data);
      setReview({
        ...mapped,
        raw: res.data,
        assignedSalesAgent: res.data.assigned_sales_agent_name || null,
        accountManager: res.data.account_manager_name || null,
        contactPhone: res.data.contact_phone || null,
        liveOutstanding: res.data.outstanding_balance,
        liveLimit: res.data.live_credit_limit != null ? Number(res.data.live_credit_limit) : null,
        revisionHistory: res.data.revision_history || [],
      });
      // Do not copy requested/suggested into the authorized limit — BM must enter it.
      setApprovedLimit('');
    } else {
      setReview(null);
      showToast?.(res.message || 'Credit investigation not found.', 'error');
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [ciId]);

  function requestDecide(status) {
    if (status === 'Approved' && !(Number(approvedLimit) > 0)) {
      showToast?.('Enter the authorized credit limit before approving.', 'error');
      return;
    }
    if ((status === 'Rejected' || status === 'Revision Requested') && !remarks.trim()) {
      showToast?.(
        status === 'Rejected'
          ? 'A rejection reason is required.'
          : 'Revision instructions are required.',
        'error'
      );
      return;
    }
    setPendingDecision(status);
  }

  async function confirmPendingDecision() {
    const status = pendingDecision;
    if (!status) return;

    setDeciding(true);
    const res = await patchCreditInvestigation(ciId, {
      status,
      approved_credit_limit: status === 'Approved' ? Number(approvedLimit) : undefined,
      rejection_reason: status === 'Rejected' ? remarks.trim() : undefined,
      decision_remarks: remarks.trim() || undefined,
    });
    setDeciding(false);
    if (!res.success) {
      showToast?.(res.message || 'Decision failed.', 'error');
      return;
    }
    setPendingDecision(null);
    showToast?.(res.message || `Marked ${status}.`, 'success');
    await reload();
  }

  function decisionModalCopy(status) {
    if (status === 'Approved') {
      return {
        title: 'Approve credit investigation?',
        description: 'This will authorize the credit limit below and close the investigation as Approved.',
        confirmLabel: 'Approve Application',
        confirmTone: 'primary',
      };
    }
    if (status === 'Revision Requested') {
      return {
        title: 'Request revision?',
        description: 'Sales will be asked to update this application using your revision instructions.',
        confirmLabel: 'Request Revision',
        confirmTone: 'secondary',
      };
    }
    return {
      title: 'Reject credit investigation?',
      description: 'This will decline the application and notify Sales with your rejection reason.',
      confirmLabel: 'Reject Application',
      confirmTone: 'danger',
    };
  }

  if (loading) return <LoadingState variant="detail" message="Loading credit investigation…" />;
  if (!review) {
    return (
      <EmptyState
        title="Credit investigation not found"
        description="It may belong to another branch or no longer exist."
        actionLabel="Back to Queue"
        onAction={() => navigate(`${opsBase}/ci-approvals`)}
      />
    );
  }

  const snap = review.snapshot || {};
  const snapFin = snap.financial || {};
  const live = review.raw?.live || null;
  const liveFin = live?.financial || {};
  const awaitingSalesRevision = review.status === 'Revision Requested';
  const canDecide = review.status === 'Pending';
  const openInvoices = liveFin.open_invoices || snapFin.open_invoices || [];
  const previousDecisions = live?.previous_decisions || snap.previous_decisions || [];
  const revisionHistory = review.revisionHistory || [];
  const payments = (liveFin.payment_history || review.paymentHistory || snapFin.payment_history || []).slice(0, 8);

  const evCustomer = { ...(live?.customer || {}), ...(snap?.customer || {}) };
  const evProfile = (snap?.customer?.registration_profile && Object.keys(snap.customer.registration_profile).length
    ? snap.customer.registration_profile
    : live?.customer?.registration_profile) || {};
  const evEmployment = evProfile.employment || evCustomer.employment || live?.customer?.employment || {};
  const evClassification = evCustomer.classification || evProfile.classification || null;
  const addressParts = [
    evCustomer.address_street || evProfile.address_street,
    evCustomer.address_barangay || evProfile.address_barangay,
    evCustomer.address_city || evProfile.address_city,
    evCustomer.address_province || evProfile.address_province,
    evCustomer.address_zip || evProfile.address_zip,
  ].filter((part) => part && String(part).trim());
  const evAddress = addressParts.length ? addressParts.join(', ') : (evCustomer.address || evProfile.address || null);
  const employer = evEmployment.employer_or_occupation || evEmployment.employer_name || null;
  const hasDoc = Boolean(evProfile.business_document || evCustomer.has_business_document);
  const showBusinessBlock = Boolean(
    evProfile.business_type || evProfile.store_type
    || evProfile.years_of_operation != null || evProfile.business_document
    || evCustomer.customer_type === 'Business'
    || evCustomer.business_name,
  );

  const displayCurrentLimit = resolveCurrentCreditLimit({
    snapshotLimit: review.snapshotCreditLimit ?? review.currentLimit,
    liveLimit: liveFin.credit_limit ?? review.liveLimit ?? review.liveCreditLimit,
  });

  const allowRevision = isFirstInstallmentApplication({
    reason: review.reason,
    currentLimit: displayCurrentLimit,
    liveCreditLimit: liveFin.credit_limit ?? review.liveLimit ?? review.liveCreditLimit,
    snapshotCreditLimit: review.snapshotCreditLimit,
  });

  const findings = buildReviewConsiderations(review, { snapFin, liveFin, evCustomer, evEmployment });
  const waiting = waitingLabelManila(review.submissionDate);

  const civilStatus = evCustomer.civil_status || evProfile.civil_status || null;
  const maidenName = evCustomer.mothers_maiden_name || evProfile.mothers_maiden_name || null;
  const altF = evCustomer.contact_person_fname || evProfile.contact_person_fname || null;
  const altM = evCustomer.contact_person_mname || evProfile.contact_person_mname || null;
  const altL = evCustomer.contact_person_lname || evProfile.contact_person_lname || null;
  const altPhone = evCustomer.contact_person_phone || evProfile.contact_person_phone || null;
  const altRel = evCustomer.contact_person_relationship || evProfile.contact_person_relationship || null;
  const altName = [altF, altM, altL].filter(Boolean).join(' ') || null;
  const idType = evCustomer.id_type || evProfile.id_type || null;
  const idNumber = evCustomer.id_number || evProfile.id_number || null;
  const idPhoto = evCustomer.id_photo || evProfile.id_photo || null;

  const riskReasons = review.riskReasons || [];
  const suggestionMsg = sanitizeBmSuggestionMessage(review.suggestion?.message);

  const decisionProps = {
    canDecide,
    awaitingSalesRevision,
    review,
    allowRevision,
    approvedLimit,
    setApprovedLimit,
    remarks,
    setRemarks,
    deciding: deciding || Boolean(pendingDecision),
    decide: requestDecide,
    decisionHint,
    setDecisionHint,
  };

  const modalCopy = pendingDecision ? decisionModalCopy(pendingDecision) : null;
  const modalDetails = pendingDecision ? [
    { label: 'Customer', value: review.customerName },
    { label: 'CI', value: `#${review.ciId}${review.customerCode ? ` · ${review.customerCode}` : ''}` },
    { label: 'Decision', value: pendingDecision === 'Revision Requested' ? 'Request Revision' : pendingDecision },
    ...(pendingDecision === 'Approved'
      ? [{ label: 'Approved Limit', value: formatCreditAmount(Number(approvedLimit)) }]
      : []),
    ...(remarks.trim()
      ? [{
        label: pendingDecision === 'Rejected'
          ? 'Rejection Reason'
          : pendingDecision === 'Revision Requested'
            ? 'Revision Instructions'
            : 'Remarks',
        value: remarks.trim(),
        fullWidth: true,
      }]
      : []),
  ] : [];

  return (
    <div className="page ci-case-page">
      <section className="panel content-panel">
        <div className="panel-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <button
              className="button ghost"
              type="button"
              style={{ paddingLeft: 0, marginBottom: 4 }}
              onClick={() => navigate(`${opsBase}/ci-approvals`)}
            >
              ← Back to queue
            </button>
            <h3 className="ci-case-title" style={{ margin: 0 }}>{review.customerName}</h3>
            <p className="ci-case-ref" style={{ marginTop: 6, marginBottom: 0 }}>
              <strong>CI #{review.ciId}</strong>
              {review.customerCode ? ` · ${review.customerCode}` : ''}
            </p>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {review.reason || missingInfoLabel('not_provided')}
              {' · '}
              Submitted {formatDisplayDateTime(review.submissionDate)}
              {waiting ? ` · ${waiting}` : ''}
            </p>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {review.raw?.branch_name || missingInfoLabel('not_on_file')}
              {' · Sales: '}
              {textOrMissing(review.assignedSalesAgent || review.submittedBy, 'not_on_file')}
            </p>
          </div>
          <StatusBadge status={review.displayStatus} />
        </div>

        <div className="ci-summary-strip">
          <div className="ci-summary-item">
            <span className="muted">Requested</span>
            <strong>{formatCreditAmount(review.requestedLimit, { emptyLabel: missingInfoLabel('not_provided') })}</strong>
          </div>
          <div className="ci-summary-item">
            <span className="muted">Suggested</span>
            <strong>{formatCreditAmount(review.suggestion?.suggested_limit)}</strong>
          </div>
          <div className="ci-summary-item">
            <span className="muted">Current Limit</span>
            <strong>{formatCreditAmount(displayCurrentLimit)}</strong>
          </div>
          <div className="ci-summary-item">
            <span className="muted">Outstanding</span>
            <strong>{formatCreditAmount(liveFin.outstanding_balance ?? review.liveOutstanding ?? review.outstandingBalance, { emptyLabel: missingInfoLabel('no_records') })}</strong>
          </div>
          <div className="ci-summary-item">
            <span className="muted">Risk</span>
            <strong><StatusBadge status={review.riskLevel || '—'} /></strong>
          </div>
          <div className="ci-summary-item">
            <span className="muted">KYC</span>
            <strong>{textOrMissing(evCustomer.id_verification_status, 'pending_verification')}</strong>
          </div>
        </div>

        <div className="ci-findings" role="region" aria-label="Review considerations">
          <h4 className="subsection-title" style={{ marginTop: 16 }}>Review Considerations</h4>
          {findings.length ? (
            <ul className="ci-findings-list">
              {findings.map((f) => (
                <li key={f.key}>{f.text}</li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: '4px 0 0' }}>No special concerns flagged for this application.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/customers/${review.customerId}`)}
          >
            Open Customer
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/credit-history?customerId=${review.customerId}`)}
          >
            Payment History
          </button>
        </div>
      </section>

      <div className="ci-case-layout">
        <div className="ci-case-main">
          <div className="segmented-control" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'segment active' : 'segment'}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <section className="panel content-panel">
              <DetailRowsTable
                dense
                rows={[
                  { label: 'Customer', value: review.customerName },
                  { label: 'Customer Code', value: textOrMissing(review.customerCode, 'not_on_file') },
                  { label: 'Contact', value: textOrMissing(review.contactPhone, 'not_on_file') },
                  { label: 'Application Reason', value: textOrMissing(review.reason, 'not_provided') },
                  { label: 'Sales Remarks', value: textOrMissing(review.requestRemarks, 'not_provided') },
                  { label: 'Assigned Sales Agent', value: textOrMissing(review.assignedSalesAgent, 'not_on_file') },
                  ...(review.accountManager
                    ? [{ label: 'Account Manager', value: review.accountManager }]
                    : []),
                  { label: 'Submitted By', value: textOrMissing(review.submittedBy, 'not_on_file') },
                  { label: 'Investigation Status', value: <StatusBadge status={review.displayStatus} /> },
                ]}
              />
            </section>
          ) : null}

          {activeTab === 'financials' ? (
            <>
              <section className="panel content-panel">
                <div className="panel-section-header">
                  <h3>Credit Position</h3>
                  <p className="muted">Live account figures since the application was submitted.</p>
                </div>
                <DetailRowsTable
                  dense
                  rows={[
                    { label: 'Current Outstanding', value: formatCreditAmount(liveFin.outstanding_balance ?? review.liveOutstanding, { emptyLabel: missingInfoLabel('no_records') }) },
                    { label: 'Current Credit Limit', value: formatCreditAmount(displayCurrentLimit) },
                    { label: 'Remaining Credit', value: formatCreditAmount(liveFin.remaining_credit) },
                    { label: 'Current Utilization', value: liveFin.utilization_pct != null ? `${liveFin.utilization_pct}%` : missingInfoLabel('not_on_file') },
                    { label: 'Current Overdue Amount', value: formatCreditAmount(liveFin.overdue_amount, { emptyLabel: missingInfoLabel('no_records') }) },
                  ]}
                />
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header">
                  <h3>Submitted Snapshot</h3>
                  <p className="muted">
                    Frozen at submission
                    {snap.captured_at ? ` · ${formatDisplayDateTime(snap.captured_at)}` : ''}
                  </p>
                </div>
                <DetailRowsTable
                  dense
                  rows={[
                    { label: 'Outstanding Balance', value: formatCreditAmount(snapFin.outstanding_balance, { emptyLabel: missingInfoLabel('no_records') }) },
                    { label: 'Existing Credit Limit', value: formatCreditAmount(snapFin.credit_limit) },
                    { label: 'Requested Credit Limit', value: formatCreditAmount(review.requestedLimit, { emptyLabel: missingInfoLabel('not_provided') }) },
                    { label: 'Utilization', value: snapFin.utilization_pct != null ? `${snapFin.utilization_pct}%` : missingInfoLabel('not_on_file') },
                    { label: 'Overdue Invoices', value: snapFin.overdue_count != null ? String(snapFin.overdue_count) : missingInfoLabel('no_records') },
                    { label: 'Overdue Amount', value: formatCreditAmount(snapFin.overdue_amount, { emptyLabel: missingInfoLabel('no_records') }) },
                  ]}
                />
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Payment Performance</h3></div>
                {payments.length ? (
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Remaining</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment, index) => (
                          <tr key={payment.credit_id || payment.collection_id || index}>
                            <td>{formatDisplayDate(payment.payment_date || payment.date)}</td>
                            <td>{formatCurrency(payment.amount || payment.amount_paid || 0)}</td>
                            <td>{payment.remaining_balance != null ? formatCurrency(payment.remaining_balance) : '—'}</td>
                            <td><StatusBadge status={payment.payment_status || payment.status || '—'} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">{missingInfoLabel('no_records')}</p>
                )}
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Sales / Recent Activity</h3></div>
                <DetailRowsTable
                  dense
                  rows={[
                    { label: 'Most Recent Payment', value: (liveFin.last_collection_date || snapFin.last_collection_date)
                      ? formatDisplayDate(liveFin.last_collection_date || snapFin.last_collection_date)
                      : missingInfoLabel('no_records') },
                    { label: 'Most Recent Sale', value: (liveFin.last_sales_visit || snapFin.last_sales_visit)
                      ? formatDisplayDate(liveFin.last_sales_visit || snapFin.last_sales_visit)
                      : missingInfoLabel('no_records') },
                    { label: 'Open Invoices', value: String(openInvoices.length) },
                  ]}
                />
                {openInvoices.length ? (
                  <div className="corvex-table-wrapper" style={{ marginTop: 12 }}>
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Due</th>
                          <th>Remaining</th>
                          <th>Days Overdue</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openInvoices.slice(0, 15).map((inv) => (
                          <tr key={inv.invoice_number || inv.sales_invoices_id || `${inv.due_date}-${inv.total_amount}`}>
                            <td>{inv.invoice_number || '—'}</td>
                            <td>{inv.due_date ? formatDisplayDate(inv.due_date) : '—'}</td>
                            <td>{formatCurrency(inv.remaining_balance != null ? inv.remaining_balance : inv.total_amount || 0)}</td>
                            <td>{inv.due_date ? agingDaysManila(inv.due_date) : '—'}</td>
                            <td><StatusBadge status={inv.status || '—'} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {activeTab === 'risk' ? (
            <section className="panel content-panel">
              <div className="panel-section-header">
                <h3>Risk & Eligibility</h3>
                <p className="muted">Rule-based assessment from account evidence — formulas unchanged.</p>
              </div>
              <DetailRowsTable
                dense
                rows={[
                  {
                    key: 'risk-classification',
                    label: (
                      <LabelWithHint
                        label="Risk Classification"
                        hint={(
                          <InfoHint label="About risk classification">
                            {riskReasons.length
                              ? (
                                <ul className="info-hint__list">
                                  {riskReasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              )
                              : 'No risk findings were recorded for this assessment.'}
                          </InfoHint>
                        )}
                      />
                    ),
                    value: <StatusBadge status={review.riskLevel || '—'} />,
                  },
                  {
                    key: 'risk-score',
                    label: (
                      <LabelWithHint
                        label="Risk Score"
                        hint={(
                          <InfoHint label="About risk score">
                            {review.riskScore != null
                              ? `Recorded risk score: ${review.riskScore}. Derived from the same assessment findings shown under Risk Classification.`
                              : 'No risk score is on file for this investigation.'}
                          </InfoHint>
                        )}
                      />
                    ),
                    value: review.riskScore != null ? String(review.riskScore) : missingInfoLabel('not_on_file'),
                  },
                  { key: 'bureau-score', label: 'Credit Score (bureau)', value: missingInfoLabel('not_on_file') },
                  {
                    key: 'suggested-limit',
                    label: (
                      <LabelWithHint
                        label="Suggested Limit"
                        hint={(
                          <InfoHint label="About suggested limit">
                            {suggestionMsg
                              || (review.suggestion?.suggested_limit != null
                                ? `System suggested ${formatCreditAmount(review.suggestion.suggested_limit)} from available income/revenue evidence.`
                                : 'No numeric suggestion is available from the current evidence.')}
                          </InfoHint>
                        )}
                      />
                    ),
                    value: formatCreditAmount(review.suggestion?.suggested_limit),
                  },
                  {
                    key: 'recommendation-notes',
                    label: 'Recommendation Notes',
                    value: textOrMissing(suggestionMsg, 'not_on_file'),
                  },
                  {
                    key: 'eligible-increase',
                    label: 'Eligible for Increase',
                    value: review.suggestion?.eligible === true
                      ? 'Yes'
                      : review.suggestion?.eligible === false
                        ? 'No / caution'
                        : missingInfoLabel('not_on_file'),
                  },
                ]}
              />
              {riskReasons.length ? (
                <>
                  <h4 className="subsection-title">Findings</h4>
                  <ul>
                    {riskReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted" style={{ marginTop: 8 }}>No risk findings recorded.</p>
              )}
            </section>
          ) : null}

          {activeTab === 'customer' ? (
            <>
              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Customer Profile</h3></div>
                <DetailRowsTable
                  dense
                  rows={[
                    { label: 'Business Name', value: textOrMissing(evCustomer.business_name || snap?.customer?.business_name, 'not_on_file') },
                    ...(evClassification ? [{ label: 'Classification', value: evClassification }] : []),
                    { label: 'Civil Status', value: textOrMissing(civilStatus, 'not_provided') },
                    { label: "Mother's Maiden Name", value: textOrMissing(maidenName, 'not_provided') },
                    { label: 'Territory', value: textOrMissing(evCustomer.territory_name || snap?.customer?.territory_name, 'not_on_file') },
                    ...(evAddress ? [{ label: 'Address', value: evAddress }] : []),
                    { label: 'KYC / ID Status', value: textOrMissing(evCustomer.id_verification_status, 'pending_verification') },
                  ]}
                />
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Alternate Contact</h3></div>
                <DetailRowsTable
                  dense
                  rows={[
                    { label: 'Contact Name', value: textOrMissing(altName, 'not_provided') },
                    { label: 'Relationship', value: textOrMissing(altRel, 'not_provided') },
                    { label: 'Phone', value: textOrMissing(altPhone, 'not_provided') },
                  ]}
                />
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Employment & Income</h3></div>
                <DetailRowsTable
                  dense
                  rows={[
                    {
                      label: 'Employment Status',
                      value: textOrMissing(
                        evEmployment.employment_status || evEmployment.status || liveFin.employment_status || snapFin.employment_status,
                        'not_provided'
                      ),
                    },
                    ...(employer ? [{ label: 'Employer / Occupation', value: employer }] : []),
                    {
                      label: 'Monthly Income',
                      value: formatCreditAmount(
                        evEmployment.monthly_income ?? liveFin.monthly_income ?? snapFin.monthly_income,
                        { emptyLabel: missingInfoLabel('not_provided') }
                      ),
                    },
                  ]}
                />
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Identity Document</h3></div>
                <DetailRowsTable
                  dense
                  rows={[
                    { label: 'ID Type', value: textOrMissing(idType, 'not_provided') },
                    { label: 'ID Number', value: textOrMissing(idNumber, 'not_provided') },
                    {
                      label: 'ID Photo',
                      value: idPhoto
                        ? (
                          <a href={idPhoto} target="_blank" rel="noreferrer" className="ci-id-photo-link">
                            View ID photo
                          </a>
                        )
                        : missingInfoLabel('not_provided'),
                    },
                  ]}
                />
                {idPhoto && (String(idPhoto).startsWith('data:image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(idPhoto))) ? (
                  <div className="ci-id-photo-preview">
                    <img src={idPhoto} alt="Submitted ID" />
                  </div>
                ) : null}
              </section>

              {showBusinessBlock ? (
                <section className="panel content-panel">
                  <div className="panel-section-header"><h3>Business Evidence</h3></div>
                  <DetailRowsTable
                    dense
                    rows={[
                      { label: 'Business Type', value: textOrMissing(evProfile.business_type, 'not_provided') },
                      { label: 'Store Type', value: textOrMissing(evProfile.store_type, 'not_provided') },
                      {
                        label: 'Years of Operation',
                        value: evProfile.years_of_operation != null && evProfile.years_of_operation !== ''
                          ? String(evProfile.years_of_operation)
                          : missingInfoLabel('not_provided'),
                      },
                      { label: 'Business Document', value: hasDoc ? 'Attached at registration' : missingInfoLabel('not_provided') },
                      {
                        label: 'Est. Monthly Revenue',
                        value: formatCreditAmount(snapFin.estimated_monthly_revenue ?? liveFin.estimated_monthly_revenue, { emptyLabel: missingInfoLabel('not_provided') }),
                      },
                      {
                        label: 'Existing Obligations',
                        value: formatCreditAmount(snapFin.existing_obligations ?? liveFin.existing_obligations, { emptyLabel: missingInfoLabel('not_provided') }),
                      },
                    ]}
                  />
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === 'history' ? (
            <>
              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Previous Credit Decisions</h3></div>
                {previousDecisions.length ? (
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>CI</th>
                          <th>Decision</th>
                          <th>Limit</th>
                          <th>By</th>
                          <th>Date</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previousDecisions.map((d) => (
                          <tr key={d.ci_id}>
                            <td>#{d.ci_id}</td>
                            <td><StatusBadge status={d.status} /></td>
                            <td>{formatCreditAmount(d.approved_credit_limit ?? d.requested_credit_limit)}</td>
                            <td>{d.decided_by || d.decided_by_name || '—'}</td>
                            <td>{d.decided_at ? formatDisplayDateTime(d.decided_at) : '—'}</td>
                            <td>{d.decision_remarks || d.rejection_reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">{missingInfoLabel('no_records')}</p>
                )}
              </section>

              <section className="panel content-panel">
                <div className="panel-section-header"><h3>Investigation Activity</h3></div>
                {revisionHistory.length ? (
                  <ul>
                    {revisionHistory.slice().reverse().map((event, index) => (
                      <li key={`${event.at}-${index}`}>
                        {event.event} · {event.previous_status || '—'} → {event.new_status || 'Pending'}
                        {' · '}
                        {event.at ? formatDisplayDateTime(event.at) : '—'}
                        {event.remarks ? ` · ${event.remarks}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No revision trail on this investigation yet.</p>
                )}
              </section>
            </>
          ) : null}

          <div className="ci-decision-mobile">
            <DecisionPanel {...decisionProps} />
          </div>
        </div>

        <aside className="ci-case-aside">
          <DecisionPanel {...decisionProps} stickyClass="ci-decision-sticky" />
        </aside>
      </div>

      <ConfirmModal
        open={Boolean(pendingDecision)}
        title={modalCopy?.title || 'Confirm decision'}
        description={modalCopy?.description}
        details={modalDetails}
        confirmLabel={modalCopy?.confirmLabel || 'Confirm'}
        confirmTone={modalCopy?.confirmTone || 'primary'}
        cancelLabel="Cancel"
        busy={deciding}
        busyLabel="Submitting…"
        onCancel={() => {
          if (!deciding) setPendingDecision(null);
        }}
        onConfirm={confirmPendingDecision}
      />
    </div>
  );
}
