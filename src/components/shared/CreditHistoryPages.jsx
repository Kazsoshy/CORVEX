import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
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

/** Build a label/value PDF body from a credit history record (no mock data). */
function buildCreditHistoryPdfRows(record) {
  if (!record) return [];
  return [
    { Field: 'Credit ID', Value: dash(record.credit_id) },
    { Field: 'Customer', Value: dash(record.customer_name) },
    { Field: 'Customer ID', Value: dash(record.customer_id) },
    { Field: 'Branch', Value: dash(record.branch_name) },
    { Field: 'Sales ID', Value: dash(record.sales_id) },
    { Field: 'Invoice Number', Value: dash(record.invoice_number) },
    { Field: 'Collection ID', Value: dash(record.collection_id) },
    { Field: 'Receipt Number', Value: dash(record.receipt_number) },
    { Field: 'Previous Balance', Value: formatCurrency(record.previous_balance) },
    { Field: 'Payment Amount', Value: formatCurrency(record.payment_amount) },
    { Field: 'Remaining Balance', Value: formatCurrency(record.remaining_balance) },
    { Field: 'Payment Status', Value: dash(record.payment_status) },
    { Field: 'Transaction Date', Value: formatDisplayDate(record.transaction_date) },
  ];
}

function downloadCreditHistoryPdf(record, showToast) {
  try {
    const rows = buildCreditHistoryPdfRows(record);
    if (!rows.length) {
      if (showToast) showToast('Nothing to export.', 'error');
      return false;
    }
    const creditId = record.credit_id ?? 'record';
    const ok = downloadPdf(rows, {
      filename: `credit-history-${creditId}.pdf`,
      title: 'Credit History Record',
      subtitle: `Credit ID ${creditId}${record.customer_name ? ` · ${record.customer_name}` : ''}`,
    });
    if (ok) {
      if (showToast) showToast('Credit history exported as PDF.', 'success');
      return true;
    }
    if (showToast) showToast('Unable to generate PDF.', 'error');
    return false;
  } catch (err) {
    console.error('[CreditHistory] PDF export failed:', err);
    if (showToast) showToast('Unable to generate PDF.', 'error');
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List Page — shows all credit_history rows with every schema column
// ─────────────────────────────────────────────────────────────────────────────
export function CreditHistoryListPage({
  navigate,
  basePath = '/warehouse/credit-history',
  showToast,
  userBranch
}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getCreditHistory();
      if (result.success) {
        setRecords(result.data || []);
      } else {
        setError(result.message || 'Failed to load credit history.');
        if (showToast) showToast(result.message || 'Failed to load credit history', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      const matchSearch = !q || (r.customer_name || '').toLowerCase().includes(q) || (r.invoice_number || '').toLowerCase().includes(q) || (r.receipt_number || '').toLowerCase().includes(q) || String(r.credit_id).includes(q);
      const matchStatus = statusFilter === 'All' || r.payment_status === statusFilter;
      const txDate = r.transaction_date ? r.transaction_date.slice(0, 10) : '';
      const matchFrom = !dateFrom || txDate >= dateFrom;
      const matchTo = !dateTo || txDate <= dateTo;
      return matchSearch && matchStatus && matchFrom && matchTo;
    });
  }, [records, search, statusFilter, dateFrom, dateTo]);
  const pagination_filtered = usePagination(filtered, {
    resetKey: `${search}|${statusFilter}|${dateFrom}|${dateTo}`,
  });
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading credit history..." />;
  if (error && !records.length) {
    return <EmptyState title="Unable to load credit history" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />;
  }
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Credit History</h3>
          <p className="text-ink/70">{records.length} record{records.length !== 1 ? 's' : ''} in database</p>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by customer, invoice #, receipt #, or ID" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Paid', 'Partial', 'Overdue'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" />
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Credit ID</th>
                  <th>Customer</th>
                  <th>Payment Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(r => <tr key={r.credit_id}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.credit_id}</span></td>
                    <td><strong>{r.customer_name}</strong></td>
                    <td style={{
                  fontWeight: 600,
                  color: '#255684'
                }}>{formatCurrency(r.payment_amount)}</td>
                    <td><StatusBadge status={r.payment_status} /></td>
                    <td>{formatDisplayDate(r.transaction_date)}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View details" onClick={() => setSelectedRecord(r)}>
                        <NavIcon name="view" />
                      </button>
                      <button
                        className="icon-action-button"
                        type="button"
                        title="Download PDF"
                        aria-label={`Download PDF for credit ${r.credit_id}`}
                        onClick={() => downloadCreditHistoryPdf(r, showToast)}
                      >
                        <NavIcon name="download" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No records found" description="Adjust your search or filters." />}
      </section>

      {selectedRecord ? <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-history-detail-title"
        onClick={() => setSelectedRecord(null)}
      >
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3 id="credit-history-detail-title" style={{ margin: 0 }}>Credit Record Details</h3>
                <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                  Credit ID {selectedRecord.credit_id} · {selectedRecord.customer_name}
                </p>
              </div>
              <StatusBadge status={selectedRecord.payment_status} />
            </div>
            <DetailRowsTable rows={[
              { label: 'Credit ID', value: <span style={{ fontFamily: 'monospace' }}>{selectedRecord.credit_id}</span> },
              { label: 'Customer', value: selectedRecord.customer_name },
              { label: 'Customer ID', value: <span style={{ fontFamily: 'monospace' }}>{selectedRecord.customer_id}</span> },
              { label: 'Branch', value: selectedRecord.branch_name || '—' },
              { label: 'Sales ID', value: <span style={{ fontFamily: 'monospace' }}>{selectedRecord.sales_id ?? '—'}</span> },
              { label: 'Invoice Number', value: <span style={{ fontFamily: 'monospace' }}>{selectedRecord.invoice_number || '—'}</span> },
              { label: 'Collection ID', value: <span style={{ fontFamily: 'monospace' }}>{selectedRecord.collection_id ?? '—'}</span> },
              { label: 'Receipt Number', value: <span style={{ fontFamily: 'monospace' }}>{selectedRecord.receipt_number || '—'}</span> },
              { label: 'Previous Balance', value: formatCurrency(selectedRecord.previous_balance) },
              { label: 'Payment Amount', value: <span style={{ fontWeight: 700, color: '#255684' }}>{formatCurrency(selectedRecord.payment_amount)}</span> },
              { label: 'Remaining Balance', value: (
                <span style={{
                  fontWeight: 700,
                  color: Number(selectedRecord.remaining_balance) > 0 ? '#dc2626' : '#4A6B12'
                }}>
                  {formatCurrency(selectedRecord.remaining_balance)}
                </span>
              ) },
              { label: 'Payment Status', value: <StatusBadge status={selectedRecord.payment_status} /> },
              { label: 'Transaction Date', value: formatDisplayDate(selectedRecord.transaction_date) },
            ]} />
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => downloadCreditHistoryPdf(selectedRecord, showToast)}
              >
                Download PDF
              </button>
              <button className="button" type="button" onClick={() => setSelectedRecord(null)}>Close</button>
            </div>
          </div>
        </div> : null}
    </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Page — shows a single credit_history row with full detail
// ─────────────────────────────────────────────────────────────────────────────
export function CreditHistoryDetailPage({
  creditId,
  navigate,
  basePath = '/warehouse/credit-history',
  showToast
}) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      // Fetch all and find by credit_id (no dedicated detail endpoint needed)
      const result = await getCreditHistory();
      if (result.success) {
        const found = (result.data || []).find(r => String(r.credit_id) === String(creditId));
        if (found) {
          setRecord(found);
        } else {
          setError('Credit history record not found.');
        }
      } else {
        setError(result.message || 'Failed to load record.');
      }
      setLoading(false);
    }
    load();
  }, [creditId]);
  if (loading) return <LoadingState message="Loading credit record..." />;
  if (error || !record) {
    return <EmptyState title="Record not found" description={error || 'This credit history record does not exist.'} actionLabel="Back to Credit History" onAction={() => navigate(basePath)} />;
  }
  return <div className="page">
      {/* Header */}
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">
            <StatusBadge status={record.payment_status} /> · Credit ID {record.credit_id}
          </p>
          <h2>{record.customer_name}</h2>
          <p className="text-ink/70">{record.branch_name} · Customer ID {record.customer_id}</p>
        </div>
      </section>

      {/* KPI strip */}
      <StatsGrid stats={[{
        label: 'Previous Balance',
        value: formatCurrency(record.previous_balance)
      }, {
        label: 'Payment Amount',
        value: formatCurrency(record.payment_amount)
      }, {
        label: 'Remaining Balance',
        value: formatCurrency(record.remaining_balance)
      }, {
        label: 'Payment Status',
        value: <StatusBadge status={record.payment_status} />
      }, {
        label: 'Transaction Date',
        value: formatDisplayDate(record.transaction_date)
      }]} />

      {/* Full record */}
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Credit Record Detail</h3></div>
        <DetailRowsTable rows={[
          { label: 'Credit ID', value: <span style={{ fontFamily: 'monospace' }}>{record.credit_id}</span> },
          { label: 'Customer', value: record.customer_name },
          { label: 'Customer ID', value: <span style={{ fontFamily: 'monospace' }}>{record.customer_id}</span> },
          { label: 'Branch', value: record.branch_name || '—' },
          { label: 'Sales ID', value: <span style={{ fontFamily: 'monospace' }}>{record.sales_id ?? '—'}</span> },
          { label: 'Invoice Number', value: <span style={{ fontFamily: 'monospace' }}>{record.invoice_number || '—'}</span> },
          { label: 'Collection ID', value: <span style={{ fontFamily: 'monospace' }}>{record.collection_id ?? '—'}</span> },
          { label: 'Receipt Number', value: <span style={{ fontFamily: 'monospace' }}>{record.receipt_number || '—'}</span> },
          { label: 'Previous Balance', value: formatCurrency(record.previous_balance) },
          { label: 'Payment Amount', value: <span style={{ fontWeight: 700, color: '#255684' }}>{formatCurrency(record.payment_amount)}</span> },
          { label: 'Remaining Balance', value: (
            <span style={{
              fontWeight: 700,
              color: Number(record.remaining_balance) > 0 ? '#dc2626' : '#4A6B12'
            }}>
              {formatCurrency(record.remaining_balance)}
            </span>
          ) },
          { label: 'Payment Status', value: <StatusBadge status={record.payment_status} /> },
          { label: 'Transaction Date', value: formatDisplayDate(record.transaction_date) },
        ]} />
      </section>

      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(basePath)}>Back to Credit History</button>
      </div>
    </div>;
}