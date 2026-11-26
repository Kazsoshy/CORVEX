import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignSpotCashPickup,
  getBranchStaff,
  getSpotCashPickups,
} from '../../api/branchManagerService';
import { formatCurrency } from '../../utils/formatters.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { RowActionMenu } from '../shared/RowActionMenu';

export function SpotCashPickupsPanel({ showToast, navigate, opsBase }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [assigningId, setAssigningId] = useState(null);
  const [selectedCollector, setSelectedCollector] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const [pickups, staff] = await Promise.all([
      getSpotCashPickups(),
      getBranchStaff(),
    ]);
    setLoading(false);
    if (!pickups.success) {
      showToast?.(pickups.message || 'Failed to load Spot Cash pickups.', 'error');
      setRows([]);
    } else {
      setRows(pickups.data || []);
    }
    const list = staff?.data?.collectors || staff?.data?.Collectors || [];
    setCollectors(Array.isArray(list) ? list.filter((c) => String(c.status || 'Active') === 'Active') : []);
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCount = useMemo(
    () => rows.filter((r) => !r.assigned_collector_id).length,
    [rows]
  );

  async function handleAssign(invoiceId) {
    const collectorId = Number(selectedCollector[invoiceId]);
    if (!Number.isFinite(collectorId) || collectorId <= 0) {
      showToast?.('Select a collector first.', 'error');
      return;
    }
    setAssigningId(invoiceId);
    const result = await assignSpotCashPickup(invoiceId, { collector_id: collectorId });
    setAssigningId(null);
    if (!result.success) {
      showToast?.(result.message || 'Assignment failed.', 'error');
      return;
    }
    showToast?.(result.message || 'Pickup assigned.', 'success');
    await load();
  }

  if (loading) return <LoadingState message="Loading Spot Cash pickups…" />;

  return (
    <section className="panel content-panel" style={{ marginBottom: 16 }}>
      <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>Spot Cash pickups (today)</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Cash Spot Cash sales awaiting same-day collector pickup. Assign a collector; they collect the full amount on their published route.
          </p>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Open unassigned: <strong>{openCount}</strong> · Total awaiting: <strong>{rows.length}</strong>
      </p>

      {!rows.length ? (
        <EmptyState
          title="No Spot Cash Cash pickups waiting"
          description="When a Sales Agent logs Spot Cash with Cash, it appears here for same-day assignment."
        />
      ) : (
        <div className="corvex-table-wrapper" style={{ marginTop: 12 }}>
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Agent</th>
                <th>Assignment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const assigned = Boolean(row.assigned_collector_id);
                return (
                  <tr key={row.sales_invoices_id}>
                    <td>
                      <strong>{row.invoice_number}</strong>
                      <div className="muted" style={{ fontSize: '0.78rem' }}>{row.invoices_date}</div>
                    </td>
                    <td>
                      {row.customer_name}
                      <div className="muted" style={{ fontSize: '0.78rem' }}>
                        {[row.customer_code, row.contact_phone].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>{formatCurrency(row.final_obligation || row.amount_due)}</td>
                    <td>{row.sales_agent_name || '—'}</td>
                    <td>
                      {assigned ? (
                        <span>
                          {row.assigned_collector_name || 'Collector'}
                          <div className="muted" style={{ fontSize: '0.78rem' }}>{row.visit_status || 'Pending'}</div>
                        </span>
                      ) : (
                        <select
                          className="filter-select"
                          value={selectedCollector[row.sales_invoices_id] || ''}
                          onChange={(e) => setSelectedCollector((prev) => ({
                            ...prev,
                            [row.sales_invoices_id]: e.target.value,
                          }))}
                        >
                          <option value="">Select collector</option>
                          {collectors.map((c) => (
                            <option key={c.id || c.user_id} value={c.id || c.user_id}>
                              {c.name || c.full_name || `Collector ${c.id || c.user_id}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        label={`Actions for ${row.invoice_number}`}
                        items={[
                          assigned
                            ? {
                              key: 'open-route',
                              label: 'Open route',
                              onSelect: () => navigate?.(
                                `${opsBase}/field-operations/collectors/${row.assigned_collector_id}`
                              ),
                            }
                            : {
                              key: 'assign',
                              label: assigningId === row.sales_invoices_id ? 'Assigning…' : 'Assign today',
                              disabled: assigningId === row.sales_invoices_id,
                              onSelect: () => handleAssign(row.sales_invoices_id),
                            },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
