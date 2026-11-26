import { Pagination } from '../shared/Pagination';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCreditHistory,
  getCreditHistoryById,
  logPaymentProofAccess,
  requestPaymentVoidCorrection,
} from '../../api/reportsService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { RowActionMenu } from './RowActionMenu';
import { ProofLightbox } from './ProofLightbox';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import { downloadPdf } from '../../utils/dataExport.js';
import {
  copyText,
  invoiceDiscountLabel,
  parsePaymentRemarks,
  paymentSourceLabel,
  paymentStatus,
  paymentWhen,
  receivedByLabel,
  receivedByRole,
} from './paymentHistoryHelpers.js';

function dash(value) {
  return value == null || value === '' ? '—' : String(value);
}

function buildListQuery({
  customerFilterId,
  statusFilter,
  dateFrom,
  dateTo,
  search,
  methodFilter,
  sourceFilter,
  receivedBy,
  sort,
  sortDir,
  page,
  limit,
}) {
  const params = new URLSearchParams();
  if (customerFilterId) params.set('customerId', String(customerFilterId));
  if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
  if (dateFrom) params.set('from', dateFrom);
  if (dateTo) params.set('to', dateTo);
  if (search.trim()) params.set('q', search.trim());
  if (methodFilter && methodFilter !== 'All') params.set('method', methodFilter);
  if (sourceFilter && sourceFilter !== 'All') params.set('source', sourceFilter);
  if (receivedBy?.trim()) params.set('received_by', receivedBy.trim());
  if (sort && sort !== 'date') params.set('sort', sort);
  if (sortDir && sortDir !== 'desc') params.set('sort_dir', sortDir);
  if (page && page > 1) params.set('page', String(page));
  if (limit && limit !== DEFAULT_PAGE_SIZE) params.set('limit', String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function RoleBadge({ role }) {
  if (!role) return null;
  return <span className="role-inline-badge">{role}</span>;
}

function CopyableStack({ primary, secondary }) {
  return (
    <div className="copyable-stack">
      <button
        type="button"
        className="button ghost copyable-stack__primary"
        title="Copy receipt"
        onClick={async (e) => {
          e.stopPropagation();
          if (primary) await copyText(primary);
        }}
      >
        {primary || '—'}
      </button>
      {secondary ? (
        <button
          type="button"
          className="button ghost copyable-stack__secondary muted"
          title="Copy invoice"
          onClick={async (e) => {
            e.stopPropagation();
            await copyText(secondary);
          }}
        >
          {secondary}
        </button>
      ) : null}
    </div>
  );
}

function buildPaymentHistoryPdfRows(record) {
  if (!record) return [];
  const remarks = parsePaymentRemarks(record);
  return [
    { Field: 'Customer', Value: dash(record.customer_name) },
    { Field: 'Customer Code', Value: dash(record.customer_code) },
    { Field: 'Branch', Value: dash(record.branch_name) },
    { Field: 'Receipt', Value: dash(record.receipt_number) },
    { Field: 'Invoice', Value: dash(record.invoice_number) },
    { Field: 'Original Invoice Amount', Value: formatCurrency(record.original_total_amount ?? record.invoice_amount) },
    { Field: 'Discount', Value: dash(invoiceDiscountLabel(record)) },
    { Field: 'Final / Invoice Amount', Value: formatCurrency(record.final_obligation ?? record.invoice_amount) },
    { Field: 'Previous Outstanding', Value: formatCurrency(record.previous_balance) },
    { Field: 'Amount Paid', Value: formatCurrency(record.payment_amount) },
    { Field: 'Remaining Balance', Value: formatCurrency(record.remaining_balance) },
    { Field: 'Payment Status', Value: dash(paymentStatus(record)) },
    { Field: 'Payment Date', Value: paymentWhen(record) },
    { Field: 'Payment Method', Value: dash(record.payment_method) },
    { Field: 'Source', Value: dash(paymentSourceLabel(record)) },
    { Field: 'Received By', Value: `${receivedByLabel(record)}${receivedByRole(record) ? ` (${receivedByRole(record)})` : ''}` },
    { Field: 'Reference', Value: dash(remarks.referenceNumber) },
    { Field: 'Remarks', Value: dash(remarks.freeText || remarks.raw) },
  ];
}

function downloadPaymentHistoryPdf(record, showToast) {
  try {
    const rows = buildPaymentHistoryPdfRows(record);
    if (!rows.length) {
      showToast?.('Nothing to export.', 'error');
      return false;
    }
    const ref = record.receipt_number || record.invoice_number || record.credit_id || 'record';
    const ok = downloadPdf(rows, {
      filename: `payment-history-${ref}.pdf`,
      title: 'Payment History Record',
      subtitle: `${record.customer_name || 'Customer'}${record.receipt_number ? ` · ${record.receipt_number}` : ''}`,
    });
    if (ok) {
      showToast?.('Payment record exported as PDF.', 'success');
      return true;
    }
    showToast?.('Unable to generate PDF.', 'error');
    return false;
  } catch (err) {
    console.error('[PaymentHistory] PDF export failed:', err);
    showToast?.('Unable to generate PDF.', 'error');
    return false;
  }
}

function downloadPaymentHistoryListPdf(records, showToast, { title, subtitle } = {}) {
  try {
    if (!records?.length) {
      showToast?.('Nothing to export.', 'error');
      return false;
    }
    const rows = records.map((record) => ({
      Customer: dash(record.customer_name),
      Code: dash(record.customer_code),
      Receipt: dash(record.receipt_number),
      Invoice: dash(record.invoice_number),
      Paid: formatCurrency(record.payment_amount),
      Remaining: formatCurrency(record.remaining_balance),
      Method: dash(record.payment_method),
      Source: dash(paymentSourceLabel(record)),
      'Received By': dash(receivedByLabel(record)),
      Role: dash(receivedByRole(record)),
      Status: dash(paymentStatus(record)),
      Date: paymentWhen(record),
    }));
    const ok = downloadPdf(rows, {
      filename: 'payment-history.pdf',
      title: title || 'Payment History',
      subtitle: subtitle || `${records.length} record(s)`,
    });
    if (ok) {
      showToast?.('Payment history exported as PDF.', 'success');
      return true;
    }
    showToast?.('Unable to generate PDF.', 'error');
    return false;
  } catch (err) {
    console.error('[PaymentHistory] list PDF export failed:', err);
    showToast?.('Unable to generate PDF.', 'error');
    return false;
  }
}

/**
 * Shared Payment History ledger for Sales and Branch Manager.
 * Route slug remains /credit-history; UI label is "Payment History".
 */
export function CreditHistoryListPage({
  navigate,
  basePath = '/branch-manager/credit-history',
  customerBasePath = null,
  showToast,
  variant = 'operations',
}) {
  const location = useLocation();
  const isSales = variant === 'sales';

  const resolvedCustomerBase = customerBasePath
    || (isSales ? '/sales/customer-detail' : basePath.replace(/\/credit-history$/, '/customers'));

  const initial = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      customerId: params.get('customerId') || params.get('customer_id') || '',
      status: params.get('status') || 'All',
      from: params.get('from') || '',
      to: params.get('to') || '',
      q: params.get('q') || '',
      method: params.get('method') || 'All',
      source: params.get('source') || 'All',
      receivedBy: params.get('received_by') || '',
      sort: params.get('sort') || 'date',
      sortDir: params.get('sort_dir') || 'desc',
      limit: Number(params.get('limit')) || DEFAULT_PAGE_SIZE,
    };
  }, [location.search]);

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    total_collected: 0,
    total_outstanding: 0,
    overdue_count: 0,
    filtered_count: 0,
  });
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(initial.q);
  const [searchDraft, setSearchDraft] = useState(initial.q);
  const [statusFilter, setStatusFilter] = useState(initial.status);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [methodFilter, setMethodFilter] = useState(initial.method);
  const [sourceFilter, setSourceFilter] = useState(initial.source);
  const [receivedBy, setReceivedBy] = useState(initial.receivedBy);
  const [receivedByDraft, setReceivedByDraft] = useState(initial.receivedBy);
  const [sort, setSort] = useState(initial.sort);
  const [sortDir, setSortDir] = useState(initial.sortDir);
  const [pageSize, setPageSize] = useState(initial.limit);
  const [customerFilterId, setCustomerFilterId] = useState(initial.customerId);
  const [customerFilterName, setCustomerFilterName] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setCustomerFilterId(initial.customerId);
    setStatusFilter(initial.status || 'All');
    setDateFrom(initial.from || '');
    setDateTo(initial.to || '');
    setSearch(initial.q || '');
    setSearchDraft(initial.q || '');
    setMethodFilter(initial.method || 'All');
    setSourceFilter(initial.source || 'All');
    setReceivedBy(initial.receivedBy || '');
    setReceivedByDraft(initial.receivedBy || '');
    setSort(initial.sort || 'date');
    setSortDir(initial.sortDir || 'desc');
    setPageSize(initial.limit || DEFAULT_PAGE_SIZE);
  }, [initial]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== search) setSearch(searchDraft);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchDraft, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (receivedByDraft !== receivedBy) setReceivedBy(receivedByDraft);
    }, 350);
    return () => clearTimeout(timer);
  }, [receivedByDraft, receivedBy]);

  const filterKey = `${customerFilterId}|${statusFilter}|${dateFrom}|${dateTo}|${search}|${methodFilter}|${sourceFilter}|${receivedBy}|${sort}|${sortDir}|${pageSize}|${reloadToken}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize,
    resetKey: filterKey,
  });

  const syncUrl = (next) => {
    const qs = buildListQuery(next);
    navigate(`${basePath}${qs}`, { replace: true });
  };

  useEffect(() => {
    syncUrl({
      customerFilterId,
      statusFilter,
      dateFrom,
      dateTo,
      search,
      methodFilter,
      sourceFilter,
      receivedBy,
      sort,
      sortDir,
      page: pagination.currentPage,
      limit: pageSize,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync from filter state only
  }, [customerFilterId, statusFilter, dateFrom, dateTo, search, methodFilter, sourceFilter, receivedBy, sort, sortDir, pagination.currentPage, pageSize]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getCreditHistory({
        customer_id: customerFilterId || undefined,
        payment_status: statusFilter !== 'All' ? statusFilter : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        q: search.trim() || undefined,
        payment_method: methodFilter !== 'All' ? methodFilter : undefined,
        payment_source: sourceFilter !== 'All' ? sourceFilter : undefined,
        received_by: receivedBy.trim() || undefined,
        sort,
        sort_dir: sortDir,
        page: pagination.currentPage,
        limit: pageSize,
      });
      if (result.success) {
        const nextRows = result.data || [];
        setRecords(nextRows);
        setTotalRecords(Number(result.pagination?.total) || nextRows.length || 0);
        setSummary({
          total_collected: Number(result.summary?.total_collected) || 0,
          total_outstanding: Number(result.summary?.total_outstanding) || 0,
          overdue_count: Number(result.summary?.overdue_count) || 0,
          filtered_count: Number(result.summary?.filtered_count ?? result.pagination?.total) || nextRows.length || 0,
        });
        if (customerFilterId && nextRows[0]?.customer_name) {
          setCustomerFilterName(nextRows[0].customer_name);
        } else if (!customerFilterId) {
          setCustomerFilterName('');
        }
      } else {
        setError(result.message || 'Failed to load payment history.');
        setRecords([]);
        setTotalRecords(0);
        showToast?.(result.message || 'Failed to load payment history', 'error');
      }
      setLoading(false);
    }
    load();
  }, [
    customerFilterId, statusFilter, dateFrom, dateTo, search, methodFilter, sourceFilter, receivedBy,
    sort, sortDir, pagination.currentPage, pageSize, reloadToken, showToast,
  ]);

  const clearCustomerFilter = () => {
    setCustomerFilterId('');
    setCustomerFilterName('');
  };

  const resetFilters = () => {
    setCustomerFilterId('');
    setCustomerFilterName('');
    setStatusFilter('All');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setSearchDraft('');
    setMethodFilter('All');
    setSourceFilter('All');
    setReceivedBy('');
    setReceivedByDraft('');
    setSort('date');
    setSortDir('desc');
  };

  const openDetail = (creditId) => {
    const qs = buildListQuery({
      customerFilterId,
      statusFilter,
      dateFrom,
      dateTo,
      search,
      methodFilter,
      sourceFilter,
      receivedBy,
      sort,
      sortDir,
      page: pagination.currentPage,
      limit: pageSize,
    });
    navigate(`${basePath}/${creditId}${qs}`);
  };

  const openCustomer = (customerId) => {
    if (!customerId) return;
    if (isSales) {
      navigate(`${resolvedCustomerBase}/${customerId}?from=customers`);
      return;
    }
    navigate(`${resolvedCustomerBase}/${customerId}`);
  };

  const toggleSort = (key) => {
    if (sort === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  const sortHint = (key) => (sort === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  if (loading && !records.length && !error) return <LoadingState message="Loading payment history…" />;
  if (error && !records.length) {
    return (
      <EmptyState
        title="Unable to load payment history"
        description={error}
        actionLabel="Retry"
        onAction={() => setReloadToken((n) => n + 1)}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        {customerFilterId ? (
          <div className="list-section-header">
            <p className="muted" style={{ margin: 0 }}>
              Filtered to {customerFilterName || `customer #${customerFilterId}`}
              {' · '}
              <button className="button ghost" type="button" style={{ padding: 0, minHeight: 0 }} onClick={clearCustomerFilter}>
                Clear customer filter
              </button>
            </p>
          </div>
        ) : null}

        <div className="list-section-toolbar">
          <div
            className="list-section-controls payment-history-filters"
            style={{ width: '100%', alignItems: 'flex-end' }}
          >
            <label className="filter-field">
              <span className="muted">Search</span>
              <input
                className="filter-input search"
                type="search"
                placeholder="Customer, receipt, invoice, reference…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSearch(searchDraft);
                }}
              />
            </label>
            <label className="filter-field">
              <span className="muted">Status</span>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {['All', 'Paid', 'Partial', 'Overdue', 'Pending', 'Void'].map((status) => (
                  <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="muted">Source</span>
              <select
                className="filter-select"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="All">All sources</option>
                <option value="spot_cash">Spot Cash (at sale)</option>
                <option value="installment">Installment collection</option>
                <option value="field">Field collection</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="muted">Received by</span>
              <input
                className="filter-input"
                type="search"
                placeholder="Name…"
                value={receivedByDraft}
                onChange={(e) => setReceivedByDraft(e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span className="muted">From</span>
              <input
                className="filter-input"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span className="muted">To</span>
              <input
                className="filter-input"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <button className="button secondary" type="button" onClick={() => setSearch(searchDraft)}>
              Search
            </button>
            <button className="button ghost" type="button" onClick={resetFilters}>
              Reset filters
            </button>
            <button
              className="button secondary"
              type="button"
              style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
              disabled={!summary.filtered_count}
              onClick={async () => {
                const exportRes = await getCreditHistory({
                  customer_id: customerFilterId || undefined,
                  payment_status: statusFilter !== 'All' ? statusFilter : undefined,
                  date_from: dateFrom || undefined,
                  date_to: dateTo || undefined,
                  q: search.trim() || undefined,
                  payment_method: methodFilter !== 'All' ? methodFilter : undefined,
                  payment_source: sourceFilter !== 'All' ? sourceFilter : undefined,
                  received_by: receivedBy.trim() || undefined,
                  sort,
                  sort_dir: sortDir,
                  page: 1,
                  limit: 1000,
                });
                const rows = exportRes.success ? (exportRes.data || []) : records;
                downloadPaymentHistoryListPdf(rows, showToast, {
                  title: isSales ? 'Payment History' : 'Branch Payment History',
                  subtitle: `Exports ${rows.length} filtered record${rows.length === 1 ? '' : 's'}`,
                });
              }}
            >
              Export PDF
            </button>
          </div>
        </div>

        {loading ? <LoadingState message="Refreshing…" /> : null}

        {!loading && records.length ? (
          <>
            <div className="corvex-table-wrapper payment-history-table-wrap">
              <table className="corvex-table payment-history-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Receipt / Invoice</th>
                    <th className="is-money">
                      <button type="button" className="th-sort" onClick={() => toggleSort('paid')}>
                        Paid{sortHint('paid')}
                      </button>
                    </th>
                    <th className="is-money">
                      <button type="button" className="th-sort" onClick={() => toggleSort('remaining')}>
                        Remaining{sortHint('remaining')}
                      </button>
                    </th>
                    <th>Method</th>
                    <th>Source</th>
                    <th>Received by</th>
                    <th>
                      <button type="button" className="th-sort" onClick={() => toggleSort('status')}>
                        Status{sortHint('status')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort" onClick={() => toggleSort('date')}>
                        Payment date{sortHint('date')}
                      </button>
                    </th>
                    <th aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.credit_id}
                      className="clickable-row"
                      onClick={() => openDetail(record.credit_id)}
                    >
                      <td>
                        <strong>{record.customer_name}</strong>
                        {record.customer_code ? (
                          <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                            {record.customer_code}
                          </span>
                        ) : null}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <CopyableStack
                          primary={record.receipt_number}
                          secondary={record.invoice_number}
                        />
                      </td>
                      <td className="is-money tabular-nums">{formatCurrency(record.payment_amount)}</td>
                      <td className={`is-money tabular-nums ${Number(record.remaining_balance) > 0 ? 'is-debt' : 'is-clear'}`}>
                        {formatCurrency(record.remaining_balance)}
                      </td>
                      <td>{record.payment_method || '—'}</td>
                      <td>{paymentSourceLabel(record)}</td>
                      <td>
                        <div className="received-by-cell">
                          <span>{receivedByLabel(record)}</span>
                          <RoleBadge role={receivedByRole(record)} />
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={paymentStatus(record)} />
                        {paymentStatus(record) === 'Overdue' && record.days_overdue != null ? (
                          <div className="muted" style={{ fontSize: '0.75rem' }}>
                            {record.days_overdue} day{Number(record.days_overdue) === 1 ? '' : 's'} overdue
                          </div>
                        ) : null}
                      </td>
                      <td>{paymentWhen(record)}</td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu
                          label="Row actions"
                          items={[
                            {
                              key: 'view',
                              label: 'View details',
                              onSelect: () => openDetail(record.credit_id),
                            },
                            {
                              key: 'receipt',
                              label: 'View receipt',
                              onSelect: () => openDetail(record.credit_id),
                            },
                            {
                              key: 'pdf',
                              label: 'Download PDF',
                              onSelect: () => downloadPaymentHistoryPdf(record, showToast),
                            },
                            record.customer_id ? {
                              key: 'customer',
                              label: 'Open customer',
                              onSelect: () => openCustomer(record.customer_id),
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
        ) : null}

        {!loading && !records.length ? (
          <EmptyState
            title="No payments match your filters"
            description={customerFilterId
              ? 'No confirmed payments for this customer with the current filters.'
              : 'Adjust or reset your filters to see payment records.'}
            actionLabel="Reset filters"
            onAction={resetFilters}
          />
        ) : null}
      </section>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="panel content-panel payment-detail-section">
      <h4 className="subsection-title" style={{ marginTop: 0 }}>{title}</h4>
      {children}
    </section>
  );
}

function DetailGrid({ rows }) {
  return (
    <dl className="payment-detail-grid">
      {rows.filter(Boolean).map((row) => (
        <div key={row.label} className="payment-detail-grid__item">
          <dt className="muted">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CreditHistoryDetailPage({
  creditId,
  navigate,
  basePath = '/branch-manager/credit-history',
  customerBasePath = null,
  showToast,
  variant = 'operations',
}) {
  const location = useLocation();
  const isSales = variant === 'sales';
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofError, setProofError] = useState(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const resolvedCustomerBase = customerBasePath
    || (isSales ? '/sales/customer-detail' : basePath.replace(/\/credit-history$/, '/customers'));
  const listReturnPath = `${basePath}${location.search || ''}`;
  const invoiceBase = isSales
    ? '/sales/invoices'
    : basePath.replace(/\/credit-history$/, '/invoices');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getCreditHistoryById(creditId);
      if (result.success && result.data) {
        setRecord(result.data);
      } else {
        setRecord(null);
        setError(result.message || 'Payment record not found.');
      }
      setLoading(false);
    }
    load();
  }, [creditId]);

  if (loading) return <LoadingState message="Loading payment record…" />;
  if (error || !record) {
    return (
      <EmptyState
        title="Record not found"
        description={error || 'This payment record does not exist or is outside your authorized scope.'}
        actionLabel="Back to Payment History"
        onAction={() => navigate(listReturnPath)}
      />
    );
  }

  const remarks = parsePaymentRemarks(record);
  const discountLabel = invoiceDiscountLabel(record);
  const method = String(record.payment_method || '').toLowerCase();
  const proofRequired = method.includes('gcash') || method.includes('bank');
  const hasProof = Boolean(record.payment_proof_image);
  const originalAmt = record.original_total_amount ?? null;
  const finalAmt = record.final_obligation ?? record.invoice_amount;

  return (
    <div className="page">
      <div className="payment-detail-actionbar">
        <button className="button ghost" type="button" onClick={() => navigate(listReturnPath)}>
          ← Payment History
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            className="button"
            type="button"
            onClick={() => downloadPaymentHistoryPdf(record, showToast)}
          >
            Download PDF
          </button>
          {record.customer_id ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (isSales) {
                  navigate(`${resolvedCustomerBase}/${record.customer_id}?from=customers`);
                } else {
                  navigate(`${resolvedCustomerBase}/${record.customer_id}`);
                }
              }}
            >
              Open Customer
            </button>
          ) : null}
          {!isSales ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                setVoidReason('');
                setVoidOpen(true);
              }}
            >
              Request void/correction
            </button>
          ) : null}
        </div>
      </div>

      <DetailSection title="Customer">
        <DetailGrid rows={[
          {
            label: 'Name',
            value: record.customer_id ? (
              <button
                type="button"
                className="button ghost"
                style={{ padding: 0, minHeight: 0 }}
                onClick={() => navigate(`${resolvedCustomerBase}/${record.customer_id}`)}
              >
                {record.customer_name || '—'}
              </button>
            ) : (record.customer_name || '—'),
          },
          { label: 'Customer code', value: record.customer_code || '—' },
          { label: 'Phone', value: record.contact_phone || '—' },
        ]}
        />
      </DetailSection>

      <DetailSection title="Invoice and receipt">
        <DetailGrid rows={[
          {
            label: 'Receipt no.',
            value: record.receipt_number ? (
              <button type="button" className="button ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => copyText(record.receipt_number)}>
                {record.receipt_number}
              </button>
            ) : '—',
          },
          {
            label: 'Invoice no.',
            value: record.invoice_number ? (
              <button
                type="button"
                className="button ghost"
                style={{ padding: 0, minHeight: 0 }}
                onClick={() => navigate(`${invoiceBase}/${encodeURIComponent(record.invoice_number)}`)}
              >
                {record.invoice_number}
              </button>
            ) : '—',
          },
          {
            label: 'Original invoice amount',
            value: originalAmt != null ? formatCurrency(originalAmt) : formatCurrency(record.invoice_amount),
          },
          discountLabel ? { label: 'Discount applied', value: discountLabel } : null,
          {
            label: 'Final invoice amount',
            value: formatCurrency(finalAmt),
          },
        ]}
        />
        {originalAmt != null && Number(finalAmt) !== Number(originalAmt) ? (
          <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
            Paid amount uses the discounted final cash price
            ({formatCurrency(originalAmt)} − {formatCurrency(record.discount_amount || 0)} = {formatCurrency(finalAmt)}).
          </p>
        ) : null}
      </DetailSection>

      <DetailSection title="Payment">
        <DetailGrid rows={[
          { label: 'Previous balance', value: formatCurrency(record.previous_balance) },
          { label: 'Amount paid', value: <strong className="tabular-nums">{formatCurrency(record.payment_amount)}</strong> },
          { label: 'Remaining balance', value: <strong className="tabular-nums">{formatCurrency(record.remaining_balance)}</strong> },
          {
            label: 'Payment status',
            value: (
              <>
                <StatusBadge status={paymentStatus(record)} />
                {paymentStatus(record) === 'Overdue' && record.days_overdue != null ? (
                  <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                    {record.days_overdue} days overdue
                  </span>
                ) : null}
              </>
            ),
          },
          { label: 'Payment date/time', value: paymentWhen(record) },
          { label: 'Payment method', value: record.payment_method || '—' },
          { label: 'Payment type / source', value: remarks.paymentType },
          {
            label: 'Reference number',
            value: remarks.referenceNumber ? (
              <button type="button" className="button ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => copyText(remarks.referenceNumber)}>
                {remarks.referenceNumber}
              </button>
            ) : '—',
          },
          { label: 'Remarks', value: remarks.freeText || (remarks.raw && !remarks.referenceNumber ? remarks.raw : '—') },
        ]}
        />
      </DetailSection>

      <DetailSection title="Proof of payment">
        {hasProof ? (
          <div className="payment-proof-block">
            <button type="button" className="payment-proof-thumb" onClick={() => { setProofError(null); setProofOpen(true); }}>
              <img
                src={record.payment_proof_image}
                alt="Payment proof"
                onError={() => setProofError('Proof image failed to load.')}
              />
            </button>
            <div>
              <p className="muted" style={{ margin: 0 }}>Click to open lightbox · uploaded with this payment</p>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                Received by {receivedByLabel(record)} · {paymentWhen(record)}
              </p>
              {proofError ? (
                <p className="form-error">
                  {proofError}{' '}
                  <button className="button ghost" type="button" onClick={() => { setProofError(null); setProofOpen(true); }}>
                    Retry
                  </button>
                </p>
              ) : null}
            </div>
          </div>
        ) : proofRequired ? (
          <p className="muted">No proof uploaded.</p>
        ) : (
          <p className="muted">Not required for {record.payment_method || 'this method'}.</p>
        )}
      </DetailSection>

      <DetailSection title="Handled by">
        <DetailGrid rows={[
          {
            label: 'Received by',
            value: (
              <span className="received-by-cell">
                {receivedByLabel(record)}
                <RoleBadge role={receivedByRole(record)} />
              </span>
            ),
          },
          { label: 'Branch', value: record.branch_name || '—' },
        ]}
        />
      </DetailSection>

      <ProofLightbox
        open={proofOpen}
        src={record.payment_proof_image}
        title="Proof of payment"
        meta={`${receivedByLabel(record)}${receivedByRole(record) ? ` · ${receivedByRole(record)}` : ''} · ${paymentWhen(record)}`}
        error={proofError}
        onRetry={() => setProofError(null)}
        onDownload={() => { logPaymentProofAccess(creditId, 'download'); }}
        onClose={() => setProofOpen(false)}
      />

      {voidOpen ? (
        <div
          className="modal-overlay modal-overlay--elevated"
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-request-title"
          onClick={() => !voidBusy && setVoidOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="void-request-title">Request void/correction</h3>
            </div>
            <p className="muted">
              Payments are immutable here. This records a request with your reason in the audit trail;
              it does not change the payment.
            </p>
            <label className="filter-field" style={{ display: 'block' }}>
              <span className="muted">Reason (required)</span>
              <textarea
                className="filter-input"
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Explain why this payment needs void or correction…"
                style={{ width: '100%', marginTop: 6 }}
              />
            </label>
            {voidReason.trim().length > 0 && voidReason.trim().length < 8 ? (
              <p className="form-error">Reason must be at least 8 characters.</p>
            ) : null}
            <div className="modal-actions">
              <button className="button secondary" type="button" disabled={voidBusy} onClick={() => setVoidOpen(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                disabled={voidBusy || voidReason.trim().length < 8}
                onClick={async () => {
                  setVoidBusy(true);
                  const result = await requestPaymentVoidCorrection(creditId, voidReason.trim());
                  setVoidBusy(false);
                  if (result.success) {
                    showToast?.(result.message || 'Void/correction request recorded.', 'success');
                    setVoidOpen(false);
                  } else {
                    showToast?.(result.message || 'Request failed.', 'error');
                  }
                }}
              >
                {voidBusy ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Compatibility export for older call sites. */
export function PaymentDetailRows({ record }) {
  return (
    <DetailGrid rows={[
      { label: 'Customer', value: record.customer_name || '—' },
      { label: 'Amount Paid', value: formatCurrency(record.payment_amount) },
      { label: 'Status', value: <StatusBadge status={paymentStatus(record)} /> },
      { label: 'Payment Date', value: formatDisplayDate(record.transaction_date) },
    ]}
    />
  );
}
