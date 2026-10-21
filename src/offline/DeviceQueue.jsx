import { StatusBadge } from '../components/StatusBadge';
import { listOfflineRecords } from './db.js';

export async function loadWaiting(tableName) {
  const rows = await listOfflineRecords();
  return rows.filter((row) => row.tableName === tableName && row.status !== 'Synced');
}

function recordTitle(row) {
  const payload = row.payload || {};
  if (row.tableName === 'collection_payment') {
    const amount = Number(payload.amount);
    const money = Number.isFinite(amount) ? amount.toFixed(2) : '';
    return [payload.customer_name || 'Collection', money].filter(Boolean).join(' · ');
  }
  if (row.tableName === 'sales_invoices') return payload.customer_name || 'Sale';
  return payload.customer_name || 'Field report';
}

function recordDetail(row) {
  const payload = row.payload || {};
  if (row.tableName === 'collection_payment') return payload.payment_method || 'Cash';
  if (row.tableName === 'sales_invoices') {
    const count = Array.isArray(payload.items) ? payload.items.length : 0;
    return `${count} line item${count === 1 ? '' : 's'}`;
  }
  return [payload.activity_type, payload.remarks].filter(Boolean).join(' — ') || '—';
}

export function DeviceQueue({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="table-shell" style={{ marginBottom: 16 }}>
      <p className="muted">Waiting on this device. A refresh or a closed browser keeps these records until they sync.</p>
      <table className="corvex-table">
        <thead>
          <tr><th>Record</th><th>Detail</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.localId}>
              <td>{recordTitle(row)}</td>
              <td>{recordDetail(row)}</td>
              <td>
                <StatusBadge status={row.status === 'Failed' ? 'Failed' : 'Pending'} />
                {row.lastError ? <div className="muted">{row.lastError}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
