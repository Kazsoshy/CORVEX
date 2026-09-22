import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { getCreditHistory } from '../../api/reportsService';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency, formatDisplayDate } from '../../utils/formatters.js';

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
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading credit history..." />;
  if (error && !records.length) {
    return <EmptyState title="Unable to load credit history" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Credit History</h3>
          <p className="text-ink/70">{records.length} record{records.length !== 1 ? 's' : ''} in database</p>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
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
                  <th>Branch</th>
                  <th>Invoice #</th>
                  <th>Receipt #</th>
                  <th>Previous Balance</th>
                  <th>Payment Amount</th>
                  <th>Remaining Balance</th>
                  <th>Payment Status</th>
                  <th>Transaction Date</th>
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
                    <td>{r.branch_name || '—'}</td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.invoice_number || '—'}</span></td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.receipt_number || '—'}</span></td>
                    <td>{formatCurrency(r.previous_balance)}</td>
                    <td style={{
                  fontWeight: 600,
                  color: '#093850'
                }}>{formatCurrency(r.payment_amount)}</td>
                    <td style={{
                  fontWeight: 600,
                  color: Number(r.remaining_balance) > 0 ? '#dc2626' : '#059669'
                }}>
                      {formatCurrency(r.remaining_balance)}
                    </td>
                    <td><StatusBadge status={r.payment_status} /></td>
                    <td>{formatDisplayDate(r.transaction_date)}</td>
                    <td>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`${basePath}/${r.credit_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No records found" description="Adjust your search or filters." />}
      </section>
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
  const statusColor = {
    Paid: {
      color: '#059669'
    },
    Partial: {
      color: '#d97706'
    },
    Overdue: {
      color: '#dc2626'
    }
  }[record.payment_status] ?? {
    color: '#64748b'
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      {/* Header */}
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0" style={{
          color: statusColor.color
        }}>
            {record.payment_status} · Credit ID {record.credit_id}
          </p>
          <h2>{record.customer_name}</h2>
          <p className="text-ink/70">{record.branch_name} · Customer ID {record.customer_id}</p>
        </div>
      </section>

      {/* KPI strip */}
      <section className="stats-grid">
        {[{
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
        value: record.payment_status
      }, {
        label: 'Transaction Date',
        value: formatDisplayDate(record.transaction_date)
      }].map((s, i) => <article key={s.label} className="stat-card" style={{
        '--stat-index': i
      }}>
            <div className="stat-card-top">
              <span className="stat-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="stat-dot" aria-hidden="true" />
            </div>
            <span className="stat-label">{s.label}</span>
            <strong className="stat-value" style={{
          fontSize: '1rem'
        }}>{s.value}</strong>
          </article>)}
      </section>

      {/* Full record */}
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Credit Record Detail</h3></div>
        <ul className="info-grid">
          <li><span className="info-item-label">Credit ID</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{record.credit_id}</span></li>
          <li><span className="info-item-label">Customer</span>
              <span className="info-item-value">{record.customer_name}</span></li>
          <li><span className="info-item-label">Customer ID</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{record.customer_id}</span></li>
          <li><span className="info-item-label">Branch</span>
              <span className="info-item-value">{record.branch_name || '—'}</span></li>
          <li><span className="info-item-label">Sales ID</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{record.sales_id ?? '—'}</span></li>
          <li><span className="info-item-label">Invoice Number</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{record.invoice_number || '—'}</span></li>
          <li><span className="info-item-label">Collection ID</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{record.collection_id ?? '—'}</span></li>
          <li><span className="info-item-label">Receipt Number</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{record.receipt_number || '—'}</span></li>
          <li><span className="info-item-label">Previous Balance</span>
              <span className="info-item-value">{formatCurrency(record.previous_balance)}</span></li>
          <li><span className="info-item-label">Payment Amount</span>
              <span className="info-item-value" style={{
            fontWeight: 700,
            color: '#093850'
          }}>{formatCurrency(record.payment_amount)}</span></li>
          <li><span className="info-item-label">Remaining Balance</span>
              <span className="info-item-value" style={{
            fontWeight: 700,
            color: Number(record.remaining_balance) > 0 ? '#dc2626' : '#059669'
          }}>
                {formatCurrency(record.remaining_balance)}
              </span></li>
          <li><span className="info-item-label">Payment Status</span>
              <span className="info-item-value">
                <StatusBadge status={record.payment_status} />
              </span></li>
          <li><span className="info-item-label">Transaction Date</span>
              <span className="info-item-value">{formatDisplayDate(record.transaction_date)}</span></li>
        </ul>
      </section>

      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(basePath)}>Back to Credit History</button>
      </div>
    </div>;
}