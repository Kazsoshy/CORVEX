import { Pagination } from '../shared/Pagination';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCreditHistory, getCreditHistoryById } from '../../api/reportsService';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { StatsGrid } from '../shared/StatsGrid';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';
import { downloadPdf } from '../../utils/dataExport.js';

function dash(value) {
  return value == null || value === '' ? '—' : String(value);
}

function paymentStatus(record) {
  return record?.display_status || record?.payment_status || '—';
}

function receiptOrInvoice(record) {
  if (record?.receipt_number && record?.invoice_number) {
    return `${record.receipt_number} · ${record.invoice_number}`;
  }
  return record?.receipt_number || record?.invoice_number || '—';
}

function buildListQuery({
  customerFilterId,
  statusFilter,
  dateFrom,
  dateTo,
  search,
}) {
  const params = new URLSearchParams();
  if (customerFilterId) params.set('customerId', String(customerFilterId));
  if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
  if (dateFrom) params.set('from', dateFrom);
  if (dateTo) params.set('to', dateTo);
  if (search.trim()) params.set('q', search.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function buildPaymentHistoryPdfRows(record) {
  if (!record) return [];
  return [
    { Field: 'Customer', Value: dash(record.customer_name) },
    { Field: 'Customer Code', Value: dash(record.customer_code) },
    { Field: 'Branch', Value: dash(record.branch_name) },
    { Field: 'Receipt', Value: dash(record.receipt_number) },
    { Field: 'Invoice', Value: dash(record.invoice_number) },
    { Field: 'Original Invoice Amount', Value: formatCurrency(record.invoice_amount) },
    { Field: 'Previous Outstanding', Value: formatCurrency(record.previous_balance) },
    { Field: 'Amount Paid', Value: formatCurrency(record.payment_amount) },
    { Field: 'Remaining Balance', Value: formatCurrency(record.remaining_balance) },
    { Field: 'Payment Status', Value: dash(paymentStatus(record)) },
    { Field: 'Payment Date', Value: formatDisplayDate(record.transaction_date) },
    { Field: 'Payment Method', Value: dash(record.payment_method) },
    { Field: 'Collector', Value: dash(record.collector_name) },
    { Field: 'Remarks', Value: dash(record.collection_notes) },
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
      Collector: dash(record.collector_name),
      Status: dash(paymentStatus(record)),
      Date: formatDisplayDate(record.transaction_date),
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

export function PaymentDetailRows({ record }) {
  return (
    <DetailRowsTable
      rows={[
        { label: 'Customer', value: record.customer_name || '—' },
        ...(record.customer_code ? [{ label: 'Customer Code', value: record.customer_code }] : []),
        { label: 'Receipt Number', value: record.receipt_number || '—' },
        { label: 'Invoice Number', value: record.invoice_number || '—' },
        {
          label: 'Original Invoice Amount',
          value: record.invoice_amount != null ? formatCurrency(record.invoice_amount) : 'Not available',
        },
        {
          label: 'Previous Outstanding Balance',
          value: record.previous_balance != null ? formatCurrency(record.previous_balance) : 'Not available',
        },
        {
          label: 'Amount Paid',
          value: <span style={{ fontWeight: 700, color: 'var(--palette-navy)' }}>{formatCurrency(record.payment_amount)}</span>,
        },
        {
          label: 'Remaining Outstanding Balance',
          value: (
            <span style={{
              fontWeight: 700,
              color: Number(record.remaining_balance) > 0 ? '#dc2626' : '#2A9B6A',
            }}
            >
              {formatCurrency(record.remaining_balance)}
            </span>
          ),
        },
        { label: 'Payment Status', value: <StatusBadge status={paymentStatus(record)} /> },
        { label: 'Payment Date', value: formatDisplayDate(record.transaction_date) },
        { label: 'Payment Method', value: record.payment_method || '—' },
        { label: 'Collector', value: record.collector_name || '—' },
        { label: 'Remarks', value: record.collection_notes || '—' },
        ...(record.branch_name ? [{ label: 'Branch', value: record.branch_name }] : []),
      ]}
    />
  );
}

/**
 * Shared Payment History ledger for Sales and Branch Manager.
 * @param {'sales'|'operations'} variant
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
  const pageTitle = 'Payment History';
  const pageSubtitle = isSales
    ? 'Review payment records and outstanding balances for your assigned customers.'
    : 'Monitor customer payment records and outstanding balances across your branch.';

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
    };
  }, [location.search]);

  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(initial.q);
  const [searchDraft, setSearchDraft] = useState(initial.q);
  const [statusFilter, setStatusFilter] = useState(initial.status);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [customerFilterId, setCustomerFilterId] = useState(initial.customerId);
  const [customerFilterName, setCustomerFilterName] = useState('');

  useEffect(() => {
    setCustomerFilterId(initial.customerId);
    setStatusFilter(initial.status || 'All');
    setDateFrom(initial.from || '');
    setDateTo(initial.to || '');
    setSearch(initial.q || '');
    setSearchDraft(initial.q || '');
  }, [initial.customerId, initial.status, initial.from, initial.to, initial.q]);

  const filterKey = `${customerFilterId}|${statusFilter}|${dateFrom}|${dateTo}|${search}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterKey,
  });

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
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
      });
      if (result.success) {
        const nextRows = result.data || [];
        setRecords(nextRows);
        setTotalRecords(Number(result.pagination?.total) || nextRows.length || 0);
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
  }, [customerFilterId, statusFilter, dateFrom, dateTo, search, pagination.currentPage, showToast]);

  const syncUrl = (next) => {
    const qs = buildListQuery(next);
    navigate(`${basePath}${qs}`, { replace: true });
  };

  const clearCustomerFilter = () => {
    setCustomerFilterId('');
    setCustomerFilterName('');
    syncUrl({
      customerFilterId: '',
      statusFilter,
      dateFrom,
      dateTo,
      search,
    });
  };

  const openDetail = (creditId) => {
    const qs = buildListQuery({
      customerFilterId,
      statusFilter,
      dateFrom,
      dateTo,
      search,
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

  if (loading && !records.length) return <LoadingState message="Loading payment history…" />;
  if (error && !records.length) {
    return (
      <EmptyState
        title="Unable to load payment history"
        description={error}
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>{pageTitle}</h3>
            <p className="muted">{pageSubtitle}</p>
            {customerFilterId ? (
              <p className="muted" style={{ marginTop: 8 }}>
                Filtered to {customerFilterName || `customer #${customerFilterId}`}
                {' · '}
                <button className="button ghost" type="button" style={{ padding: 0, minHeight: 0 }} onClick={clearCustomerFilter}>
                  Clear customer filter
                </button>
              </p>
            ) : null}
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={!records.length}
            onClick={() => downloadPaymentHistoryListPdf(records, showToast, {
              title: isSales ? 'Payment History' : 'Branch Payment History',
              subtitle: isSales
                ? 'Authorized customer payments'
                : 'Branch export · current filters applied',
            })}
          >
            {isSales ? 'Export PDF' : 'Export Branch PDF'}
          </button>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search customer, receipt, invoice, or collector"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearch(searchDraft);
                  syncUrl({
                    customerFilterId,
                    statusFilter,
                    dateFrom,
                    dateTo,
                    search: searchDraft,
                  });
                }
              }}
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(next);
                syncUrl({
                  customerFilterId,
                  statusFilter: next,
                  dateFrom,
                  dateTo,
                  search,
                });
              }}
              aria-label="Payment status"
            >
              {['All', 'Paid', 'Partial', 'Overdue'].map((status) => (
                <option key={status} value={status}>{status === 'All' ? 'All Statuses' : status}</option>
              ))}
            </select>
            <input
              className="filter-input"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                const next = e.target.value;
                setDateFrom(next);
                syncUrl({
                  customerFilterId,
                  statusFilter,
                  dateFrom: next,
                  dateTo,
                  search,
                });
              }}
              aria-label="From date"
            />
            <input
              className="filter-input"
              type="date"
              value={dateTo}
              onChange={(e) => {
                const next = e.target.value;
                setDateTo(next);
                syncUrl({
                  customerFilterId,
                  statusFilter,
                  dateFrom,
                  dateTo: next,
                  search,
                });
              }}
              aria-label="To date"
            />
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                setSearch(searchDraft);
                syncUrl({
                  customerFilterId,
                  statusFilter,
                  dateFrom,
                  dateTo,
                  search: searchDraft,
                });
              }}
            >
              Search
            </button>
          </div>
        </div>

        {records.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Receipt / Invoice</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Collector</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
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
                      <td>{receiptOrInvoice(record)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--palette-navy)' }}>
                        {formatCurrency(record.payment_amount)}
                      </td>
                      <td style={{
                        fontWeight: 600,
                        color: Number(record.remaining_balance) > 0 ? '#dc2626' : '#2A9B6A',
                      }}
                      >
                        {formatCurrency(record.remaining_balance)}
                      </td>
                      <td>{record.collector_name || '—'}</td>
                      <td><StatusBadge status={paymentStatus(record)} /></td>
                      <td>{formatDisplayDate(record.transaction_date)}</td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View details"
                          aria-label={`View payment for ${record.customer_name}`}
                          onClick={() => openDetail(record.credit_id)}
                        >
                          <NavIcon name="view" />
                        </button>
                        {record.customer_id ? (
                          <button
                            className="icon-action-button"
                            type="button"
                            title="Open customer"
                            aria-label={`Open customer ${record.customer_name}`}
                            onClick={() => openCustomer(record.customer_id)}
                          >
                            <NavIcon name="accounts" />
                          </button>
                        ) : null}
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Download PDF"
                          aria-label={`Download PDF for ${record.customer_name}`}
                          onClick={() => downloadPaymentHistoryPdf(record, showToast)}
                        >
                          <NavIcon name="download" />
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
            title="No payments found"
            description={customerFilterId
              ? 'No confirmed payments for this customer yet.'
              : 'Adjust your search or filters.'}
          />
        )}
      </section>
    </div>
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

  const resolvedCustomerBase = customerBasePath
    || (isSales ? '/sales/customer-detail' : basePath.replace(/\/credit-history$/, '/customers'));

  const listReturnPath = `${basePath}${location.search || ''}`;

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

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Payment Details</h3>
          <p className="muted">
            {record.customer_name}
            {record.receipt_number ? ` · ${record.receipt_number}` : ''}
          </p>
        </div>
      </section>

      <StatsGrid
        stats={[
          { label: 'Amount Paid', value: formatCurrency(record.payment_amount) },
          { label: 'Remaining Balance', value: formatCurrency(record.remaining_balance) },
          { label: 'Status', value: <StatusBadge status={paymentStatus(record)} /> },
          { label: 'Payment Date', value: formatDisplayDate(record.transaction_date) },
        ]}
      />

      <section className="panel content-panel relative overflow-hidden">
        <PaymentDetailRows record={record} />
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button
          className="button secondary"
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
        {isSales && record.customer_id ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/sales/customers`)}
          >
            Customers
          </button>
        ) : null}
        <button className="button ghost" type="button" onClick={() => navigate(listReturnPath)}>
          Back to Payment History
        </button>
      </div>
    </div>
  );
}
