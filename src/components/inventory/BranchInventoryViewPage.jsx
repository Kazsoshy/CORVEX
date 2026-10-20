import { useEffect, useMemo, useState } from 'react';
import { fetchBranchInventory } from '../../api/inventoryService.js';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../shared/Pagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import { formatDisplayDateTime } from '../../utils/formatters.js';

/**
 * Branch-scoped inventory list (read-only).
 * API already forces non-OM roles to their assigned branch.
 */
export function BranchInventoryViewPage({ showToast, branchName }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchBranchInventory();
      if (cancelled) return;
      if (result.success) {
        setRecords(result.data || []);
      } else {
        setRecords([]);
        setError(result.message || 'Failed to load branch inventory.');
        showToast?.(result.message || 'Failed to load branch inventory.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((row) => {
      const matchSearch = !q
        || (row.product_name || '').toLowerCase().includes(q)
        || (row.sku || '').toLowerCase().includes(q)
        || (row.category_name || '').toLowerCase().includes(q)
        || String(row.branch_inventory_id).includes(q);
      const matchStatus = statusFilter === 'All' || row.stock_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [records, search, statusFilter]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;

  const summary = useMemo(() => {
    const sufficient = records.filter((r) => r.stock_status === 'Sufficient').length;
    const low = records.filter((r) => r.stock_status === 'Low Stock').length;
    const out = records.filter((r) => r.stock_status === 'Out of Stock').length;
    const units = records.reduce((sum, r) => sum + (Number(r.available_stock) || 0), 0);
    return { sufficient, low, out, units, products: records.length };
  }, [records]);

  const resolvedBranch = branchName
    || records.find((r) => r.branch_name)?.branch_name
    || 'Your branch';

  if (loading) return <LoadingState message="Loading branch inventory…" />;
  if (error && !records.length) {
    return (
      <EmptyState
        title="Unable to load branch inventory"
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
            <h3 style={{ margin: 0 }}>Branch Inventory</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              View-only stock for {resolvedBranch}. Adjustments are handled by warehouse staff.
            </p>
          </div>
          <StatusBadge status="View only" />
        </div>

        <div className="saw-stat-grid" style={{ marginBottom: 0 }}>
          <div className="saw-stat">
            <span>Products</span>
            <strong>{summary.products}</strong>
          </div>
          <div className="saw-stat">
            <span>Total units</span>
            <strong>{summary.units}</strong>
          </div>
          <div className="saw-stat">
            <span>Low stock</span>
            <strong>{summary.low}</strong>
          </div>
          <div className="saw-stat">
            <span>Out of stock</span>
            <strong>{summary.out}</strong>
          </div>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <div className="search-bar">
              <NavIcon name="search" />
              <input
                className="search-input"
                type="search"
                placeholder="Search product, SKU, or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {['All', 'Sufficient', 'Low Stock', 'Out of Stock'].map((status) => (
                <option key={status} value={status}>
                  {status === 'All' ? 'All Statuses' : status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Available</th>
                    <th>Reorder level</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.branch_inventory_id}>
                      <td>
                        <strong>{row.product_name || '—'}</strong>
                      </td>
                      <td>{row.sku || '—'}</td>
                      <td>{row.category_name || '—'}</td>
                      <td>{row.available_stock}</td>
                      <td>{row.reorder_level}</td>
                      <td>
                        <StatusBadge status={row.stock_status || '—'} />
                      </td>
                      <td>{formatDisplayDateTime(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title="No inventory records"
            description="No stock rows match your filters for this branch."
          />
        )}
      </section>
    </div>
  );
}
