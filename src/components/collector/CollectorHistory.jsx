import { useEffect, useMemo, useState } from 'react';
import {
  fetchCollectionPayments,
  fetchCollectionPaymentById,
  fetchDigitalReceiptById,
  sendReceiptToCustomer,
} from '../../api/collectorService';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import { formatCustomerDisplayId } from '../../utils/customerDisplay';
import {
  formatCurrency,
  formatDisplayDate,
  formatPaymentTimestamp,
  formatPhone,
} from '../../utils/formatters.js';
import { downloadPdf } from '../../utils/dataExport';
import { usePagination } from '../../hooks/usePagination';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysAgo(n) {
  const d = new Date(`${manilaToday()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function customerCodeOf(row) {
  return formatCustomerDisplayId({ customer_code: row?.customer_code });
}

function historyPdfRow(payment) {
  return {
    receipt_number: payment.receipt_number || '—',
    date_time: formatPaymentTimestamp(payment.payment_date, payment.payment_time),
    customer: [
      payment.customer_name || '—',
      payment.customer_code ? `(${payment.customer_code})` : null,
    ].filter(Boolean).join(' '),
    method: payment.payment_method || '—',
    amount: formatCurrency(Number(payment.amount)),
    status: payment.status || '—',
  };
}

function paymentDetailPdfRow(payment) {
  return {
    receipt_number: payment.receipt_number || '—',
    status: payment.status || '—',
    amount: formatCurrency(Number(payment.amount)),
    payment_method: payment.payment_method || '—',
    date_time: formatPaymentTimestamp(payment.payment_date, payment.payment_time),
    customer: payment.customer_name || '—',
    customer_code: payment.customer_code || '—',
    branch: payment.branch_name || '—',
    notes: payment.notes || '',
  };
}

function receiptVoucherPdfRows(receipt) {
  const rows = [
    { field: 'Branch', value: receipt.branch_name || '—' },
    { field: 'Receipt Number', value: receipt.receipt_number || '—' },
    { field: 'Date & Time', value: formatPaymentTimestamp(receipt.payment_date, receipt.payment_time) },
    { field: 'Payment Status', value: receipt.payment_status || '—' },
    { field: 'Customer', value: receipt.customer_name || '—' },
    { field: 'Customer Code', value: receipt.customer_code || '—' },
    { field: 'Address', value: receipt.customer_address || '—' },
    { field: 'Phone', value: receipt.customer_phone || '—' },
    { field: 'Amount Collected', value: formatCurrency(Number(receipt.amount)) },
    { field: 'Payment Method', value: receipt.payment_method || '—' },
  ];
  if (receipt.previous_balance != null) {
    rows.push({ field: 'Previous Balance', value: formatCurrency(Number(receipt.previous_balance)) });
  }
  if (receipt.remaining_balance != null) {
    rows.push({ field: 'Remaining Balance', value: formatCurrency(Number(receipt.remaining_balance)) });
  }
  rows.push({ field: 'Collected By', value: receipt.generated_by_name || '—' });
  if (receipt.notes) rows.push({ field: 'Notes', value: receipt.notes });
  return rows;
}

export function ReceiptsRedirectPage({ navigate }) {
  useEffect(() => {
    navigate('/collector/history', { replace: true });
  }, [navigate]);
  return <LoadingState message="Opening Collection History..." />;
}

export function CollectionHistoryPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState(() => daysAgo(30));
  const [dateTo, setDateTo] = useState(() => manilaToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [devicePayments, setDevicePayments] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchCollectionPayments();
      if (result.success) setPayments(result.data || []);
      else setError(result.message || 'Failed to load collection payments.');
      setDevicePayments(await loadWaiting('collection_payment'));
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((p) => {
      const matchesSearch = !query
        || (p.customer_name || '').toLowerCase().includes(query)
        || (p.receipt_number || '').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const payDate = String(p.payment_date || '').slice(0, 10);
      const matchesFrom = !dateFrom || payDate >= dateFrom;
      const matchesTo = !dateTo || payDate <= dateTo;
      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [payments, search, statusFilter, dateFrom, dateTo]);

  const filtersActive = Boolean(
    search.trim()
    || statusFilter !== 'All'
    || dateFrom !== daysAgo(30)
    || dateTo !== manilaToday()
  );

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setDateFrom(daysAgo(30));
    setDateTo(manilaToday());
  };

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${statusFilter}|${dateFrom}|${dateTo}`,
  });

  const exportFilteredPdf = () => {
    const rows = filtered.map(historyPdfRow);
    if (downloadPdf(rows, {
      filename: 'collection-history.pdf',
      title: 'Collection History',
      subtitle: getUserAssignedLocation(currentUser),
      columns: [
        { key: 'receipt_number', label: 'Receipt Number' },
        { key: 'date_time', label: 'Date & Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'method', label: 'Method' },
        { key: 'amount', label: 'Amount' },
        { key: 'status', label: 'Status' },
      ],
    })) {
      showToast('Collection history exported as PDF.', 'success');
    } else {
      showToast('Nothing to export.', 'error');
    }
  };

  if (loading) return <LoadingState message="Loading collection history..." />;
  if (error && !payments.length) {
    return (
      <div className="page">
        <DeviceQueue rows={devicePayments} />
        <EmptyState
          title="Unable to load collection history"
          description={error}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <DeviceQueue rows={devicePayments} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Collection History</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Payments you recorded in the field for your branch in {getUserAssignedLocation(currentUser)} — open any record to view, print, or send its digital receipt.
          </p>
        </div>

        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search by receipt number or customer name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search collection history"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {['All', 'Pending', 'Completed', 'Cancelled'].map((option) => (
                <option key={option} value={option}>Status: {option}</option>
              ))}
            </select>
            <input className="filter-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input className="filter-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
            {filtersActive ? (
              <button className="button ghost" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button secondary whitespace-nowrap" type="button" onClick={exportFilteredPdf}>
              Export PDF
            </button>
          </div>
        </div>

        {filtered.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Date & Time</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((p) => {
                    const code = customerCodeOf(p);
                    const detailPath = `/collector/history/${p.collectionpayment_id}`;
                    return (
                      <tr
                        key={p.collectionpayment_id}
                        className="clickable-row"
                        onClick={() => navigate(detailPath)}
                      >
                        <td>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                            {p.receipt_number || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {formatPaymentTimestamp(p.payment_date, p.payment_time)}
                        </td>
                        <td>
                          <strong>{p.customer_name || '—'}</strong>
                          {code !== '—' ? (
                            <div className="muted" style={{ fontSize: '0.78rem' }}>{code}</div>
                          ) : null}
                        </td>
                        <td>{p.payment_method || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(Number(p.amount))}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View Details"
                            onClick={() => navigate(detailPath)}
                          >
                            <NavIcon name="view" />
                          </button>
                          {p.receipts_id ? (
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Open Receipt"
                              onClick={() => navigate(`/collector/receipts/${p.receipts_id}`)}
                            >
                              <NavIcon name="receipt" />
                            </button>
                          ) : null}
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
            title={payments.length ? 'No collections match these filters' : 'No collections recorded yet'}
            description={
              payments.length
                ? 'Adjust search, status, or date range.'
                : 'Collections logged from Today\'s Route will appear here.'
            }
            actionLabel={payments.length ? 'Clear filters' : undefined}
            onAction={payments.length ? clearFilters : undefined}
          />
        )}
      </section>
    </div>
  );
}

export function CollectionPaymentDetailPage({ paymentId, navigate, showToast }) {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchCollectionPaymentById(paymentId);
      if (result.success) setPayment(result.data);
      else {
        setPayment(null);
        showToast?.(result.message || 'Payment not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [paymentId, showToast]);

  if (loading) return <LoadingState message="Loading payment details..." />;
  if (!payment) {
    return (
      <EmptyState
        title="Payment not found"
        actionLabel="Back to Collection History"
        onAction={() => navigate('/collector/history')}
      />
    );
  }

  const code = customerCodeOf(payment);
  const allocations = Array.isArray(payment.allocations)
    ? payment.allocations.filter((row) => row.invoice_number || row.sales_id)
    : [];
  const canSend = Boolean(payment.receipts_id) && payment.status === 'Completed';

  const exportDetailPdf = () => {
    if (downloadPdf([paymentDetailPdfRow(payment)], {
      filename: `collection-${payment.receipt_number || payment.collectionpayment_id}.pdf`,
      title: 'Collection Payment',
      subtitle: payment.receipt_number || undefined,
      columns: [
        { key: 'receipt_number', label: 'Receipt Number' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Amount' },
        { key: 'payment_method', label: 'Payment Method' },
        { key: 'date_time', label: 'Date & Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'customer_code', label: 'Customer Code' },
        { key: 'branch', label: 'Branch' },
        { key: 'notes', label: 'Notes' },
      ],
    })) {
      showToast('Payment exported as PDF.', 'success');
    }
  };

  const handleSend = async () => {
    if (!payment.receipts_id || sending) return;
    setSending(true);
    const result = await sendReceiptToCustomer(payment.receipts_id);
    setSending(false);
    if (result.success) showToast(result.message || 'Receipt sent.', 'success');
    else showToast(result.message || 'Could not send receipt.', 'error');
  };

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Payment Detail</h3>
          <p className="muted">Business record for this collection — open the digital receipt when available.</p>
        </div>
        <DetailRowsTable
          rows={[
            {
              label: 'Receipt Number',
              value: <span style={{ fontFamily: 'monospace' }}>{payment.receipt_number || '—'}</span>,
            },
            { label: 'Status', value: <StatusBadge status={payment.status} /> },
            {
              label: 'Amount',
              value: <span style={{ fontWeight: 700 }}>{formatCurrency(Number(payment.amount))}</span>,
            },
            { label: 'Payment Method', value: payment.payment_method || '—' },
            {
              label: 'Date & Time',
              value: formatPaymentTimestamp(payment.payment_date, payment.payment_time),
            },
            {
              label: 'Customer',
              value: (
                <button
                  className="button ghost"
                  type="button"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => navigate(`/collector/account-detail/${payment.customer_id}?from=accounts`)}
                >
                  {payment.customer_name || '—'}
                  {code !== '—' ? ` · ${code}` : ''}
                </button>
              ),
            },
            { label: 'Branch', value: payment.branch_name || '—' },
            ...(payment.notes ? [{ label: 'Notes', value: payment.notes }] : []),
            ...(payment.reference_number
              ? [{ label: 'Reference', value: payment.reference_number }]
              : []),
          ]}
        />
      </section>

      {allocations.length ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Invoices Applied</h3>
          </div>
          <div className="table-shell">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Applied Amount</th>
                  <th>Remaining Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((row) => (
                  <tr key={row.credit_id}>
                    <td>{row.invoice_number || 'Unallocated'}</td>
                    <td>{formatCurrency(Number(row.applied_amount))}</td>
                    <td>{formatCurrency(Number(row.remaining_balance))}</td>
                    <td><StatusBadge status={row.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/collector/history')}>
          Back to Collection History
        </button>
        {payment.receipts_id ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/collector/receipts/${payment.receipts_id}`)}
          >
            Open Digital Receipt
          </button>
        ) : null}
        {payment.receipts_id ? (
          <button
            className="button secondary"
            type="button"
            disabled={!canSend || sending}
            title={
              payment.status !== 'Completed'
                ? 'Only completed payments can be sent.'
                : 'Send receipt to customer portal'
            }
            onClick={handleSend}
          >
            {sending ? 'Sending…' : 'Send Receipt to Customer'}
          </button>
        ) : null}
        <button className="button" type="button" onClick={exportDetailPdf}>
          Export PDF
        </button>
      </div>
    </div>
  );
}

export function DigitalReceiptPage({ receiptId, navigate, showToast }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      if (!receiptId) {
        setError('No receipt ID provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const result = await fetchDigitalReceiptById(receiptId);
      if (result.success && result.data) setReceipt(result.data);
      else {
        setError(result.message || 'Receipt not found.');
        showToast?.(result.message || 'Receipt not found', 'error');
      }
      setLoading(false);
    }
    load();
  }, [receiptId, showToast]);

  if (loading) return <LoadingState message="Loading receipt..." />;
  if (error || !receipt) {
    return (
      <EmptyState
        title="Receipt not found"
        description={error || 'This receipt does not exist.'}
        actionLabel="Back to Collection History"
        onAction={() => navigate('/collector/history')}
      />
    );
  }

  const code = customerCodeOf(receipt);
  const canSend = receipt.payment_status === 'Completed';

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    const result = await sendReceiptToCustomer(receipt.receipts_id);
    setSending(false);
    if (result.success) showToast(result.message || 'Receipt sent.', 'success');
    else showToast(result.message || 'Could not send receipt.', 'error');
  };

  const exportReceiptPdf = () => {
    if (downloadPdf(receiptVoucherPdfRows(receipt), {
      filename: `receipt-${receipt.receipt_number || receipt.receipts_id}.pdf`,
      title: 'Official Digital Receipt',
      subtitle: receipt.receipt_number || undefined,
      columns: [
        { key: 'field', label: 'Field' },
        { key: 'value', label: 'Value' },
      ],
    })) {
      showToast('Receipt exported as PDF.', 'success');
    }
  };

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Official Digital Receipt</h3>
          <p className="muted">Printable voucher linked to Collection History.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 16 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem' }}>
            {receipt.receipt_number || '—'}
          </span>
          <StatusBadge status={receipt.payment_status} />
          <span className="muted">{formatDisplayDate(receipt.receipt_date)}</span>
          <span style={{ fontWeight: 700, marginLeft: 'auto' }}>
            {formatCurrency(Number(receipt.amount))}
          </span>
        </div>

        <div
          className="receipt-slip"
          style={{
            border: '1px solid #BADBE9',
            borderRadius: 12,
            padding: 20,
            background: '#fff',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Receipt Header
            </div>
            <DetailRowsTable
              rows={[
                { label: 'Branch', value: receipt.branch_name || '—' },
                { label: 'Receipt Number', value: <span style={{ fontFamily: 'monospace' }}>{receipt.receipt_number || '—'}</span> },
                {
                  label: 'Date & Time',
                  value: formatPaymentTimestamp(receipt.payment_date, receipt.payment_time),
                },
                { label: 'Payment Status', value: <StatusBadge status={receipt.payment_status} /> },
              ]}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Received From
            </div>
            <DetailRowsTable
              rows={[
                { label: 'Customer', value: receipt.customer_name || '—' },
                { label: 'Customer Code', value: code },
                { label: 'Address', value: receipt.customer_address || '—' },
                { label: 'Phone', value: formatPhone(receipt.customer_phone) },
              ]}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Payment Summary
            </div>
            <DetailRowsTable
              rows={[
                {
                  label: 'Amount Collected',
                  value: <span style={{ fontWeight: 700 }}>{formatCurrency(Number(receipt.amount))}</span>,
                },
                { label: 'Payment Method', value: receipt.payment_method || '—' },
                ...(receipt.previous_balance != null
                  ? [{ label: 'Previous Balance', value: formatCurrency(Number(receipt.previous_balance)) }]
                  : []),
                ...(receipt.remaining_balance != null
                  ? [{ label: 'Remaining Balance', value: formatCurrency(Number(receipt.remaining_balance)) }]
                  : []),
                ...(receipt.notes ? [{ label: 'Notes', value: receipt.notes }] : []),
              ]}
            />
          </div>

          <div>
            <div className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Collected By
            </div>
            <DetailRowsTable
              rows={[
                { label: 'Collector', value: receipt.generated_by_name || '—' },
              ]}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/collector/history')}>
          Back to Collection History
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={!canSend || sending}
          title={canSend ? 'Send to customer portal' : 'Only completed payments can be sent.'}
          onClick={handleSend}
        >
          {sending ? 'Sending…' : 'Send to Customer'}
        </button>
        <button className="button" type="button" onClick={exportReceiptPdf}>
          Print / Export PDF
        </button>
      </div>
    </div>
  );
}
