import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient.js';
import { fetchBranchInventory } from '../../api/inventoryService.js';
import { getCurrentUser } from '../../api/authService.js';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../shared/Pagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';

const URGENCY_RANK = {
  'Out of Stock': 0,
  'Critical Stock': 1,
  'Low Stock': 2,
  Sufficient: 3,
  'Never Stocked': 4,
};

function statusOf(row) {
  if (row.never_stocked) return 'Never Stocked';
  return String(row.stock_status || '');
}

function isAttention(status) {
  return status === 'Low Stock' || status === 'Critical Stock' || status === 'Out of Stock';
}

/**
 * Branch-scoped inventory list.
 * - Branch Manager: view-only triage desk
 * - Warehouse: on-hand desk + Restock / Transfer / Stock Count launchers
 * KPI strip removed — triage chips replace dashboard-style stats.
 */
export function BranchInventoryViewPage({
  showToast,
  branchName,
  navigate,
  mode = 'readonly',
  initialStockFilter = 'All',
}) {
  const isWarehouse = mode === 'warehouse';
  const user = getCurrentUser();
  const [records, setRecords] = useState([]);
  const [catalogExtras, setCatalogExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStockFilter || 'All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [includeNeverStocked, setIncludeNeverStocked] = useState(initialStockFilter === 'Never Stocked');

  useEffect(() => {
    if (!initialStockFilter) return;
    setStatusFilter(initialStockFilter);
    if (initialStockFilter === 'Never Stocked') setIncludeNeverStocked(true);
  }, [initialStockFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, prodRes] = await Promise.all([
        fetchBranchInventory(),
        isWarehouse
          ? apiClient.get('/products', {
            params: {
              product_status: 'Active',
              limit: 500,
              ...(user?.branch?.id != null ? { branch_id: user.branch.id } : {}),
            },
          }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (!invRes.success) {
        setRecords([]);
        setCatalogExtras([]);
        setError(invRes.message || 'Failed to load branch inventory.');
        showToast?.(invRes.message || 'Failed to load branch inventory.', 'error');
        setLoading(false);
        return;
      }

      const stockRows = invRes.data || [];
      setRecords(stockRows);

      if (prodRes?.data?.success) {
        const stockIds = new Set(stockRows.map((r) => Number(r.product_id)));
        const extras = (prodRes.data.data || [])
          .filter((p) => !stockIds.has(Number(p.product_id)))
          .map((p) => ({
            branch_inventory_id: `never-${p.product_id}`,
            product_id: p.product_id,
            product_name: p.product_name || p.name,
            sku: p.sku,
            category_name: p.category_name,
            available_stock: 0,
            reorder_level: p.reorder_point ?? null,
            pending_outbound: 0,
            stock_status: null,
            never_stocked: true,
          }));
        setCatalogExtras(extras);
      } else {
        setCatalogExtras([]);
      }
    } catch (err) {
      setRecords([]);
      setCatalogExtras([]);
      setError(err.message || 'Failed to load branch inventory.');
      showToast?.(err.message || 'Failed to load branch inventory.', 'error');
    }
    setLoading(false);
  }, [showToast, isWarehouse, user?.branch?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const sourceRows = useMemo(() => {
    if (!includeNeverStocked || !isWarehouse) return records;
    return [...records, ...catalogExtras];
  }, [records, catalogExtras, includeNeverStocked, isWarehouse]);

  const categories = useMemo(() => {
    const names = [...new Set(sourceRows.map((r) => r.category_name).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [sourceRows]);

  const summary = useMemo(() => {
    const attention = records.filter((r) => isAttention(statusOf(r))).length;
    const out = records.filter((r) => statusOf(r) === 'Out of Stock' || Number(r.available_stock) <= 0).length;
    const pendingRows = records.filter((r) => Number(r.pending_outbound) > 0).length;
    const never = catalogExtras.length;
    return {
      all: records.length,
      attention,
      out,
      pendingRows,
      never,
    };
  }, [records, catalogExtras]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = sourceRows.filter((row) => {
      const matchSearch = !q
        || (row.product_name || '').toLowerCase().includes(q)
        || (row.sku || '').toLowerCase().includes(q)
        || (row.category_name || '').toLowerCase().includes(q);
      if (!matchSearch) return false;

      if (categoryFilter !== 'All' && String(row.category_name || '') !== categoryFilter) {
        return false;
      }

      const status = statusOf(row);
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Attention') return isAttention(status);
      if (statusFilter === 'Pending') return Number(row.pending_outbound) > 0;
      if (statusFilter === 'Never Stocked') return Boolean(row.never_stocked);
      return status === statusFilter;
    });

    rows.sort((a, b) => {
      const rankA = URGENCY_RANK[statusOf(a)] ?? 9;
      const rankB = URGENCY_RANK[statusOf(b)] ?? 9;
      if (rankA !== rankB) return rankA - rankB;
      return String(a.product_name || '').localeCompare(String(b.product_name || ''));
    });
    return rows;
  }, [sourceRows, search, statusFilter, categoryFilter]);

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${statusFilter}|${categoryFilter}|${includeNeverStocked}`,
  });
  const rows = pagination.paginatedData;

  const resolvedBranch = branchName
    || user?.branch?.name
    || records.find((r) => r.branch_name)?.branch_name
    || 'Your branch';

  const alertBadge = (row) => {
    const s = statusOf(row);
    if (s === 'Out of Stock' || s === 'Critical Stock' || s === 'Low Stock' || s === 'Never Stocked') {
      return <StatusBadge status={s} />;
    }
    return <span className="text-ink/50">—</span>;
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setCategoryFilter('All');
  };

  const filtersActive = search || statusFilter !== 'All' || categoryFilter !== 'All';

  if (loading) return <LoadingState message="Loading branch stock…" />;
  if (error && !records.length) {
    return (
      <EmptyState
        title="Unable to load branch stock"
        description={error}
        actionLabel="Retry"
        onAction={() => load()}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Branch Stock</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              On-hand inventory at {resolvedBranch}. Open a product for details
              {isWarehouse ? ', or start restock, transfer, or stock count from here.' : '.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {!isWarehouse ? <StatusBadge status="View only" /> : null}
            {isWarehouse && navigate ? (
              <>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => navigate('/warehouse/restock-history/new')}
                >
                  Restock
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => navigate('/warehouse/transfers/new')}
                >
                  Transfer
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => navigate('/warehouse/stock-counts/new')}
                >
                  Stock Count
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="pos-chips" role="group" aria-label="Stock triage" style={{ marginTop: 12 }}>
          <button
            type="button"
            className={statusFilter === 'All' ? 'pos-chip active' : 'pos-chip'}
            onClick={() => setStatusFilter('All')}
          >
            All tracked · {summary.all}
          </button>
          <button
            type="button"
            className={statusFilter === 'Attention' ? 'pos-chip active' : 'pos-chip'}
            onClick={() => setStatusFilter('Attention')}
          >
            Needs attention · {summary.attention}
          </button>
          <button
            type="button"
            className={statusFilter === 'Out of Stock' ? 'pos-chip active' : 'pos-chip'}
            onClick={() => setStatusFilter('Out of Stock')}
          >
            Out · {summary.out}
          </button>
          <button
            type="button"
            className={statusFilter === 'Pending' ? 'pos-chip active' : 'pos-chip'}
            onClick={() => setStatusFilter('Pending')}
          >
            Pending outbound · {summary.pendingRows}
          </button>
          {isWarehouse ? (
            <button
              type="button"
              className={statusFilter === 'Never Stocked' ? 'pos-chip active' : 'pos-chip'}
              onClick={() => {
                setIncludeNeverStocked(true);
                setStatusFilter('Never Stocked');
              }}
              disabled={!summary.never}
              title={summary.never ? 'Catalog SKUs not yet stocked at this branch' : 'No unstocked catalog products'}
            >
              Never stocked · {summary.never}
            </button>
          ) : null}
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
                aria-label="Search branch stock"
              />
            </div>
            <select
              className="filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="All">All categories</option>
              {categories.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                if (next === 'Never Stocked') setIncludeNeverStocked(true);
                setStatusFilter(next);
              }}
              aria-label="Filter by stock status"
            >
              <option value="All">All statuses</option>
              <option value="Attention">Needs attention</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Critical Stock">Critical Stock</option>
              <option value="Out of Stock">Out of Stock</option>
              <option value="Pending">Pending outbound</option>
              <option value="Sufficient">Sufficient</option>
              {isWarehouse ? <option value="Never Stocked">Never Stocked</option> : null}
            </select>
            {isWarehouse ? (
              <label className="text-ink/70" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={includeNeverStocked}
                  onChange={(e) => {
                    setIncludeNeverStocked(e.target.checked);
                    if (!e.target.checked && statusFilter === 'Never Stocked') setStatusFilter('All');
                  }}
                />
                Include never stocked
              </label>
            ) : null}
            {filtersActive ? (
              <button className="button ghost" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
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
                    <th>On hand</th>
                    <th>Reorder</th>
                    <th>Pending out</th>
                    <th>Alert</th>
                    {isWarehouse ? <th className="cell-actions">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.branch_inventory_id}
                      className={isWarehouse && navigate ? 'clickable-row' : undefined}
                      onClick={isWarehouse && navigate
                        ? () => navigate(`/warehouse/product/${row.product_id}`)
                        : undefined}
                    >
                      <td><strong>{row.product_name || '—'}</strong></td>
                      <td><span className="mono-cell">{row.sku || '—'}</span></td>
                      <td>{row.category_name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>
                        {row.never_stocked ? '—' : (row.available_stock ?? 0)}
                      </td>
                      <td>{row.reorder_level != null ? row.reorder_level : '—'}</td>
                      <td>{row.never_stocked ? '—' : (Number(row.pending_outbound) || 0)}</td>
                      <td>{alertBadge(row)}</td>
                      {isWarehouse && navigate ? (
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View product"
                            onClick={() => navigate(`/warehouse/product/${row.product_id}`)}
                          >
                            <NavIcon name="view" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title="No stock rows"
            description="No products match your filters for this branch."
            actionLabel={filtersActive ? 'Clear filters' : undefined}
            onAction={filtersActive ? clearFilters : undefined}
          />
        )}
      </section>
    </div>
  );
}
