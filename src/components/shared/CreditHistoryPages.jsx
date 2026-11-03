import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCreditHistory } from '../../api/reportsService';
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

function buildPaymentHistoryPdfRows(record) {
  if (!record) return [];
  return [
    { Field: 'Customer', Value: dash(record.customer_name) },
    { Field: 'Customer Code', Value: dash(record.customer_code) },
    { Field: 'Branch', Value: dash(record.branch_name) },
    { Field: 'Receipt', Value: dash(record.receipt_number) },
    { Field: 'Invoice', Value: dash(record.invoice_number) },
    { Field: 'Original Invoice Amount', Value: formatCurrency(record.invoice_amount) },
    { Field: 'Amount Paid', Value: formatCurrency(record.payment_amount) },
    { Field: 'Remaining Balance', Value: formatCurrency(record.remaining_balance) },
    { Field: 'Payment Status', Value: dash(paymentStatus(record)) },
    { Field: 'Payment Date', Value: formatDisplayDate(record.transaction_date) },
    { Field: 'Payment Method', Value: dash(record.payment_method) },
    { Field: 'Collector / Recorded By', Value: dash(record.collector_name) },
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

function PaymentDetailRows({ record }) {
  return (
    <DetailRowsTable
      rows={[
        { label: 'Customer', value: record.customer_name || '—' },
        ...(record.customer_code ? [{ label: 'Customer Code', value: record.customer_code }] : []),
        { label: 'Payment Reference / Receipt', value: record.receipt_number || '—' },
        { label: 'Related Invoice', value: record.invoice_number || '—' },
        {
          label: 'Original Invoice Amount',
          value: record.invoice_amount != null ? formatCurrency(record.invoice_amount) : 'Not available',
        },
        {
          label: 'Amount Paid',
          value: <span style={{ fontWeight: 700, color: 'var(--palette-navy)' }}>{formatCurrency(record.payment_amount)}</span>,
        },
        {
          label: 'Remaining Balance',
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
        { label: 'Collector / Recorded By', value: record.collector_name || '—' },
        { label: 'Remarks', value: record.collection_notes || '—' },
        ...(record.branch_name ? [{ label: 'Branch', value: record.branch_name }] : []),
      ]}
    />
  );
}

/**
 * Shared Payment History / Credit History ledger view.
 * @param {'sales'|'operations'} variant
 */
export function CreditHistoryListPage({
  navigate,
  basePath = '/branch-manager/credit-history',
  showToast,
  variant = 'operations',
}) {
  const location = useLocation();
  const isSales = variant === 'sales';
  const pageTitle = isSales ? 'Payment History' : 'Credit History';
  const pageSubtitle = isSales
    ? 'Payments collectors confirmed for customers in your branch.'
    : 'Payment ledger for customers in your branch.';

  const initialCustomerId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('customerId') || params.get('customer_id') || '';
  }, [location.search]);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerFilterId, setCustomerFilterId] = useState(initialCustomerId);
  const [customerFilterName, setCustomerFilterName] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    setCustomerFilterId(initialCustomerId);
  }, [initialCustomerId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getCreditHistory({
        customer_id: customerFilterId || undefined,
        payment_status: statusFilter !== 'All' ? statusFilter : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 500,
      });
      if (result.success) {
        const nextRows = result.data || [];
        setRecords(nextRows);
        if (customerFilterId && nextRows[0]?.customer_name) {
          setCustomerFilterName(nextRows[0].customer_name);
        } else if (!customerFilterId) {
          setCustomerFilterName('');
        }
      } else {
        setError(result.message || 'Failed to load payment history.');
        showToast?.(result.message || 'Failed to load payment history', 'error');
      }
      setLoading(false);
    }
    load();
  }, [customerFilterId, statusFilter, dateFrom, dateTo, showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((record) => {
      const haystack = [
        record.customer_name,
        record.customer_code,
        record.receipt_number,
        record.invoice_number,
      ].map((value) => String(value || '').toLowerCase());
      return haystack.some((value) => value.includes(q));
    });
  }, [records, search]);

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${statusFilter}|${dateFrom}|${dateTo}|${customerFilterId}`,
  });
  const rows = pagination.paginatedData;

  const clearCustomerFilter = () => {
    setCustomerFilterId('');
    setCustomerFilterName('');
    navigate(basePath);
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
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search customer, receipt, or invoice"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <input
              className="filter-input"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />
          </div>
        </div>

        {filtered.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Receipt / Invoice</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr
                      key={record.credit_id}
                      className="clickable-row"
                      onClick={() => (isSales
                        ? navigate(`${basePath}/${record.credit_id}`)
                        : setSelectedRecord(record))}
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
                      <td><StatusBadge status={paymentStatus(record)} /></td>
                      <td>{formatDisplayDate(record.transaction_date)}</td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View details"
                          aria-label={`View payment for ${record.customer_name}`}
                          onClick={() => (isSales
                            ? navigate(`${basePath}/${record.credit_id}`)
                            : setSelectedRecord(record))}
                        >
                          <NavIcon name="view" />
                        </button>
                        {!isSales ? (
                          <button
                            className="icon-action-button"
                            type="button"
                            title="Download PDF"
                            aria-label={`Download PDF for ${record.customer_name}`}
                            onClick={() => downloadPaymentHistoryPdf(record, showToast)}
                          >
                            <NavIcon name="download" />
                          </button>
                        ) : null}
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

      {!isSales && selectedRecord ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-history-detail-title"
          onClick={() => setSelectedRecord(null)}
        >
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3 id="payment-history-detail-title" style={{ margin: 0 }}>Payment Details</h3>
                <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                  {selectedRecord.customer_name}
                  {selectedRecord.receipt_number ? ` · ${selectedRecord.receipt_number}` : ''}
                </p>
              </div>
              <StatusBadge status={paymentStatus(selectedRecord)} />
            </div>
            <PaymentDetailRows record={selectedRecord} />
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => downloadPaymentHistoryPdf(selectedRecord, showToast)}
              >
                Download PDF
              </button>
              <button className="button" type="button" onClick={() => setSelectedRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CreditHistoryDetailPage({
  creditId,
  navigate,
  basePath = '/branch-manager/credit-history',
  showToast,
  variant = 'operations',
}) {
  const isSales = variant === 'sales';
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getCreditHistory({ limit: 1000 });
      if (result.success) {
        const found = (result.data || []).find((row) => String(row.credit_id) === String(creditId));
        if (found) setRecord(found);
        else setError('Payment record not found.');
      } else {
        setError(result.message || 'Failed to load record.');
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
        description={error || 'This payment record does not exist.'}
        actionLabel={isSales ? 'Back to Payment History' : 'Back to Credit History'}
        onAction={() => navigate(basePath)}
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
        {!isSales ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => downloadPaymentHistoryPdf(record, showToast)}
          >
            Download PDF
          </button>
        ) : null}
        {record.customer_id && isSales ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/sales/customer-detail/${record.customer_id}?from=customers`)}
          >
            Customer Details
          </button>
        ) : null}
        <button className="button ghost" type="button" onClick={() => navigate(basePath)}>
          {isSales ? 'Back to Payment History' : 'Back to Credit History'}
        </button>
      </div>
    </div>
  );
}
