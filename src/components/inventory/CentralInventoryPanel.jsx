import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCentralInventory, realignCentralInventory } from '../../api/inventoryService.js';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';

const METRIC_DEFS = [
  {
    key: 'totalStock',
    label: 'Total Stock',
    hint: 'Units across branches',
    icon: 'package',
    tone: 'neutral',
  },
  {
    key: 'productsTracked',
    label: 'Products Tracked',
    hint: 'Distinct products',
    icon: 'box',
    tone: 'neutral',
  },
  {
    key: 'lowStock',
    label: 'Low Stock',
    hint: 'Items needing attention',
    icon: 'alert-triangle',
    tone: 'warn',
  },
  {
    key: 'outOfStock',
    label: 'Out of Stock',
    hint: 'Items unavailable',
    icon: 'package-x',
    tone: 'danger',
  },
];

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('out')) return 'stock-status stock-critical';
  if (value.includes('critical')) return 'stock-status stock-critical';
  if (value.includes('low')) return 'stock-status stock-low';
  if (value.includes('align') && value.includes('out')) return 'stock-status stock-critical';
  return 'stock-status stock-sufficient';
}

export function CentralInventoryPanel({
  title = 'Inventory Management',
  showManagement = true,
  onToast,
}) {
  const [rows, setRows] = useState([]);
  const [byBranch, setByBranch] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recentMovements, setRecentMovements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realigning, setRealigning] = useState(false);
  const [error, setError] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('matrix');

  const load = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetchCentralInventory();
      if (!res.success) {
        setError(res.message || 'Failed to load central inventory.');
        return;
      }
      setRows(res.data || []);
      setByBranch(res.byBranch || []);
      setAlerts(res.alerts || []);
      setRecentMovements(res.recentMovements || []);
      setSummary(res.summary || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load central inventory.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const branches = useMemo(() => {
    if (byBranch.length) {
      return byBranch.map((branch) => ({
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
      }));
    }
    const first = rows.find((row) => Array.isArray(row.branches) && row.branches.length);
    return first?.branches || [];
  }, [byBranch, rows]);

  const selectedBranch = branches.find((branch) => String(branch.branch_id) === String(branchId));

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'misaligned' && row.aligned) return false;
      if (statusFilter === 'aligned' && !row.aligned) return false;
      if (statusFilter === 'alerts' && !(Number(row.alert_rows) > 0)) return false;
      if (!q) return true;
      return (
        String(row.product_name || '').toLowerCase().includes(q)
        || String(row.sku || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const metrics = useMemo(() => ({
    totalStock: summary?.totalStock ?? 0,
    productsTracked: summary?.productsTracked ?? summary?.products ?? 0,
    lowStock: summary?.lowStock ?? 0,
    outOfStock: summary?.outOfStock ?? 0,
  }), [summary]);

  const aligned = summary
    ? Number(summary.alignedProducts ?? summary.aligned) === Number(summary.productsTracked ?? summary.products)
    : false;

  const handleRealign = async () => {
    setRealigning(true);
    try {
      const res = await realignCentralInventory();
      if (!res.success) {
        onToast?.(res.message || 'Realign failed.', 'error');
        setError(res.message || 'Realign failed.');
        return;
      }
      onToast?.(res.message || 'Central inventory realigned.', 'success');
      await load({ soft: true });
    } finally {
      setRealigning(false);
    }
  };

  if (loading) return <LoadingState message="Loading inventory centralization…" />;
  if (error && !summary) return <EmptyState title="Central inventory unavailable" description={error} />;

  return (
    <div className="inv-central relative z-10 grid gap-[22px] w-full">
      <section className="inv-overview panel content-panel relative overflow-hidden">
        <div className="inv-overview-glow" aria-hidden="true" />
        <div className="list-section-header inv-overview-header">
          <div>
            <p className="inv-overview-eyebrow">Inventory Centralization</p>
            <h3>{title}</h3>
            <p className="inv-overview-sub">
              All branches · Live PostgreSQL records
              {summary?.lastSyncedAt ? ` · Synced ${formatDisplayDateTime(summary.lastSyncedAt)}` : ''}
            </p>
          </div>
          <div className="inv-overview-actions">
            <span className={aligned ? 'stock-status stock-sufficient' : 'stock-status stock-low'}>
              {aligned ? 'Aligned' : 'Needs alignment'}
            </span>
            <button
              className="button ghost"
              type="button"
              disabled={refreshing || realigning}
              onClick={() => load({ soft: true })}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              className="button"
              type="button"
              disabled={realigning || refreshing}
              onClick={handleRealign}
            >
              {realigning ? 'Realigning…' : 'Realign Central Totals'}
            </button>
          </div>
        </div>

        <div className="inv-metric-grid">
          {METRIC_DEFS.map((metric) => (
            <article key={metric.key} className={`inv-metric-card tone-${metric.tone}`}>
              <div className="inv-metric-icon" aria-hidden="true">
                <NavIcon name={metric.icon} />
              </div>
              <div className="inv-metric-copy">
                <span className="inv-metric-label">{metric.label}</span>
                <strong className="inv-metric-value">{Number(metrics[metric.key] || 0).toLocaleString()}</strong>
                <span className="inv-metric-hint">{metric.hint}</span>
              </div>
            </article>
          ))}
        </div>

        <p className="inv-overview-footnote">
          Company stock is the sum of every branch. Sales, restocks, transfers, stock counts, and reversals update
          branch rows and central totals together — reducing delayed updates, duplicates, and overselling.
          {summary
            ? ` ${summary.alignedProducts ?? summary.aligned} of ${summary.productsTracked ?? summary.products} products are aligned.`
            : ''}
        </p>
      </section>

      <section className="panel content-panel relative overflow-hidden inv-branch-panel">
        <div className="list-section-header">
          <div>
            <h3>Inventory by Branch</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Share of company stock held at each active branch
            </p>
          </div>
          <span className="inv-branch-count">
            {byBranch.length || summary?.activeBranches || 0} branches
          </span>
        </div>

        {!byBranch.length ? (
          <EmptyState title="No branch stock yet" description="Branch inventory appears after products are stocked." />
        ) : (
          <ul className="inv-branch-list">
            {byBranch.map((branch) => {
              const pct = Math.max(0, Math.min(100, Number(branch.share_pct) || 0));
              return (
                <li key={branch.branch_id} className="inv-branch-row">
                  <div className="inv-branch-meta">
                    <div>
                      <strong>{branch.branch_name}</strong>
                      <p>{branch.areas_covered || branch.region || branch.address || 'Coverage pending'}</p>
                    </div>
                    <div className="inv-branch-stats">
                      <span className="inv-branch-units">{Number(branch.total_units || 0).toLocaleString()} units</span>
                      <span className="inv-branch-share">{pct}%</span>
                    </div>
                  </div>
                  <div
                    className="inv-branch-bar"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${branch.branch_name} stock share`}
                  >
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="inv-branch-foot">
                    <span>{branch.products_stocked || 0} SKUs</span>
                    <span className={branch.low_stock ? 'text-warn' : ''}>{branch.low_stock || 0} low</span>
                    <span className={branch.out_of_stock ? 'text-danger' : ''}>{branch.out_of_stock || 0} out</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showManagement ? (
        <>
          <section className="panel content-panel relative overflow-hidden">
            <div className="list-section-header">
              <div>
                <h3>Stock Alerts</h3>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                  Low, critical, and out-of-stock rows across all branches
                </p>
              </div>
            </div>
            {!alerts.length ? (
              <EmptyState title="No stock alerts" description="All tracked products are above reorder thresholds." />
            ) : (
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Branch</th>
                      <th>Available</th>
                      <th>Reorder</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => (
                      <tr key={alert.inventory_id}>
                        <td><strong>{alert.product_name}</strong></td>
                        <td>{alert.sku || '—'}</td>
                        <td>{alert.branch_name}</td>
                        <td>{alert.available_stock}</td>
                        <td>{alert.reorder_level}</td>
                        <td><span className={statusClass(alert.stock_status)}>{alert.stock_status}</span></td>
                        <td>{alert.updated_at ? formatDisplayDateTime(alert.updated_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel content-panel relative overflow-hidden">
            <div className="list-section-header">
              <div>
                <h3>Central Product Matrix</h3>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                  Central quantity must equal the sum of branch stock for every SKU
                </p>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={view === 'matrix' ? 'segment active' : 'segment'}
                  onClick={() => setView('matrix')}
                >
                  Matrix
                </button>
                <button
                  type="button"
                  className={view === 'movements' ? 'segment active' : 'segment'}
                  onClick={() => setView('movements')}
                >
                  Recent movements
                </button>
              </div>
            </div>

            {view === 'matrix' ? (
              <>
                <div className="list-section-controls inv-matrix-controls">
                  <label className="form-group" style={{ margin: 0, minWidth: 220, flex: 1 }}>
                    <span className="login-label" style={{ display: 'block', marginBottom: 6 }}>Search</span>
                    <input
                      className="search-input"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Product or SKU"
                    />
                  </label>
                  <label className="form-group" style={{ margin: 0, minWidth: 180 }}>
                    <span className="login-label" style={{ display: 'block', marginBottom: 6 }}>Branch</span>
                    <select className="filter-select" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                      <option value="all">All branches</option>
                      {branches.map((branch) => (
                        <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group" style={{ margin: 0, minWidth: 180 }}>
                    <span className="login-label" style={{ display: 'block', marginBottom: 6 }}>Status</span>
                    <select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All products</option>
                      <option value="aligned">Aligned only</option>
                      <option value="misaligned">Out of balance</option>
                      <option value="alerts">With stock alerts</option>
                    </select>
                  </label>
                </div>

                {!filteredRows.length ? (
                  <EmptyState title="No products" description="Adjust filters or add products to the catalog." />
                ) : (
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Central quantity</th>
                          {selectedBranch ? (
                            <th>{selectedBranch.branch_name}</th>
                          ) : (
                            branches.map((branch) => (
                              <th key={branch.branch_id}>{branch.branch_name}</th>
                            ))
                          )}
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => {
                          const byBranchMap = new Map((row.branches || []).map((branch) => [branch.branch_id, branch]));
                          const visibleBranches = selectedBranch ? [selectedBranch] : branches;
                          return (
                            <tr key={row.product_id}>
                              <td><strong>{row.product_name}</strong></td>
                              <td>{row.sku || '—'}</td>
                              <td>{row.central_quantity ?? 0}</td>
                              {visibleBranches.map((branch) => {
                                const stock = byBranchMap.get(branch.branch_id);
                                const quantity = stock?.available_stock;
                                return (
                                  <td key={branch.branch_id}>
                                    {quantity == null ? '—' : quantity}
                                    {stock?.stock_status ? (
                                      <div style={{ marginTop: 4 }}>
                                        <span className={statusClass(stock.stock_status)}>{stock.stock_status}</span>
                                      </div>
                                    ) : null}
                                  </td>
                                );
                              })}
                              <td>
                                <span className={row.aligned ? 'stock-status stock-sufficient' : 'stock-status stock-critical'}>
                                  {row.aligned ? 'Aligned' : 'Out of balance'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              !recentMovements.length ? (
                <EmptyState title="No recent movements" description="Stock movements will appear as sales, restocks, and transfers post." />
              ) : (
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Type</th>
                        <th>Product</th>
                        <th>Branch</th>
                        <th>Qty</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMovements.map((movement) => (
                        <tr key={movement.movement_id}>
                          <td>{movement.movement_ref}</td>
                          <td>{movement.type}</td>
                          <td>{movement.product_name}</td>
                          <td>{movement.branch_name || '—'}</td>
                          <td>{movement.quantity}</td>
                          <td>{formatDisplayDate(movement.movement_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
