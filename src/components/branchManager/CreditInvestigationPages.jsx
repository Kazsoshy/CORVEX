import { useEffect, useState } from 'react';
import {
  fetchCreditInvestigations,
  fetchCreditInvestigationById,
  patchCreditInvestigation,
  evaluateCreditRecommendations,
  fetchCreditRecommendations,
  patchCreditRecommendation,
  convertCreditRecommendation,
} from '../../api/approvalsService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Stats } from '../shared/StatsGrid';
import { Pagination } from '../shared/Pagination';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../data/branchManagerMockData';
import { formatMoneyOrNA, mapCreditReviewRow } from '../../utils/creditReview.js';

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function agingDays(dateValue) {
  if (!dateValue) return 0;
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const diff = Math.floor(
    (new Date(`${manilaToday}T12:00:00`) - new Date(`${String(dateValue).slice(0, 10)}T12:00:00`)) / 86400000
  );
  return Math.max(0, diff);
}

export function CreditInvestigationQueuePage({ navigate, opsBase, showToast }) {
  const [mainTab, setMainTab] = useState('decision');
  const [statusFilter, setStatusFilter] = useState('Needs BM');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  const [recStatus, setRecStatus] = useState('New');
  const [recType, setRecType] = useState('All');
  const [recommendations, setRecommendations] = useState([]);
  const [recTotal, setRecTotal] = useState(0);
  const [recLoading, setRecLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const filterKey = `${statusFilter}|${search}|${riskFilter}|${sort}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterKey,
  });
  const recFilterKey = `${recStatus}|${recType}`;
  const recPagination = useServerPagination({
    totalRecords: recTotal,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: recFilterKey,
  });

  useEffect(() => {
    if (mainTab !== 'decision') return undefined;
    let active = true;
    async function load() {
      setLoading(true);
      const res = await fetchCreditInvestigations({
        status: statusFilter,
        search: search.trim() || undefined,
        risk_level: riskFilter !== 'All' ? riskFilter : undefined,
        sort,
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
        include_stats: 1,
      });
      if (!active) return;
      if (res.success) {
        setItems((res.data || []).map(mapCreditReviewRow));
        setTotalRecords(Number(res.pagination?.total) || 0);
        setStats(res.meta?.stats || null);
      } else {
        setItems([]);
        setTotalRecords(0);
        showToast?.(res.message || 'Failed to load credit investigations.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [mainTab, statusFilter, search, riskFilter, sort, pagination.currentPage, showToast]);

  useEffect(() => {
    if (mainTab !== 'recommended') return undefined;
    let active = true;
    async function load() {
      setRecLoading(true);
      const res = await fetchCreditRecommendations({
        status: recStatus,
        recommendation_type: recType !== 'All' ? recType : undefined,
        page: recPagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
      });
      if (!active) return;
      if (res.success) {
        setRecommendations(res.data || []);
        setRecTotal(Number(res.pagination?.total) || 0);
      } else {
        setRecommendations([]);
        setRecTotal(0);
        showToast?.(res.message || 'Failed to load recommendations.', 'error');
      }
      setRecLoading(false);
    }
    load();
    return () => { active = false; };
  }, [mainTab, recStatus, recType, recPagination.currentPage, showToast]);

  async function handleEvaluate() {
    setEvaluating(true);
    const res = await evaluateCreditRecommendations({});
    setEvaluating(false);
    if (!res.success) {
      showToast?.(res.message || 'Evaluation failed.', 'error');
      return;
    }
    showToast?.(
      `Scanned ${res.data?.scanned || 0}: created ${res.data?.created || 0}, refreshed ${res.data?.refreshed || 0}.`,
      'success'
    );
    setMainTab('recommended');
    setRecStatus('New');
  }

  async function handleRecAction(row, action) {
    if (action === 'convert') {
      const proceed = window.confirm(`Convert recommendation for ${row.customer_name} into a formal CI request?`);
      if (!proceed) return;
      const res = await convertCreditRecommendation(row.recommendation_id, {});
      if (!res.success) {
        showToast?.(res.message || 'Conversion failed.', 'error');
        if (res.data?.ci_id) navigate(`${opsBase}/ci-approvals/${res.data.ci_id}`);
        return;
      }
      showToast?.(res.message || 'Converted to CI.', 'success');
      navigate(`${opsBase}/ci-approvals/${res.data?.ci_id}`);
      return;
    }
    if (action === 'watch') {
      const res = await patchCreditRecommendation(row.recommendation_id, { status: 'Watching' });
      if (!res.success) showToast?.(res.message || 'Failed.', 'error');
      else {
        showToast?.('Marked as Watching.', 'success');
        setRecommendations((prev) => prev.map((r) => (
          r.recommendation_id === row.recommendation_id ? { ...r, status: 'Watching' } : r
        )));
      }
      return;
    }
    if (action === 'dismiss') {
      const reason = window.prompt('Dismissal reason (required):');
      if (!reason || !reason.trim()) return;
      const res = await patchCreditRecommendation(row.recommendation_id, {
        status: 'Dismissed',
        dismissed_reason: reason.trim(),
      });
      if (!res.success) showToast?.(res.message || 'Failed.', 'error');
      else {
        showToast?.('Recommendation dismissed.', 'success');
        setRecommendations((prev) => prev.filter((r) => r.recommendation_id !== row.recommendation_id));
      }
    }
  }

  return (
    <div className="page">
      <section className="panel content-panel mb-4">
        <div className="list-section-header">
          <div>
            <h3>Credit Investigation</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Review credit applications, evaluate customer risk, and manage branch credit exposure.
            </p>
          </div>
          <button className="button secondary" type="button" disabled={evaluating} onClick={handleEvaluate}>
            {evaluating ? 'Evaluating…' : 'Refresh Recommendations'}
          </button>
        </div>
        <div className="segmented-control" style={{ marginTop: 12 }}>
          <button
            type="button"
            className={mainTab === 'decision' ? 'segment active' : 'segment'}
            onClick={() => setMainTab('decision')}
          >
            Needs Decision
          </button>
          <button
            type="button"
            className={mainTab === 'recommended' ? 'segment active' : 'segment'}
            onClick={() => setMainTab('recommended')}
          >
            Recommended Customers
          </button>
        </div>
      </section>

      {mainTab === 'decision' ? (
        <>
          <Stats stats={[
            { label: 'Pending Reviews', value: String(stats?.pending ?? '—') },
            { label: 'Revision Requested', value: String(stats?.revisionRequested ?? '—') },
            { label: 'High-Risk Applications', value: String(stats?.highRiskOpen ?? '—') },
            { label: 'Approved This Month', value: String(stats?.approvedThisMonth ?? '—') },
            {
              label: 'Average Decision Time',
              value: stats?.averageDecisionHours != null
                ? `${stats.averageDecisionHours}h`
                : '—',
            },
          ]} />

          <section className="panel content-panel">
            <div className="list-section-controls" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <input
                className="filter-input search"
                type="search"
                placeholder="Search customer, code, or CI ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {['Needs BM', 'Pending', 'Revision Requested', 'Approved', 'Rejected', 'All'].map((s) => (
                  <option key={s} value={s}>{s === 'Needs BM' ? 'Needs Decision' : s}</option>
                ))}
              </select>
              <select className="filter-select" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                {['All', 'High', 'Medium', 'Low'].map((s) => (
                  <option key={s} value={s}>{s === 'All' ? 'All Risk Levels' : s}</option>
                ))}
              </select>
              <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest Submitted</option>
                <option value="oldest">Oldest Pending</option>
                <option value="risk">Highest Risk First</option>
                <option value="updated">Recently Updated</option>
              </select>
            </div>

            {loading && !items.length ? (
              <LoadingState message="Loading credit investigations…" />
            ) : items.length ? (
              <>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Submitted By</th>
                        <th>Reason</th>
                        <th>Risk</th>
                        <th>Current Limit</th>
                        <th>Requested</th>
                        <th>Outstanding</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => {
                        const aging = agingDays(row.submissionDate);
                        const highRisk = String(row.riskLevel || '') === 'High';
                        const agingWarn = aging >= 3 && (row.status === 'Pending' || row.status === 'Revision Requested');
                        return (
                          <tr
                            key={row.ciId}
                            className="clickable-row"
                            style={highRisk || agingWarn ? { background: 'rgba(220,38,38,0.04)' } : undefined}
                            onClick={() => navigate(`${opsBase}/ci-approvals/${row.ciId}`)}
                          >
                            <td>
                              <strong>{row.customerName}</strong>
                              {row.customerCode ? <div className="muted" style={{ fontSize: '0.78rem' }}>{row.customerCode}</div> : null}
                            </td>
                            <td>{row.submittedBy || '—'}</td>
                            <td>{row.reason || '—'}</td>
                            <td><StatusBadge status={row.riskLevel || '—'} /></td>
                            <td>{formatMoneyOrNA(row.currentLimit)}</td>
                            <td>{formatMoneyOrNA(row.requestedLimit)}</td>
                            <td>{formatCurrency(row.snapshot?.financial?.outstanding_balance || 0)}</td>
                            <td><StatusBadge status={row.displayStatus} /></td>
                            <td>
                              {formatDisplayDate(row.submissionDate)}
                              {agingWarn ? <div className="muted" style={{ fontSize: '0.75rem' }}>{aging}d open</div> : null}
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
                title="No credit investigations in this filter"
                description="Sales Agent submissions appear here after a formal credit review is created."
              />
            )}
          </section>
        </>
      ) : (
        <section className="panel content-panel">
          <div className="list-section-controls" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <select className="filter-select" value={recStatus} onChange={(e) => setRecStatus(e.target.value)}>
              {['New', 'Watching', 'Converted to CI', 'Dismissed', 'All'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="filter-select" value={recType} onChange={(e) => setRecType(e.target.value)}>
              {['All', 'First Limit', 'Limit Increase', 'Delinquency', 'Initial CI', 'KYC', 'Exposure', 'Collector Flag'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Types' : s}</option>
              ))}
            </select>
          </div>
          {recLoading && !recommendations.length ? (
            <LoadingState message="Loading recommendations…" />
          ) : recommendations.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Recommendation</th>
                      <th>Trigger</th>
                      <th>Outstanding</th>
                      <th>Credit Limit</th>
                      <th>Utilization</th>
                      <th>Risk</th>
                      <th>Generated</th>
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
                        <td style={{ maxWidth: 260 }}>{row.trigger_reason}</td>
                        <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                        <td>{formatCurrency(row.credit_limit || 0)}</td>
                        <td>{row.utilization != null ? `${row.utilization}%` : '—'}</td>
                        <td><StatusBadge status={row.risk_level || '—'} /></td>
                        <td>{formatDisplayDate(row.generated_at || row.last_evaluated_at)}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => navigate(`${opsBase}/customers/${row.customer_id}`)}
                            >
                              Open
                            </button>
                            {row.status === 'New' || row.status === 'Watching' ? (
                              <>
                                <button className="button" type="button" onClick={() => handleRecAction(row, 'convert')}>
                                  Convert
                                </button>
                                {row.status === 'New' ? (
                                  <button className="button ghost" type="button" onClick={() => handleRecAction(row, 'watch')}>
                                    Watch
                                  </button>
                                ) : null}
                                <button className="button ghost" type="button" onClick={() => handleRecAction(row, 'dismiss')}>
                                  Dismiss
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...recPagination} />
            </>
          ) : (
            <EmptyState
              title="No recommendations yet"
              description="Run Refresh Recommendations to evaluate Active customers in this branch. Recommendations are not formal CI applications."
              actionLabel="Refresh Recommendations"
              onAction={handleEvaluate}
            />
          )}
        </section>
      )}
    </div>
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
        liveLimit: res.data.live_credit_limit,
        revisionHistory: res.data.revision_history || [],
      });
      const suggestion = mapped.suggestion?.suggested_limit;
      const pref = mapped.requestedLimit || suggestion || mapped.currentLimit || '';
      setApprovedLimit(pref !== '' && pref != null ? String(pref) : '');
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

  async function decide(status) {
    if (status === 'Approved' && !(Number(approvedLimit) > 0)) {
      showToast?.('Enter an approved credit limit.', 'error');
      return;
    }
    if ((status === 'Rejected' || status === 'Revision Requested') && !remarks.trim()) {
      showToast?.(status === 'Rejected' ? 'Rejection reason is required.' : 'Revision instructions are required.', 'error');
      return;
    }
    const label = status === 'Revision Requested' ? 'request revision' : status.toLowerCase();
    if (!window.confirm(`Confirm: ${label} this credit investigation?`)) return;

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
    showToast?.(res.message || `Marked ${status}.`, 'success');
    await reload();
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
  const canDecide = review.status === 'Pending' || review.status === 'Revision Requested';
  const openInvoices = liveFin.open_invoices || snapFin.open_invoices || [];
  const previousDecisions = live?.previous_decisions || snap.previous_decisions || [];
  const revisionHistory = review.revisionHistory || [];

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Credit Investigation · {review.customerName}</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              CI #{review.ciId} · {review.reason || 'Credit review'} · {formatDisplayDateTime(review.submissionDate)}
            </p>
          </div>
          <StatusBadge status={review.displayStatus} />
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Customer Code', value: review.customerCode || '—' },
            { label: 'Contact', value: review.contactPhone || '—' },
            { label: 'Branch', value: review.raw?.branch_name || '—' },
            { label: 'Assigned Sales Agent', value: review.assignedSalesAgent || '—' },
            { label: 'Account Manager', value: review.accountManager || '—' },
            { label: 'Submitted By', value: review.submittedBy || '—' },
            { label: 'Request Reason', value: review.reason || '—' },
            { label: 'Sales Remarks', value: review.requestRemarks || '—' },
            { label: 'Risk', value: <StatusBadge status={review.riskLevel || '—'} /> },
            { label: 'Risk Score', value: review.riskScore != null ? String(review.riskScore) : '—' },
          ]}
        />
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
            View Payment History
          </button>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Submitted Snapshot</h3></div>
        <p className="muted">Frozen at submission{snap.captured_at ? ` · ${formatDisplayDateTime(snap.captured_at)}` : ''}.</p>
        <DetailRowsTable
          rows={[
            { label: 'Outstanding Balance', value: formatCurrency(snapFin.outstanding_balance || 0) },
            { label: 'Existing Credit Limit', value: formatMoneyOrNA(snapFin.credit_limit) },
            { label: 'Requested Credit Limit', value: formatMoneyOrNA(review.requestedLimit) },
            { label: 'Utilization', value: snapFin.utilization_pct != null ? `${snapFin.utilization_pct}%` : '—' },
            { label: 'Overdue Invoices', value: String(snapFin.overdue_count ?? 0) },
            { label: 'Overdue Amount', value: formatCurrency(snapFin.overdue_amount || 0) },
            { label: 'Last Payment', value: snapFin.last_collection_date ? formatDisplayDate(snapFin.last_collection_date) : '—' },
            { label: 'Last Sale', value: snapFin.last_sales_visit ? formatDisplayDate(snapFin.last_sales_visit) : '—' },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Current Financial Position</h3></div>
        <DetailRowsTable
          rows={[
            { label: 'Current Outstanding', value: formatCurrency(liveFin.outstanding_balance ?? review.liveOutstanding ?? 0) },
            { label: 'Current Credit Limit', value: formatMoneyOrNA(liveFin.credit_limit ?? review.liveLimit) },
            { label: 'Remaining Credit', value: formatMoneyOrNA(liveFin.remaining_credit) },
            { label: 'Current Utilization', value: liveFin.utilization_pct != null ? `${liveFin.utilization_pct}%` : '—' },
            { label: 'Current Overdue Amount', value: formatCurrency(liveFin.overdue_amount || 0) },
            { label: 'Open Invoices', value: String((liveFin.open_invoices || []).length) },
            { label: 'Most Recent Payment', value: liveFin.last_collection_date ? formatDisplayDate(liveFin.last_collection_date) : '—' },
            { label: 'Most Recent Sale', value: liveFin.last_sales_visit ? formatDisplayDate(liveFin.last_sales_visit) : '—' },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Credit Risk Assessment</h3></div>
        <DetailRowsTable
          rows={[
            { label: 'Risk Level', value: <StatusBadge status={review.riskLevel || '—'} /> },
            { label: 'Risk Score', value: review.riskScore != null ? String(review.riskScore) : '—' },
            { label: 'Suggested Limit', value: formatMoneyOrNA(review.suggestion?.suggested_limit) },
            { label: 'Suggestion Notes', value: review.suggestion?.message || '—' },
          ]}
        />
        {(review.riskReasons || []).length ? (
          <ul style={{ marginTop: 8 }}>
            {review.riskReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No risk reasons recorded.</p>
        )}
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Employment & Income</h3></div>
        <DetailRowsTable
          rows={[
            { label: 'Employment Status', value: liveFin.employment_status || snapFin.employment_status || '—' },
            { label: 'Monthly Income', value: formatMoneyOrNA(liveFin.monthly_income ?? snapFin.monthly_income) },
            { label: 'Credit Score', value: liveFin.credit_score ?? snapFin.credit_score ?? '—' },
            { label: 'KYC Status', value: snap?.customer?.id_verification_status || live?.customer?.id_verification_status || '—' },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Open Invoices</h3></div>
        {openInvoices.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Invoice Date</th>
                  <th>Due Date</th>
                  <th>Original</th>
                  <th>Paid</th>
                  <th>Remaining</th>
                  <th>Days Overdue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => (
                  <tr key={inv.invoice_number || inv.sales_invoices_id || `${inv.due_date}-${inv.total_amount}`}>
                    <td>{inv.invoice_number || '—'}</td>
                    <td>{inv.invoices_date ? formatDisplayDate(inv.invoices_date) : '—'}</td>
                    <td>{inv.due_date ? formatDisplayDate(inv.due_date) : '—'}</td>
                    <td>{formatCurrency(inv.total_amount || 0)}</td>
                    <td>{formatCurrency(inv.amount_paid || 0)}</td>
                    <td>{formatCurrency(inv.remaining_balance != null ? inv.remaining_balance : inv.total_amount || 0)}</td>
                    <td>{inv.due_date ? agingDays(inv.due_date) : '—'}</td>
                    <td><StatusBadge status={inv.status || '—'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No open invoices in the current evidence set.</p>
        )}
      </section>

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
                    <td>{formatMoneyOrNA(d.approved_credit_limit ?? d.requested_credit_limit)}</td>
                    <td>{d.decided_by || '—'}</td>
                    <td>{d.decided_at ? formatDisplayDateTime(d.decided_at) : '—'}</td>
                    <td>{d.decision_remarks || d.rejection_reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No prior credit decisions for this customer.</p>
        )}
        {revisionHistory.length ? (
          <>
            <h4 className="subsection-title">Revision Trail</h4>
            <ul>
              {revisionHistory.slice().reverse().map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  {event.event} · {event.previous_status || '—'} → {event.new_status || 'Pending'} · {event.at ? formatDisplayDateTime(event.at) : '—'}
                  {event.remarks ? ` · ${event.remarks}` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {canDecide ? (
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Decision</h3></div>
          <div className="account-detail-grid two-up">
            <div className="form-group">
              <label htmlFor="ci-approved-limit">Approved Credit Limit (₱)</label>
              <input
                id="ci-approved-limit"
                type="number"
                min="0"
                step="0.01"
                value={approvedLimit}
                onChange={(e) => setApprovedLimit(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="ci-remarks">Decision Remarks / Revision Instructions / Rejection Reason</label>
              <textarea
                id="ci-remarks"
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Required for Reject and Request Revision"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
            <button className="button" type="button" disabled={deciding} onClick={() => decide('Approved')}>
              Approve
            </button>
            <button className="button secondary" type="button" disabled={deciding} onClick={() => decide('Revision Requested')}>
              Request Revision
            </button>
            <button className="button ghost" type="button" disabled={deciding} onClick={() => decide('Rejected')}>
              Reject
            </button>
          </div>
        </section>
      ) : (
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Decision Record</h3></div>
          <DetailRowsTable
            rows={[
              { label: 'Status', value: <StatusBadge status={review.status} /> },
              { label: 'Approved Limit', value: formatMoneyOrNA(review.approvedLimit) },
              { label: 'Decided By', value: review.approvedBy || '—' },
              { label: 'Decided At', value: review.decidedAt ? formatDisplayDateTime(review.decidedAt) : '—' },
              { label: 'Remarks', value: review.decisionRemarks || review.rejectionReason || '—' },
            ]}
          />
        </section>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/ci-approvals`)}>
          Back to Queue
        </button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>
          Approval Center
        </button>
      </div>
    </div>
  );
}
