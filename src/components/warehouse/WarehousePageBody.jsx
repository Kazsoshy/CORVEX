import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import {
  createInventoryTransfer,
  createRestock,
  createWarehouseProduct,
  deleteProductImage,
  uploadProductImage,
  fetchBranchInventory,
  fetchInventoryBranches,
  fetchInventoryTransferById,
  fetchInventoryTransfers,
  fetchRestockById,
  fetchRestocks,
  fetchStockCountById,
  fetchStockCounts,
  fetchStockMovementById,
  fetchStockMovements,
  fetchWarehouseAuditLogs,
  fetchWarehouseDashboard,
  patchInventoryTransfer,
  submitRestock,
} from '../../api/inventoryService';
import { getCurrentUser } from '../../api/authService.js';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';

function ProductThumb({ src, alt = '', size }) {
  const style = size ? { width: size, height: size } : undefined;
  if (src) {
    return <img className="product-thumb" src={src} alt={alt} width={size || 40} height={size || 40} style={style} />;
  }
  return (
    <span className="product-thumb product-thumb--empty" style={style} aria-hidden="true">
      N/A
    </span>
  );
}

function transferWorkflowStepIndex(status) {
  if (status === 'Rejected') return -1;
  if (status === 'Pending Approval' || status === 'Submitted') return 0;
  if (status === 'Approved') return 2;
  if (status === 'Shipped') return 3;
  if (status === 'Received' || status === 'Completed') return 4;
  return 0;
}

function isTransferPendingApproval(status) {
  return status === 'Pending Approval' || status === 'Submitted';
}
import apiClient from '../../api/apiClient.js';
import { downloadPdf } from '../../utils/dataExport';
import { getReportInventory } from '../../api/reportsService.js';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { NavIcon } from '../../navIcons';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatDocumentRef, formatPhone } from '../../utils/formatters.js';
import { BranchInventoryViewPage } from '../inventory/BranchInventoryViewPage.jsx';
import { ProductImagePicker } from '../shared/ProductImagePicker';
import { TransferDocumentForm } from './TransferDocumentForm.jsx';
import { RestockDocumentForm } from './RestockDocumentForm.jsx';
import { StockCountDocumentForm } from './StockCountDocumentForm.jsx';
import { confirmAction } from '../shared/confirmAction.jsx';
const PAGE_SIZE = 10;
function DashboardPage({
  navigate,
  showToast
}) {
  const user = getCurrentUser();
  const branchName = user?.branch?.name || 'your branch';
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const dashRes = await fetchWarehouseDashboard();
      if (dashRes.success) setDashboard(dashRes.data);
      else if (showToast) showToast(dashRes.message || 'Failed to load dashboard.', 'error');
      setLoading(false);
    }
    load();
  }, [showToast]);

  const summary = dashboard?.summary || {};
  const transfers = dashboard?.recentTransfers || [];
  const restocks = dashboard?.recentRestocks || [];
  const lowStockSignal = dashboard?.lowStockSignal || [];

  const openTransferQueue = (segment) => {
    navigate(`/warehouse/transfers?tab=requests&segment=${encodeURIComponent(segment)}`);
  };

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <div className="warehouse-dashboard relative z-10 grid gap-5 w-full">
      <section className="dashboard-section" aria-labelledby="wh-overview-heading">
        <div className="dashboard-section-header">
          <h3 id="wh-overview-heading" className="dashboard-section-title">Overview</h3>
          <p className="dashboard-section-sub">Action queues for {branchName}</p>
        </div>

        <StatsGrid stats={[
          {
            label: 'Ready to Ship',
            value: String(summary.readyToShip ?? 0),
            title: 'Approved outbound transfers waiting for you to ship',
            onClick: () => openTransferQueue('Action required'),
          },
          {
            label: 'Awaiting Approval',
            value: String(summary.awaitingApproval ?? 0),
            title: 'Your outbound transfer requests still pending approval',
            onClick: () => openTransferQueue('Awaiting approval'),
          },
          {
            label: 'Incoming',
            value: String(summary.incoming ?? 0),
            title: 'Shipped transfers waiting for you to receive',
            onClick: () => openTransferQueue('Incoming'),
          },
          {
            label: 'Needs Restock',
            value: String(summary.needsRestock ?? 0),
            title: 'Out of stock, critical, or low at your branch',
            onClick: () => navigate('/warehouse/branch-stock?stock=Attention'),
          },
        ]} />

        <div className="dashboard-actions" style={{ marginTop: 14 }}>
          <button className="button ghost" type="button" onClick={() => navigate('/warehouse/transfers/new')}>
            New Transfer
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/warehouse/restock-history/new')}>
            Record Restock
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/warehouse/stock-counts/new')}>
            New Stock Count
          </button>
        </div>

        <section className="panel dashboard-panel-compact alert-panel" style={{ marginTop: 14 }}>
          <div className="dashboard-panel-heading">
            <h4>Low-Stock Signal</h4>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate('/warehouse/branch-stock?stock=Attention')}
            >
              View all
            </button>
          </div>
          {lowStockSignal.length ? (
            <div className="corvex-table-wrapper dashboard-table-wrap">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="text-right">On hand</th>
                    <th className="text-right">Reorder</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockSignal.map((p) => (
                    <tr
                      key={p.product_id}
                      className="clickable-row"
                      onClick={() => navigate(`/warehouse/product/${p.product_id}`)}
                    >
                      <td><strong>{p.product_name}</strong></td>
                      <td><span className="mono-cell">{p.sku || '—'}</span></td>
                      <td className="text-right">{p.available_stock ?? 0}</td>
                      <td className="text-right">{p.reorder_level ?? '—'}</td>
                      <td><StatusBadge status={p.stock_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="dashboard-empty muted">No low, critical, or out-of-stock items at this branch.</p>
          )}
        </section>
      </section>

      <section className="dashboard-section" aria-labelledby="wh-activity-heading">
        <div className="dashboard-section-header">
          <h3 id="wh-activity-heading" className="dashboard-section-title">Recent Activity</h3>
          <p className="dashboard-section-sub">Latest transfers and restocks</p>
        </div>

        <div className="dashboard-widgets grid two-up">
          <section className="panel dashboard-panel-compact">
            <div className="dashboard-panel-heading">
              <h4>Recent Transfers</h4>
              <button className="button secondary" type="button" onClick={() => navigate('/warehouse/transfers?tab=requests')}>
                View all
              </button>
            </div>
            {transfers.length ? (
              <div className="corvex-table-wrapper dashboard-table-wrap">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>From / To</th>
                      <th className="text-right">Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr
                        key={t.transfer_id}
                        className="clickable-row"
                        onClick={() => navigate(`/warehouse/transfers/${t.transfer_id}?from=requests`)}
                      >
                        <td>
                          <span className="mono-cell">{formatDocumentRef(t.transfer_ref)}</span>
                          {t.product_name ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {t.product_name}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {(t.source_branch || t.source_branch_name || '—')}
                          {' → '}
                          {(t.destination_branch || t.destination_branch_name || '—')}
                        </td>
                        <td className="text-right">{Number(t.total_quantity ?? t.quantity ?? 0)}</td>
                        <td>{t.status ? <StatusBadge status={t.status} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dashboard-empty muted">No transfers yet.</p>
            )}
          </section>

          <section className="panel dashboard-panel-compact">
            <div className="dashboard-panel-heading">
              <h4>Recent Restocks</h4>
              <button className="button secondary" type="button" onClick={() => navigate('/warehouse/restock-history')}>
                View all
              </button>
            </div>
            {restocks.length ? (
              <div className="corvex-table-wrapper dashboard-table-wrap">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Delivery ref</th>
                      <th>Supplier</th>
                      <th>Date</th>
                      <th className="text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restocks.map((r) => (
                      <tr
                        key={r.restock_id}
                        className="clickable-row"
                        onClick={() => navigate(`/warehouse/restock-history/${r.restock_id}`)}
                      >
                        <td>
                          <span className="mono-cell">{formatDocumentRef(r.delivery_ref || r.restock_ref)}</span>
                          {r.product_name ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {r.product_name}
                            </span>
                          ) : null}
                        </td>
                        <td>{r.supplier_name || r.supplier || '—'}</td>
                        <td>{formatDisplayDate(r.received_date)}</td>
                        <td className="text-right qty-positive">+{Number(r.quantity ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dashboard-empty muted">No restocks yet.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
function warehouseStockStatusLabel(product) {
  if (!product?.has_stock_record && product?.stock_status == null) return 'Never Stocked';
  const raw = String(product?.stock_status || '');
  if (raw === 'Out of Stock') return 'Out';
  if (raw === 'Low Stock' || raw === 'Critical Stock') return 'Low';
  if (raw === 'Sufficient') return 'Sufficient';
  return raw || 'Never Stocked';
}

function InventoryPage({
  navigate,
  showToast
}) {
  const user = getCurrentUser();
  const branchName = user?.branch?.name || 'your branch';
  const initialCategory = new URLSearchParams(window.location.search).get('category') || 'All';
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [stockFilter, setStockFilter] = useState('All');
  const [sortBy, setSortBy] = useState('Product Name');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const applyProductSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        // Catalog from /products; on-hand always merged from branch-inventory so it matches Branch Stock.
        const branchId = user?.branch?.id ?? user?.branchId;
        const [prodRes, invRes] = await Promise.all([
          apiClient.get('/products', {
            params: {
              product_status: 'Active',
              limit: 500,
              ...(branchId != null ? { branch_id: branchId } : {}),
            },
          }),
          fetchBranchInventory(),
        ]);
        const catalog = prodRes.data?.success ? (prodRes.data.data || []) : [];
        const stockByProduct = new Map();
        if (invRes.success) {
          for (const row of invRes.data || []) {
            stockByProduct.set(Number(row.product_id), row);
          }
        }
        const merged = catalog.map((p) => {
          const stock = stockByProduct.get(Number(p.product_id));
          if (!stock) {
            return {
              ...p,
              has_stock_record: false,
              available_stock: 0,
              quantity: 0,
              stock_status: null,
              reorder_level: null,
            };
          }
          return {
            ...p,
            has_stock_record: true,
            available_stock: Number(stock.available_stock ?? stock.quantity ?? 0),
            quantity: Number(stock.available_stock ?? stock.quantity ?? 0),
            stock_status: stock.stock_status || null,
            reorder_level: stock.reorder_level ?? null,
            last_updated: stock.updated_at || stock.last_updated || p.last_updated,
          };
        });
        if (prodRes.data?.success) {
          setProducts(merged);
          setCategories(prodRes.data.categories || []);
        }
      } catch (err) {
        console.error('[Inventory] load error:', err.message);
        showToast('Failed to load products.', 'error');
      }
      setLoading(false);
    }
    loadProducts();
  }, [showToast, user?.branch?.id]);
  const filtered = useMemo(() => {
    let results = [...products];
    const query = search.trim().toLowerCase();
    if (query) {
      results = results.filter((p) => {
        const sku = String(p.sku || '').toLowerCase();
        const name = String(p.product_name || '').toLowerCase();
        const cat = String(p.category_name || '').toLowerCase();
        return name.includes(query) || cat.includes(query) || sku.includes(query);
      });
    }
    if (category !== 'All') {
      results = results.filter((p) => Number(p.category_id) === Number(category));
    }
    if (stockFilter !== 'All') {
      results = results.filter((p) => warehouseStockStatusLabel(p) === stockFilter);
    }
    if (sortBy === 'Product Name') results.sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || '')));
    else if (sortBy === 'Unit Price') results.sort((a, b) => Number(a.unit_price) - Number(b.unit_price));
    else if (sortBy === 'On Hand') results.sort((a, b) => Number(a.available_stock ?? 0) - Number(b.available_stock ?? 0));
    return results;
  }, [products, search, category, stockFilter, sortBy]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (loading) return <LoadingState message="Loading products…" />;
  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Products</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Active products available for your branch stock work
              {user?.branch?.name ? ` · ${branchName}` : ''}.
            </p>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <form
              className="search-bar"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                applyProductSearch();
              }}
            >
              <button
                className="search-bar-action"
                type="submit"
                title="Search"
                aria-label="Search products"
              >
                <NavIcon name="search" />
              </button>
              <input
                className="search-input"
                type="search"
                placeholder="Search by name, SKU, or category"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search products"
              />
            </form>
            <select
              className="filter-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by category"
            >
              <option value="All">All Categories</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by stock status"
            >
              {['All', 'Sufficient', 'Low', 'Out', 'Never Stocked'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All stock statuses' : s}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort products"
            >
              {['Product Name', 'Unit Price', 'On Hand'].map((s) => (
                <option key={s} value={s}>Sort: {s}</option>
              ))}
            </select>
          </div>
        </div>
        {paginated.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table corvex-table-products">
                <thead>
                  <tr>
                    <th className="cell-image">Image</th>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="cell-price">Unit Price</th>
                    <th>On Hand</th>
                    <th>Stock Status</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((product) => {
                    const neverStocked = !product.has_stock_record && product.stock_status == null;
                    const onHand = neverStocked ? null : Number(product.available_stock ?? 0);
                    const statusLabel = warehouseStockStatusLabel(product);
                    return (
                      <tr
                        key={product.product_id}
                        className="clickable-row"
                        onClick={() => navigate(`/warehouse/product/${product.product_id}`)}
                      >
                        <td className="cell-image">
                          <ProductThumb src={product.image_url} alt={product.product_name || ''} />
                        </td>
                        <td><span className="mono-cell">{product.sku || '—'}</span></td>
                        <td className="cell-name"><strong>{product.product_name}</strong></td>
                        <td>{product.category_name || '—'}</td>
                        <td className="cell-price">{formatCurrency(product.unit_price)}</td>
                        <td style={{ fontWeight: 600 }}>
                          {neverStocked ? (
                            <span title="Never stocked at your branch">—</span>
                          ) : onHand}
                        </td>
                        <td><StatusBadge status={statusLabel} /></td>
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="table-actions">
                            <button
                              className="icon-action-button"
                              type="button"
                              title="View"
                              onClick={() => navigate(`/warehouse/product/${product.product_id}`)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalRecords={filtered.length}
              pageSize={PAGE_SIZE}
              startRecord={filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}
              endRecord={Math.min(page * PAGE_SIZE, filtered.length)}
              prevPage={() => setPage((p) => Math.max(1, p - 1))}
              nextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
              goToPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="No products found"
            description="Adjust your search or filters. Catalog products are managed by Operating Manager."
            actionLabel="Clear filters"
            onAction={() => {
              setSearchInput('');
              setSearch('');
              setCategory('All');
              setStockFilter('All');
              setPage(1);
            }}
          />
        )}
      </section>
    </div>
  );
}
function ProductDetailPage({
  productId,
  navigate,
  showToast
}) {
  const user = getCurrentUser();
  const branchName = user?.branch?.name || 'your branch';
  const branchId = user?.branch?.id;
  const [productData, setProductData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient.get(`/products/${productId}`);
      if (res.data.success) setProductData(res.data.data);
      else setLoadError(res.data.message || 'Product not found.');
    } catch (err) {
      console.error('[ProductDetail] load error:', err.message);
      setLoadError(err.response?.data?.message || 'Failed to load product.');
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [productId]);

  const inventory = productData?.inventory || [];
  const movements = productData?.movements || [];
  const branchStock = useMemo(() => {
    if (!inventory.length) return null;
    if (branchId != null) {
      return inventory.find((row) => Number(row.branch_id) === Number(branchId)) || null;
    }
    return inventory[0] || null;
  }, [inventory, branchId]);

  const pagination_movements = usePagination(movements);
  const paginated_movements = pagination_movements.paginatedData;

  if (loading) return <LoadingState message="Loading product…" />;
  const product = productData;
  if (!product) {
    return (
      <EmptyState
        title={loadError || 'Product not found'}
        description="This product may not exist in the company catalog."
        actionLabel="Back to Products"
        onAction={() => navigate('/warehouse/products')}
      />
    );
  }

  const productName = product.product_name || product.name || '—';
  const sku = product.sku || '—';
  const categoryName = product.category_name || product.category || '—';
  const unitPrice = product.unit_price != null ? product.unit_price : product.unitPrice || 0;
  const neverStocked = !branchStock;
  const onHand = neverStocked ? 0 : Number(branchStock.available_stock ?? 0);
  const pendingOutbound = neverStocked ? 0 : Number(branchStock.pending_outbound ?? 0);
  const availableToTransfer = neverStocked
    ? 0
    : Number(branchStock.available_to_transfer ?? Math.max(0, onHand - pendingOutbound));
  const stockStatusLabel = neverStocked
    ? 'Never Stocked'
    : warehouseStockStatusLabel({ has_stock_record: true, stock_status: branchStock.stock_status });
  const lastUpdated = branchStock?.last_updated || branchStock?.updated_at || null;
  const canTransfer = availableToTransfer > 0;
  const showAlertBadge = ['Low Stock', 'Critical Stock', 'Out of Stock', 'Never Stocked'].includes(stockStatusLabel);

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="grid gap-5 md:grid-cols-2 items-start">
          <div className="flex gap-4 items-start">
            <ProductThumb src={product.image_url} alt={productName} size={96} />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>{productName}</h3>
              <p className="text-ink/70" style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
                <span className="mono-cell">{sku}</span>
              </p>
              <p className="text-ink/70" style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
                {categoryName}
                {' · '}{formatCurrency(unitPrice)}
                {product.unit_type ? ` · ${product.unit_type}` : ''}
              </p>
              {product.supplier_name ? (
                <p className="text-ink/70" style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                  Supplier: {product.supplier_name}
                </p>
              ) : null}
              {product.description ? (
                <p style={{ margin: '10px 0 0', fontSize: '0.9rem', lineHeight: 1.45 }}>
                  {product.description}
                </p>
              ) : null}
            </div>
          </div>

          <div style={{
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 12,
            padding: '16px 18px',
            background: 'rgba(15, 23, 42, 0.02)',
          }}>
            <div className="flex justify-between items-start gap-3 mb-3">
              <div>
                <p className="text-ink/70" style={{ margin: 0, fontSize: '0.78rem' }}>On Hand</p>
                <p style={{ margin: '4px 0 0', fontSize: '2.2rem', fontWeight: 700, lineHeight: 1 }}>{onHand}</p>
              </div>
              {showAlertBadge ? <StatusBadge status={stockStatusLabel} /> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              <div>
                <p className="text-ink/70" style={{ margin: 0, fontSize: '0.75rem' }}>Reorder level</p>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{neverStocked ? '—' : (branchStock.reorder_level ?? '—')}</p>
              </div>
              <div>
                <p className="text-ink/70" style={{ margin: 0, fontSize: '0.75rem' }}>Pending outbound</p>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{pendingOutbound}</p>
              </div>
              <div>
                <p className="text-ink/70" style={{ margin: 0, fontSize: '0.75rem' }}>Available to transfer</p>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{availableToTransfer}</p>
              </div>
              <div>
                <p className="text-ink/70" style={{ margin: 0, fontSize: '0.75rem' }}>Last updated</p>
                <p style={{ margin: '2px 0 0', fontWeight: 500, fontSize: '0.88rem' }}>
                  {lastUpdated ? formatDisplayDateTime(lastUpdated) : '—'}
                </p>
              </div>
            </div>
            {neverStocked ? (
              <p className="text-ink/70" style={{ margin: '12px 0 0', fontSize: '0.85rem' }}>
                No stock record yet — restock to start tracking at this branch.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                className="button"
                type="button"
                onClick={() => navigate(`/warehouse/restock-history/new?product=${productId}`)}
              >
                Restock
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigate(`/warehouse/stock-counts/new?product=${productId}`)}
              >
                Stock Count
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!canTransfer}
                title={canTransfer ? 'Transfer stock' : 'No units available to transfer'}
                onClick={() => navigate(`/warehouse/transfers/new?product=${productId}`)}
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3 style={{ margin: 0 }}>Recent stock movements</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
              Latest movements at {branchName}
            </p>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() => navigate(`/warehouse/movements?product=${productId}`)}
          >
            View all
          </button>
        </div>
        {movements.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Reference</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_movements.map((m, i) => (
                    <tr key={m.id || m.stock_movements_id || m.movement_id || i}>
                      <td>{m.movement_date ? formatDisplayDate(m.movement_date) : m.date ? formatDisplayDate(m.date) : '—'}</td>
                      <td><StatusBadge status={m.type} /></td>
                      <td style={{
                        fontWeight: 600,
                        color: (m.quantity || 0) > 0 ? '#2A9B6A' : '#dc2626',
                      }}>
                        {(m.quantity || 0) > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td>
                        <span className="mono-cell" style={{ fontSize: '0.82rem' }}>
                          {m.movement_ref ? formatDocumentRef(m.movement_ref) : (m.reason || '—')}
                        </span>
                      </td>
                      <td>{m.performed_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_movements} />
          </>
        ) : (
          <EmptyState
            title="No movements at your branch yet"
            description="Restock, stock count, or completed transfers will appear here."
          />
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/branch-stock')}>
          Back to Branch Stock
        </button>
        <button className="button secondary" type="button" onClick={() => navigate('/warehouse/products')}>
          Back to Products
        </button>
      </div>
    </div>
  );
}
function EditProductPage({
  productId,
  navigate,
  showToast
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [form, setForm] = useState({
    productName: '',
    sku: '',
    category: '',
    description: '',
    unitType: 'Unit',
    unitPrice: '',
    reorderPoint: '5',
    supplierId: '',
    status: 'Active',
    imageUrl: '',
    imageName: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prodRes, catRes, supRes] = await Promise.all([
          apiClient.get(`/products/${productId}`),
          apiClient.get('/products', { params: { limit: 1 } }),
          apiClient.get('/suppliers', { params: { status: 'Active', limit: 200 } }),
        ]);
        if (catRes.data?.success) setCategories(catRes.data.categories || []);
        if (supRes.data?.success) setSuppliers(supRes.data.data || []);
        if (prodRes.data?.success) {
          const p = prodRes.data.data;
          setImageUrl(p.image_url || '');
          setImageFile(null);
          setImageRemoved(false);
          setForm({
            productName: p.product_name || '',
            sku: p.sku || '',
            category: p.category_id != null ? String(p.category_id) : '',
            description: p.description || '',
            unitType: p.unit_type || 'Unit',
            unitPrice: p.unit_price != null ? String(p.unit_price) : '',
            reorderPoint: p.reorder_point != null ? String(p.reorder_point) : '5',
            supplierId: p.supplier_id != null ? String(p.supplier_id) : '',
            status: p.status || 'Active',
            imageUrl: p.image_url || '',
            imageName: p.image_url ? 'Current image' : '',
          });
        }
      } catch (err) {
        console.error('[EditProduct] load error:', err.message);
        showToast('Failed to load product.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [productId, showToast]);

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!form.productName.trim()) nextErrors.productName = 'Product name is required.';
    if (!form.category) nextErrors.category = 'Category is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    if (submitting) return;
    const confirmed = await confirmAction({
      title: 'Confirm changes',
      message: 'This saves your edits to the product record, including price, status, and photo.',
      detail: form.productName.trim(),
      confirmLabel: 'Save changes',
    });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.productName.trim(),
        category_id: Number(form.category),
        description: form.description.trim() || null,
        unit_type: form.unitType.trim() || 'Unit',
        unit_price: form.unitPrice !== '' ? Number(form.unitPrice) : 0,
        reorder_point: form.reorderPoint !== '' ? Number(form.reorderPoint) : 5,
        supplier_id: form.supplierId ? Number(form.supplierId) : null,
        status: form.status,
        image_url: form.imageUrl || null,
      };
      const res = await apiClient.put(`/products/${productId}`, payload);
      if (!res.data?.success) {
        showToast(res.data?.message || 'Update failed.', 'error');
        return;
      }
      if (imageFile) {
        const uploaded = await uploadProductImage(productId, imageFile);
        if (!uploaded.success) {
          showToast(uploaded.message || 'Product saved, but the image could not be updated.', 'error');
          return;
        }
      } else if (imageRemoved) {
        const removed = await deleteProductImage(productId);
        if (!removed.success) {
          showToast(removed.message || 'Product saved, but the image could not be removed.', 'error');
          return;
        }
      }
      showToast('Product updated.', 'success');
      navigate(`/warehouse/product/${productId}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update product.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState message="Loading product..." />;

  return <div className="page">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Edit Product</h3></div>
        <ProductImagePicker
          currentUrl={imageUrl}
          file={imageFile}
          removed={imageRemoved}
          showToast={showToast}
          onFile={(next) => {
            setImageFile(next);
            setImageRemoved(false);
          }}
          onRemove={() => {
            setImageFile(null);
            setImageRemoved(true);
          }}
        />
        <div className="form-group">
          <label>SKU</label>
          <p className="field-preview"><span style={{ fontFamily: 'monospace' }}>{form.sku || '—'}</span></p>
          <p className="text-ink/60" style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>SKU cannot be changed after creation.</p>
        </div>
        <div className="form-group">
          <label>Product Name<span className="required">*</span></label>
          <input type="text" value={form.productName} onChange={e => setForm(p => ({ ...p, productName: e.target.value }))} />
          {errors.productName ? <p className="form-error">{errors.productName}</p> : null}
        </div>
        <div className="form-group">
          <label>Category<span className="required">*</span></label>
          <select className="filter-select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
            <option value="">Select category</option>
            {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
          </select>
          {errors.category ? <p className="form-error">{errors.category}</p> : null}
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Unit Type</label>
          <input type="text" value={form.unitType} onChange={e => setForm(p => ({ ...p, unitType: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Unit Price</label>
          <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => setForm(p => ({ ...p, unitPrice: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Reorder Point</label>
          <input type="number" min="0" value={form.reorderPoint} onChange={e => setForm(p => ({ ...p, reorderPoint: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Supplier</label>
          <select className="filter-select" value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))}>
            <option value="">None</option>
            {suppliers.map(s => <option key={s.suppliers_id} value={s.suppliers_id}>{s.supplier_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select className="filter-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}`)}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </div>;
}
function AddProductPage({
  navigate,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [form, setForm] = useState({
    productName: '',
    sku: '',
    category: '',
    description: '',
    unitType: 'Unit',
    unitPrice: '',
    reorderPoint: '5',
    supplierId: '',
    initialQuantity: '',
    imageUrl: '',
    imageName: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadMeta() {
      try {
        const [catRes, supRes] = await Promise.all([
          apiClient.get('/products', { params: { limit: 1 } }),
          apiClient.get('/suppliers', { params: { status: 'Active', limit: 200 } }),
        ]);
        if (catRes.data?.success) setCategories(catRes.data.categories || []);
        if (supRes.data?.success) setSuppliers(supRes.data.data || []);
      } catch {
        /* optional */
      }
    }
    loadMeta();
  }, []);

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!form.productName.trim()) nextErrors.productName = 'Product name is required.';
    if (!form.sku.trim()) nextErrors.sku = 'SKU is required.';
    if (!form.category) nextErrors.category = 'Category is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    if (submitting) return;
    const confirmed = await confirmAction({
      title: 'Create product',
      message: 'This adds a new product to the catalog and can set its starting quantity at your branch.',
      detail: form.productName.trim(),
      confirmLabel: 'Create product',
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const result = await createWarehouseProduct({
        name: form.productName.trim(),
        sku: form.sku.trim(),
        category_id: Number(form.category),
        description: form.description.trim() || null,
        unit_type: form.unitType.trim() || 'Unit',
        reorder_point: form.reorderPoint !== '' ? Number(form.reorderPoint) : 5,
        unit_price: form.unitPrice !== '' ? Number(form.unitPrice) : 0,
        supplier_id: form.supplierId ? Number(form.supplierId) : null,
        initial_quantity: form.initialQuantity !== '' ? Number(form.initialQuantity) : 0,
        image_url: form.imageUrl || null,
      });
      if (!result.success) {
        showToast(result.message || 'Failed to create product.', 'error');
        return;
      }
      const createdId = result.data?.product_id;
      if (imageFile && createdId) {
        const uploaded = await uploadProductImage(createdId, imageFile);
        if (!uploaded.success) {
          showToast(uploaded.message || 'Product was created, but the image could not be saved.', 'error');
          navigate(`/warehouse/product/${createdId}`);
          return;
        }
      }
      showToast('Product record created successfully.', 'success');
      navigate('/warehouse/products');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create product.', 'error');
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="page">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Add New Product</h3></div>
        <ProductImagePicker
          file={imageFile}
          removed={imageRemoved}
          showToast={showToast}
          onFile={(next) => {
            setImageFile(next);
            setImageRemoved(false);
          }}
          onRemove={() => {
            setImageFile(null);
            setImageRemoved(true);
          }}
        />
        {[{
        name: 'productName',
        label: 'Product Name',
        type: 'text',
        required: true
      }, {
        name: 'sku',
        label: 'SKU',
        type: 'text',
        required: true
      }, {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: categories,
        optionValue: 'category_id',
        optionLabel: 'category_name'
      }, {
        name: 'description',
        label: 'Description',
        type: 'textarea'
      }, {
        name: 'unitType',
        label: 'Unit Type',
        type: 'text'
      }, {
        name: 'unitPrice',
        label: 'Unit Price',
        type: 'number'
      }, {
        name: 'reorderPoint',
        label: 'Reorder Point',
        type: 'number'
      }, {
        name: 'supplierId',
        label: 'Supplier',
        type: 'select',
        options: suppliers,
        optionValue: 'suppliers_id',
        optionLabel: 'supplier_name',
        optional: true
      }, {
        name: 'initialQuantity',
        label: 'Initial Quantity (this branch)',
        type: 'number'
      }].map(field => <div key={field.name} className="form-group">
            <label>{field.label}{field.required ? <span className="required">*</span> : null}</label>
            {field.type === 'select' ? <select className="filter-select" value={form[field.name]} onChange={e => setForm(p => ({
          ...p,
          [field.name]: e.target.value
        }))}>
                <option value="">{field.optional ? 'Optional' : 'Select'}</option>
                {(field.optionValue
                  ? field.options.map((o) => (
                    <option key={o[field.optionValue]} value={o[field.optionValue]}>{o[field.optionLabel]}</option>
                  ))
                  : field.options.map((o) => <option key={o}>{o}</option>))}
              </select> : field.type === 'textarea' ? <textarea value={form[field.name]} onChange={e => setForm(p => ({
          ...p,
          [field.name]: e.target.value
        }))} /> : field.name === 'initialQuantity' ? <QuantityStepper
                value={form.initialQuantity}
                min={0}
                onChange={(next) => setForm((p) => ({ ...p, initialQuantity: next }))}
                aria-label="Initial quantity"
              /> : <input type={field.type} value={form[field.name]} onChange={e => setForm(p => ({
          ...p,
          [field.name]: e.target.value
        }))} />}
            {errors[field.name] ? <p className="form-error">{errors[field.name]}</p> : null}
          </div>)}
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/warehouse/products')}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Product Record'}
        </button>
      </div>
    </div>;
}
function StockCountPage({ productId, navigate, showToast }) {
  return (
    <StockCountDocumentForm
      navigate={navigate}
      showToast={showToast}
      initialProductId={productId || ''}
      cancelTo={productId ? `/warehouse/product/${productId}` : '/warehouse/stock-counts'}
    />
  );
}

function StockCountNewPage({ navigate, showToast }) {
  const params = new URLSearchParams(window.location.search);
  return (
    <StockCountDocumentForm
      navigate={navigate}
      showToast={showToast}
      initialProductId={params.get('product') || ''}
      cancelTo="/warehouse/stock-counts"
    />
  );
}

function StockCountHistoryPage({ navigate }) {
  const user = getCurrentUser();
  const branchName = user?.branch?.name || 'your branch';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchStockCounts();
      if (!cancelled) {
        setRows(result.success ? (result.data || []) : []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadTick]);

  useEffect(() => {
    const onFocus = () => setReloadTick((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const pagination = usePagination(rows, { pageSize: PAGE_SIZE });

  if (loading && !rows.length) return <LoadingState message="Loading stock counts…" />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Stock Counts</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Physical inventory verification sessions · {branchName}
            </p>
          </div>
          <button className="button whitespace-nowrap" type="button" onClick={() => navigate('/warehouse/stock-counts/new')}>
            + New Stock Count
          </button>
        </div>

        {loading ? (
          <LoadingState message="Refreshing stock counts…" />
        ) : rows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Products counted</th>
                    <th>Discrepancies</th>
                    <th>Status</th>
                    <th>Counted by</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((row) => (
                    <tr
                      key={row.count_id}
                      className="clickable-row"
                      onClick={() => navigate(`/warehouse/stock-counts/${row.count_id}`)}
                    >
                      <td><span className="mono-cell">{formatDocumentRef(row.count_ref)}</span></td>
                      <td>{row.created_at ? formatDisplayDateTime(row.created_at) : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{row.line_count ?? 0}</td>
                      <td style={{
                        fontWeight: 600,
                        color: Number(row.discrepancy_count) > 0 ? '#dc2626' : undefined,
                      }}>
                        {row.discrepancy_count ?? 0}
                      </td>
                      <td><StatusBadge status={row.status || 'Completed'} /></td>
                      <td>{row.counted_by_name || '—'}</td>
                      <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View"
                          onClick={() => navigate(`/warehouse/stock-counts/${row.count_id}`)}
                        >
                          <NavIcon name="view" />
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
            title="No stock counts yet"
            description="Start a session to verify physical quantities for one or more products."
            actionLabel="New Stock Count"
            onAction={() => navigate('/warehouse/stock-counts/new')}
          />
        )}
      </section>
    </div>
  );
}

function StockCountDetailPage({ countId, navigate }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      const result = await fetchStockCountById(countId);
      if (!cancelled) {
        if (result.success) setDetail(result.data);
        else {
          setDetail(null);
          setError(result.message || 'Stock count not found.');
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [countId]);

  if (loading) return <LoadingState message="Loading stock count…" />;
  if (!detail) {
    return (
      <EmptyState
        title={error || 'Stock count not found'}
        actionLabel="Back to Stock Counts"
        onAction={() => navigate('/warehouse/stock-counts')}
      />
    );
  }

  const lines = detail.lines || [];
  const movementSearch = detail.count_ref || '';

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>{detail.count_ref ? formatDocumentRef(detail.count_ref) : `Count #${detail.count_id}`}</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              {detail.created_at ? formatDisplayDateTime(detail.created_at) : '—'}
              {' · '}{detail.counted_by_name || '—'}
              {' · '}<StatusBadge status={detail.status || 'Completed'} />
            </p>
          </div>
        </div>
        <div className="saw-stat-grid" style={{ marginTop: 12 }}>
          <div className="saw-stat">
            <span>Products counted</span>
            <strong>{detail.line_count ?? lines.length}</strong>
          </div>
          <div className="saw-stat">
            <span>Discrepancies</span>
            <strong>{detail.discrepancy_count ?? 0}</strong>
          </div>
        </div>
        {detail.notes ? (
          <p style={{ margin: '12px 0 0', fontSize: '0.9rem' }}>
            <span className="text-ink/70">Notes: </span>{detail.notes}
          </p>
        ) : null}
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <h3 style={{ marginTop: 0 }}>Counted products</h3>
        {lines.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>System qty</th>
                  <th>Physical</th>
                  <th>Variance</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const v = Number(line.variance) || 0;
                  return (
                    <tr key={line.line_id || line.product_id}>
                      <td>
                        <button
                          className="button ghost"
                          type="button"
                          style={{ padding: 0 }}
                          onClick={() => navigate(`/warehouse/product/${line.product_id}`)}
                        >
                          {line.product_name || '—'}
                        </button>
                      </td>
                      <td><span className="mono-cell">{line.sku || '—'}</span></td>
                      <td>{line.system_quantity}</td>
                      <td>{line.physical_quantity}</td>
                      <td style={{
                        fontWeight: 600,
                        color: v !== 0 ? (v > 0 ? '#2A9B6A' : '#dc2626') : undefined,
                      }}>
                        {v > 0 ? `+${v}` : v}
                      </td>
                      <td>{line.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No lines" description="This stock count has no product lines." />
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/stock-counts')}>
          Back to Stock Counts
        </button>
        {movementSearch ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/warehouse/movements?search=${encodeURIComponent(movementSearch)}`)}
          >
            Related stock movements
          </button>
        ) : null}
      </div>
    </div>
  );
}
const KNOWN_MOVEMENT_TYPES = [
  'All',
  'Restock',
  'Transfer In',
  'Transfer Out',
  'Stock Count Adjustment',
  'Sale Deduction',
];

function defaultMovementDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

function formatSignedQty(qty) {
  const n = Number(qty) || 0;
  return n > 0 ? `+${n}` : String(n);
}

function movementTotalLabel(txn) {
  if (!txn) return '—';
  if (txn.mixed_units) {
    return `${txn.product_count || 0} lines · mixed units`;
  }
  const total = formatSignedQty(txn.total_quantity);
  return txn.unit_type ? `${total} ${txn.unit_type}` : total;
}

function MovementsPage({
  navigate
}) {
  const user = getCurrentUser();
  const branchName = user?.branch?.name || 'your branch';
  const urlParams = new URLSearchParams(window.location.search);
  const urlProductId = urlParams.get('product') || '';
  const urlSearch = urlParams.get('search') || '';
  const [defaults] = useState(() => defaultMovementDateRange());
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [productSearchInput, setProductSearchInput] = useState(urlSearch);
  const [productSearch, setProductSearch] = useState(urlSearch);
  const [productIdFilter, setProductIdFilter] = useState(urlProductId);
  const [typeFilter, setTypeFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const applyMovementSearch = () => {
    const next = productSearchInput.trim();
    setProductSearch(next);
    if (next && productIdFilter) setProductIdFilter('');
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      const params = {};
      if (typeFilter !== 'All') params.type = typeFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (productIdFilter) params.product_id = productIdFilter;
      if (productSearch) params.search = productSearch;
      const result = await fetchStockMovements(params);
      if (cancelled) return;
      if (result.success) {
        setTransactions(result.data || []);
      } else {
        setTransactions([]);
        setError(result.message || 'Failed to load stock movements.');
      }
      setHasLoadedOnce(true);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [typeFilter, dateFrom, dateTo, productIdFilter, productSearch, reloadTick]);

  useEffect(() => {
    const onFocus = () => setReloadTick((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const typeOptions = useMemo(() => {
    const fromData = transactions.map((m) => m.type).filter(Boolean);
    return [...new Set([...KNOWN_MOVEMENT_TYPES, ...fromData])];
  }, [transactions]);

  const filtersAtDefault = typeFilter === 'All'
    && dateFrom === defaults.dateFrom
    && dateTo === defaults.dateTo
    && !productSearch.trim()
    && !productIdFilter;

  const clearFilters = () => {
    setTypeFilter('All');
    setDateFrom(defaults.dateFrom);
    setDateTo(defaults.dateTo);
    setProductSearchInput('');
    setProductSearch('');
    setProductIdFilter('');
  };

  const pagination = usePagination(transactions, {
    pageSize: PAGE_SIZE,
    resetKey: `${typeFilter}|${dateFrom}|${dateTo}|${productSearch}|${productIdFilter}`,
  });

  if (loading && !hasLoadedOnce) return <LoadingState message="Loading stock movements…" />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Stock Movements</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Inventory transactions for your branch · {branchName}
            </p>
          </div>
        </div>

        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <form
              className="search-bar"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                applyMovementSearch();
              }}
            >
              <button
                className="search-bar-action"
                type="submit"
                title="Search"
                aria-label="Search movements"
              >
                <NavIcon name="search" />
              </button>
              <input
                className="search-input"
                type="search"
                placeholder="Search product, SKU, or reference"
                value={productSearchInput}
                onChange={(e) => setProductSearchInput(e.target.value)}
                aria-label="Search movements by product, SKU, or reference"
              />
            </form>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by movement type"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t === 'All' ? 'All types' : t}</option>
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
            <button className="button ghost" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        </div>

        {productIdFilter ? (
          <p className="text-ink/70" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Showing transactions that include one product.{' '}
            <button className="button ghost" type="button" style={{ padding: 0 }} onClick={() => setProductIdFilter('')}>
              Clear product filter
            </button>
          </p>
        ) : null}

        {error ? (
          <EmptyState
            title="Could not load movements"
            description={error}
            actionLabel="Retry"
            onAction={() => setReloadTick((n) => n + 1)}
          />
        ) : loading ? (
          <LoadingState message="Refreshing movements…" />
        ) : transactions.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Products</th>
                    <th>Total quantity</th>
                    <th>Performed by</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((txn) => {
                    const detailId = txn.representative_movement_id || txn.movement_id;
                    const preview = (txn.product_preview || []).filter(Boolean);
                    const reference = formatDocumentRef(txn.document_ref || txn.movement_ref);
                    return (
                      <tr
                        key={txn.group_key || detailId}
                        className="clickable-row"
                        onClick={() => detailId && navigate(`/warehouse/movements/${detailId}`)}
                      >
                        <td>
                          <span className="mono-cell">{reference}</span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{formatDisplayDate(txn.movement_date)}</td>
                        <td><StatusBadge status={txn.type} /></td>
                        <td>
                          <strong>{txn.product_count ?? 0}</strong>
                          {preview.length ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {preview.join(', ')}
                              {Number(txn.product_count) > preview.length ? '…' : ''}
                            </span>
                          ) : null}
                        </td>
                        <td style={{
                          fontWeight: 600,
                          color: txn.mixed_units
                            ? undefined
                            : (Number(txn.total_quantity) > 0 ? '#2A9B6A' : Number(txn.total_quantity) < 0 ? '#dc2626' : undefined),
                        }}>
                          {movementTotalLabel(txn)}
                        </td>
                        <td>{txn.performed_by_name || '—'}</td>
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="table-actions">
                            <button
                              className="icon-action-button"
                              type="button"
                              title="View"
                              disabled={!detailId}
                              onClick={() => detailId && navigate(`/warehouse/movements/${detailId}`)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </div>
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
            title={filtersAtDefault ? 'No movements yet' : 'No movements match these filters'}
            description={
              filtersAtDefault
                ? 'Restocks, transfers, stock counts, and sales at your branch will appear here as transactions.'
                : 'Try a wider date range or clear filters.'
            }
            actionLabel={filtersAtDefault ? undefined : 'Clear filters'}
            onAction={filtersAtDefault ? undefined : clearFilters}
          />
        )}
      </section>
    </div>
  );
}

function MovementDetailPage({
  movementId,
  navigate
}) {
  const [txn, setTxn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError('');
      const result = await fetchStockMovementById(movementId);
      if (result.success) setTxn(result.data);
      else {
        setTxn(null);
        setLoadError(result.message || 'Movement not found.');
      }
      setLoading(false);
    }
    load();
  }, [movementId]);

  if (loading) return <LoadingState message="Loading transaction…" />;
  if (!txn) {
    return (
      <EmptyState
        title={loadError || 'Transaction not found'}
        actionLabel="Back to Movements"
        onAction={() => navigate('/warehouse/movements')}
      />
    );
  }

  const related = txn.related_document;
  const lines = Array.isArray(txn.lines) && txn.lines.length
    ? txn.lines
    : [{
      movement_id: txn.movement_id,
      product_id: txn.product_id,
      product_name: txn.product_name,
      sku: txn.sku,
      unit_type: txn.unit_type,
      quantity: txn.quantity,
      type: txn.type,
      movement_ref: txn.movement_ref,
    }];

  const infoRows = [
    { label: 'Reference', value: <span className="mono-cell">{formatDocumentRef(txn.document_ref || txn.movement_ref)}</span> },
    { label: 'Type', value: <StatusBadge status={txn.type} /> },
    { label: 'Date', value: formatDisplayDate(txn.movement_date) },
    { label: 'Recorded at', value: formatDisplayDateTime(txn.created_at) },
    { label: 'Performed by', value: txn.performed_by_name || '—' },
    { label: 'Branch', value: txn.branch_name || '—' },
    { label: 'Products', value: String(txn.product_count ?? lines.length) },
    { label: 'Total quantity', value: movementTotalLabel(txn) },
  ];

  if (related?.status) {
    infoRows.splice(2, 0, { label: 'Status', value: <StatusBadge status={related.status} /> });
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Movement transaction</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              <span className="mono-cell">{formatDocumentRef(txn.document_ref || txn.movement_ref)}</span>
              {' · '}{txn.type || '—'}
            </p>
          </div>
          <StatusBadge status={txn.type} />
        </div>
        <DetailRowsTable rows={infoRows} />
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <h3 style={{ marginTop: 0 }}>Product details</h3>
        <div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Movement</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.movement_id || `${line.product_id}-${line.quantity}`}>
                  <td>
                    {line.product_id ? (
                      <button
                        className="button ghost"
                        type="button"
                        style={{ padding: 0 }}
                        onClick={() => navigate(`/warehouse/product/${line.product_id}`)}
                      >
                        {line.product_name || '—'}
                      </button>
                    ) : (line.product_name || '—')}
                  </td>
                  <td><span className="mono-cell">{line.sku || '—'}</span></td>
                  <td style={{
                    fontWeight: 600,
                    color: Number(line.quantity) > 0 ? '#2A9B6A' : Number(line.quantity) < 0 ? '#dc2626' : undefined,
                  }}>
                    {formatSignedQty(line.quantity)}
                  </td>
                  <td>{line.unit_type || 'Unit'}</td>
                  <td><StatusBadge status={line.type || txn.type} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {related?.kind === 'restock' ? (
        <section className="panel content-panel relative overflow-hidden">
          <h3 style={{ marginTop: 0 }}>Restock details</h3>
          <DetailRowsTable rows={[
            { label: 'Restock ref', value: <span className="mono-cell">{formatDocumentRef(related.ref)}</span> },
            { label: 'Delivery ref', value: <span className="mono-cell">{formatDocumentRef(related.delivery_ref)}</span> },
            { label: 'Supplier', value: related.supplier_name || '—' },
            { label: 'Received date', value: related.received_date ? formatDisplayDate(related.received_date) : '—' },
            { label: 'Recorded by', value: related.recorded_by_name || '—' },
            ...(related.notes ? [{ label: 'Notes', value: related.notes }] : []),
          ]} />
        </section>
      ) : null}

      {related?.kind === 'transfer' ? (
        <section className="panel content-panel relative overflow-hidden">
          <h3 style={{ marginTop: 0 }}>Transfer details</h3>
          <DetailRowsTable rows={[
            { label: 'Transfer ref', value: <span className="mono-cell">{formatDocumentRef(related.ref)}</span> },
            { label: 'Status', value: related.status ? <StatusBadge status={related.status} /> : '—' },
            { label: 'Source branch', value: related.source_branch || '—' },
            { label: 'Destination branch', value: related.destination_branch || '—' },
            { label: 'Submitted by', value: related.submitted_by_name || '—' },
            { label: 'Approved by', value: related.approved_by_name || '—' },
            { label: 'Completed', value: related.completed_date ? formatDisplayDate(related.completed_date) : '—' },
            ...(related.notes ? [{ label: 'Notes', value: related.notes }] : []),
          ]} />
        </section>
      ) : null}

      {related?.kind === 'stock_count' ? (
        <section className="panel content-panel relative overflow-hidden">
          <h3 style={{ marginTop: 0 }}>Stock count details</h3>
          <DetailRowsTable rows={[
            { label: 'Count ref', value: <span className="mono-cell">{formatDocumentRef(related.ref)}</span> },
            { label: 'Status', value: related.status ? <StatusBadge status={related.status} /> : '—' },
            { label: 'Counted by', value: related.counted_by_name || '—' },
            { label: 'Counted at', value: related.created_at ? formatDisplayDateTime(related.created_at) : '—' },
            ...(related.notes ? [{ label: 'Session notes', value: related.notes }] : []),
          ]} />
          {Array.isArray(related.lines) && related.lines.length ? (
            <div className="corvex-table-wrapper" style={{ marginTop: 12 }}>
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>System qty</th>
                    <th>Physical</th>
                    <th>Variance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {related.lines.map((line) => {
                    const v = Number(line.variance) || 0;
                    return (
                      <tr key={line.line_id || line.product_id}>
                        <td>
                          <strong>{line.product_name || '—'}</strong>
                          <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                            {line.sku || '—'}
                          </span>
                        </td>
                        <td>{line.system_quantity}</td>
                        <td>{line.physical_quantity}</td>
                        <td style={{
                          fontWeight: 600,
                          color: v !== 0 ? (v > 0 ? '#2A9B6A' : '#dc2626') : undefined,
                        }}>
                          {formatSignedQty(v)}
                        </td>
                        <td>{line.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {(related?.kind === 'sale_ref' || related?.kind === 'sale_reversal') ? (
        <section className="panel content-panel relative overflow-hidden">
          <h3 style={{ marginTop: 0 }}>Sale reference</h3>
          <DetailRowsTable rows={[
            { label: 'Reference', value: <span className="mono-cell">{formatDocumentRef(related.ref)}</span> },
          ]} />
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/movements')}>
          Back to Movements
        </button>
        {related?.kind === 'restock' && related.id ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/warehouse/restock-history/${related.id}`)}
          >
            Open restock
          </button>
        ) : null}
        {related?.kind === 'transfer' && related.id ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/warehouse/transfers/${related.id}`)}
          >
            Open transfer
          </button>
        ) : null}
        {related?.kind === 'stock_count' && related.id ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/warehouse/stock-counts/${related.id}`)}
          >
            Open stock count
          </button>
        ) : null}
      </div>
    </div>
  );
}
function TransferRequestNewPage({ navigate, showToast }) {
  const params = new URLSearchParams(window.location.search);
  return (
    <TransferDocumentForm
      navigate={navigate}
      showToast={showToast}
      initialProductId={params.get('product') || ''}
    />
  );
}

function transferTouchesBranch(t, branchId) {
  return Number(t.source_branch_id) === Number(branchId)
    || Number(t.destination_branch_id) === Number(branchId);
}

function transferIsOpen(t) {
  return isTransferPendingApproval(t.status)
    || t.status === 'Approved'
    || t.status === 'Shipped';
}

function transferIsFinalized(status) {
  return status === 'Received' || status === 'Completed';
}

const TRANSFER_REQUEST_SEGMENTS = ['Action required', 'Awaiting approval', 'Incoming', 'All'];

function TransfersPage({
  navigate,
  showToast,
  transferTab: transferTabProp = 'requests',
  transferSegment: transferSegmentProp = 'Action required',
}) {
  const user = getCurrentUser();
  const branchId = user?.branch?.id ?? user?.branchId;
  const branchName = user?.branch?.name || 'your branch';
  const mainTab = transferTabProp === 'history' ? 'history' : 'requests';
  const [requestSegment, setRequestSegment] = useState(
    TRANSFER_REQUEST_SEGMENTS.includes(transferSegmentProp)
      ? transferSegmentProp
      : 'Action required'
  );

  useEffect(() => {
    if (TRANSFER_REQUEST_SEGMENTS.includes(transferSegmentProp)) {
      setRequestSegment(transferSegmentProp);
    }
  }, [transferSegmentProp]);
  const [statusFilter, setStatusFilter] = useState('Closed');
  const [search, setSearch] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('All');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchInventoryTransfers();
      if (cancelled) return;
      if (result.success) {
        setTransfers(result.data || []);
      } else {
        setTransfers([]);
        showToast?.(result.message || 'Failed to load transfers.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reloadTick, showToast]);

  useEffect(() => {
    const onFocus = () => setReloadTick((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const setMainTab = (tab) => {
    if (tab === 'history') {
      navigate('/warehouse/transfers?tab=history');
      return;
    }
    navigate(`/warehouse/transfers?tab=requests&segment=${encodeURIComponent(requestSegment)}`);
  };

  const setRequestSegmentAndUrl = (segment) => {
    setRequestSegment(segment);
    navigate(`/warehouse/transfers?tab=requests&segment=${encodeURIComponent(segment)}`);
  };

  const counts = useMemo(() => {
    const awaiting = transfers.filter((t) => isTransferPendingApproval(t.status)
      && Number(t.source_branch_id) === Number(branchId)).length;
    const readyToShip = transfers.filter((t) => t.status === 'Approved'
      && Number(t.source_branch_id) === Number(branchId)).length;
    // Incoming = shipped inbound waiting for destination receive.
    const incoming = transfers.filter((t) => t.status === 'Shipped'
      && Number(t.destination_branch_id) === Number(branchId)
      && Number(t.source_branch_id) !== Number(branchId)).length;
    const openAll = transfers.filter((t) => transferTouchesBranch(t, branchId) && transferIsOpen(t)).length;
    return { awaiting, readyToShip, incoming, openAll };
  }, [transfers, branchId]);

  const destinationOptions = useMemo(() => {
    const names = [...new Set(transfers.map((t) => t.destination_branch).filter(Boolean))].sort();
    return names;
  }, [transfers]);

  const requestsFiltered = useMemo(() => {
    let list = [];
    if (requestSegment === 'Action required') {
      list = transfers.filter((t) => (
        (t.status === 'Approved' && Number(t.source_branch_id) === Number(branchId))
        || (t.status === 'Shipped' && Number(t.destination_branch_id) === Number(branchId))
      ));
    } else if (requestSegment === 'Awaiting approval') {
      list = transfers.filter((t) => isTransferPendingApproval(t.status)
        && Number(t.source_branch_id) === Number(branchId));
    } else if (requestSegment === 'Incoming') {
      list = transfers.filter((t) => t.status === 'Shipped'
        && Number(t.destination_branch_id) === Number(branchId)
        && Number(t.source_branch_id) !== Number(branchId));
    } else {
      // All open transfers that touch this branch (outbound + inbound).
      list = transfers.filter((t) => transferTouchesBranch(t, branchId) && transferIsOpen(t));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => String(t.transfer_ref || '').toLowerCase().includes(q)
        || String(t.product_name || '').toLowerCase().includes(q)
        || String(t.destination_branch || '').toLowerCase().includes(q));
    }
    if (destinationFilter !== 'All') {
      list = list.filter((t) => t.destination_branch === destinationFilter);
    }
    return list;
  }, [requestSegment, transfers, branchId, search, destinationFilter]);

  const historyFiltered = useMemo(() => {
    let list = transfers.filter((t) => transferTouchesBranch(t, branchId));
    if (statusFilter === 'Closed') {
      list = list.filter((t) => transferIsFinalized(t.status) || t.status === 'Rejected');
    } else if (statusFilter === 'Pending') {
      list = list.filter((t) => isTransferPendingApproval(t.status));
    } else if (statusFilter === 'Approved') {
      list = list.filter((t) => t.status === 'Approved');
    } else if (statusFilter === 'Shipped') {
      list = list.filter((t) => t.status === 'Shipped');
    } else if (statusFilter === 'Completed') {
      list = list.filter((t) => transferIsFinalized(t.status));
    } else if (statusFilter === 'Rejected') {
      list = list.filter((t) => t.status === 'Rejected');
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => String(t.transfer_ref || '').toLowerCase().includes(q)
        || String(t.product_name || '').toLowerCase().includes(q)
        || String(t.destination_branch || '').toLowerCase().includes(q));
    }
    if (destinationFilter !== 'All') {
      list = list.filter((t) => t.destination_branch === destinationFilter);
    }
    return list;
  }, [statusFilter, transfers, branchId, search, destinationFilter]);

  const activeList = mainTab === 'history' ? historyFiltered : requestsFiltered;
  const pagination = usePagination(activeList, {
    pageSize: PAGE_SIZE,
    resetKey: `${mainTab}|${requestSegment}|${statusFilter}|${search}|${destinationFilter}`,
  });

  const emptyCopy = (() => {
    if (mainTab === 'history') {
      return {
        title: 'No transfers match',
        description: 'Adjust filters to see completed or rejected transfers.',
        actionLabel: undefined,
      };
    }
    if (requestSegment === 'Action required') {
      return {
        title: 'Nothing to ship or receive',
        description: 'Ship approved outbound transfers, or receive inbound transfers that the source already shipped.',
        actionLabel: undefined,
      };
    }
    if (requestSegment === 'Awaiting approval') {
      return {
        title: 'No requests waiting on a manager',
        description: 'Submitted transfers stay here until Branch Head or OM approves in Approval Center.',
        actionLabel: 'New Transfer',
      };
    }
    if (requestSegment === 'Incoming') {
      return {
        title: 'No inbound transfers to receive',
        description: 'After the source warehouse ships, confirm receipt here to add destination stock.',
        actionLabel: undefined,
      };
    }
    return {
      title: 'No open transfers',
      description: 'Open outbound and inbound transfers for your branch will appear here.',
      actionLabel: 'New Transfer',
    };
  })();

  const openDetail = (id) => {
    const from = mainTab === 'history' ? 'history' : 'requests';
    navigate(`/warehouse/transfers/${id}?from=${from}`);
  };

  if (loading && !transfers.length) return <LoadingState message="Loading transfers…" />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Transfers</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Request stock moves from your branch, track approval, and confirm shipment.
              {' · '}From: <strong>{branchName}</strong>
            </p>
          </div>
          <button className="button whitespace-nowrap" type="button" onClick={() => navigate('/warehouse/transfers/new')}>
            + New Transfer
          </button>
        </div>

        <div className="transfers-toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented-control">
            <button className={mainTab === 'requests' ? 'segment active' : 'segment'} type="button" onClick={() => setMainTab('requests')}>
              Active
            </button>
            <button className={mainTab === 'history' ? 'segment active' : 'segment'} type="button" onClick={() => setMainTab('history')}>
              History
            </button>
          </div>
        </div>

        {mainTab === 'requests' ? (
          <div className="transfers-filter-bar" style={{ marginBottom: 12 }}>
            <div className="segmented-control">
              {[
                { key: 'Action required', label: `Action required (${counts.readyToShip})` },
                { key: 'Awaiting approval', label: `Awaiting approval (${counts.awaiting})` },
                { key: 'Incoming', label: `Incoming (${counts.incoming})` },
                { key: 'All', label: `All (${counts.openAll})` },
              ].map((s) => (
                <button
                  key={s.key}
                  className={requestSegment === s.key ? 'segment active' : 'segment'}
                  type="button"
                  onClick={() => setRequestSegmentAndUrl(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="list-section-controls" style={{ marginBottom: 12 }}>
          <input
            className="filter-input search"
            type="search"
            placeholder="Search by transfer ref or product"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search transfers"
          />
          {mainTab === 'history' ? (
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {['Closed', 'All', 'Pending', 'Approved', 'Shipped', 'Completed', 'Rejected'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
              ))}
            </select>
          ) : null}
          <select
            className="filter-select"
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value)}
            aria-label="Filter by destination"
          >
            <option value="All">All destinations</option>
            {destinationOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {activeList.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table corvex-table-transfers">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Route</th>
                    <th>Products</th>
                    <th>Total units</th>
                    <th>Submitted</th>
                    <th>By</th>
                    <th>Status</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((t) => {
                    const lineCount = Number(t.line_count) || 0;
                    return (
                      <tr
                        key={t.transfer_id}
                        className="clickable-row"
                        onClick={() => openDetail(t.transfer_id)}
                      >
                        <td>
                          <span className="mono-cell">{formatDocumentRef(t.transfer_ref)}</span>
                          {lineCount > 1 ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {t.product_name || 'Multiple products'}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {t.source_branch || '—'} → {t.destination_branch || '—'}
                        </td>
                        <td>{lineCount}</td>
                        <td>{t.total_quantity ?? t.quantity ?? 0}</td>
                        <td style={{ fontSize: '0.82rem' }}>{formatDisplayDate(t.submitted_date)}</td>
                        <td>{t.submitted_by_name || '—'}</td>
                        <td><StatusBadge status={t.status} /></td>
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="table-actions">
                            <button
                              className="icon-action-button"
                              type="button"
                              title="View"
                              onClick={() => openDetail(t.transfer_id)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </div>
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
            title={emptyCopy.title}
            description={emptyCopy.description}
            actionLabel={emptyCopy.actionLabel}
            onAction={emptyCopy.actionLabel ? () => navigate('/warehouse/transfers/new') : undefined}
          />
        )}
      </section>
    </div>
  );
}

function TransferDetailPage({
  transferId,
  navigate,
  showToast,
}) {
  const currentUser = getCurrentUser();
  const fromTab = new URLSearchParams(window.location.search).get('from');
  const backPath = fromTab === 'history'
    ? '/warehouse/transfers?tab=history'
    : '/warehouse/transfers?tab=requests';
  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const reload = async () => {
    setLoading(true);
    const result = await fetchInventoryTransferById(transferId);
    if (result.success) setTransfer(result.data);
    else setTransfer(null);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [transferId]);

  if (loading) return <LoadingState message="Loading transfer…" />;
  if (!transfer) {
    return <EmptyState title="Transfer not found" actionLabel="Back" onAction={() => navigate(backPath)} />;
  }

  const workflowSteps = ['Submitted', 'Manager approval', 'Approved', 'Shipped', 'Received'];
  const activeStep = transferWorkflowStepIndex(transfer.status);
  const isSourceBranch = currentUser?.branch?.id != null
    && Number(transfer.source_branch_id) === Number(currentUser.branch.id);
  const isDestinationBranch = currentUser?.branch?.id != null
    && Number(transfer.destination_branch_id) === Number(currentUser.branch.id);
  const lines = transfer.lines || [];
  const lineCount = Number(transfer.line_count ?? lines.length) || 0;
  const totalQty = Number(
    lines.length
      ? (transfer.total_quantity ?? transfer.quantity ?? 0)
      : (transfer.total_quantity || transfer.quantity || transfer.header_quantity || 0)
  );
  const isRejected = transfer.status === 'Rejected';
  const isPending = isTransferPendingApproval(transfer.status);
  const canShip = transfer.status === 'Approved' && isSourceBranch && lines.length > 0;
  const canReceive = transfer.status === 'Shipped' && isDestinationBranch && lines.length > 0;

  const confirmShip = async () => {
    if (!lines.length) {
      showToast('This transfer has no product lines to ship. Contact support to repair the document.', 'error');
      return;
    }
    if (completing) return;
    const preview = lines.slice(0, 4).map((line) => `${line.product_name} · ${line.quantity}`).join(', ');
    const extra = lines.length > 4 ? ` and ${lines.length - 4} more` : '';
    const confirmed = await confirmAction({
      title: 'Ship transfer',
      message: `This deducts stock at ${transfer.source_branch} only. ${transfer.destination_branch} receives the stock separately.`,
      detail: `${formatDocumentRef(transfer.transfer_ref)} · ${lineCount} product${lineCount === 1 ? '' : 's'} · ${totalQty} units${preview ? ` · ${preview}${extra}` : ''}`,
      confirmLabel: 'Ship transfer',
      warning: 'Source stock changes as soon as you confirm.',
    });
    if (!confirmed) return;
    setCompleting(true);
    const result = await patchInventoryTransfer(transferId, { status: 'Shipped' });
    setCompleting(false);
    if (result.success) {
      showToast(result.message || 'Transfer shipped.', 'success');
      reload();
    } else {
      showToast(result.message || 'Ship failed.', 'error');
    }
  };

  const confirmReceive = async () => {
    if (!lines.length) {
      showToast('This transfer has no product lines to receive.', 'error');
      return;
    }
    const ok = window.confirm(
      `Confirm receipt for ${transfer.transfer_ref}?\n\n`
      + `This adds stock at ${transfer.destination_branch} for ${lineCount} product(s), ${totalQty} units.`
    );
    if (!ok) return;
    setCompleting(true);
    const result = await patchInventoryTransfer(transferId, { status: 'Received' });
    setCompleting(false);
    if (result.success) {
      showToast(result.message || 'Transfer received.', 'success');
      reload();
    } else {
      showToast(result.message || 'Receive failed.', 'error');
    }
  };

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center mb-3">
          <div>
            <h3 style={{ margin: 0 }}>
              <span className="mono-cell">{formatDocumentRef(transfer.transfer_ref)}</span>
            </h3>
            <p style={{ margin: '6px 0 0' }}>
              {transfer.source_branch} → {transfer.destination_branch}
              {' · '}{lineCount} product{(lineCount === 1) ? '' : 's'}
              {' · '}{totalQty} units
            </p>
          </div>
          <StatusBadge status={transfer.status} />
        </div>

        {isRejected ? (
          <div className="panel content-panel" style={{ marginBottom: 12, borderColor: '#dc2626' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#dc2626' }}>Rejected</p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {transfer.approval_info || 'No rejection reason was provided.'}
            </p>
          </div>
        ) : (
          <div className="approval-workflow">
            <h4 className="subsection-title">Workflow</h4>
            <div className="workflow-steps">
              {workflowSteps.map((step, index) => (
                <span
                  key={step}
                  className={`workflow-step${index <= activeStep && activeStep >= 0 ? ' active' : ''}`}
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}

        <DetailRowsTable rows={[
          { label: 'Submitted by', value: transfer.submitted_by_name || '—' },
          { label: 'Submitted', value: formatDisplayDate(transfer.submitted_date) },
          ...(transfer.notes ? [{ label: 'Notes', value: transfer.notes }] : []),
          ...(transfer.approved_by_name ? [{ label: 'Approved by', value: transfer.approved_by_name }] : []),
          ...(transfer.shipped_at ? [{ label: 'Shipped', value: formatDisplayDateTime(transfer.shipped_at) }] : []),
          ...(transfer.completed_date || transfer.received_at
            ? [{ label: 'Received', value: formatDisplayDate(transfer.completed_date || transfer.received_at) }]
            : []),
          ...(transfer.approval_info && !isRejected ? [{ label: 'Approval note', value: transfer.approval_info }] : []),
        ]} />
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3 style={{ margin: 0 }}>Transfer lines</h3>
        </div>
        {lines.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.line_id || line.product_id}>
                    <td><span className="mono-cell">{line.sku || '—'}</span></td>
                    <td><strong>{line.product_name}</strong></td>
                    <td>{line.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No lines" description="This transfer has no product lines." />
        )}
      </section>

      {isPending ? (
        <section className="panel content-panel">
          <p className="muted" style={{ margin: 0 }}>
            Waiting for <strong>Branch Head</strong> or <strong>Operating Manager</strong> approval in Approval Center.
            Warehouse staff cannot approve transfers.
          </p>
        </section>
      ) : null}

      {transfer.status === 'Approved' && isSourceBranch && lines.length > 0 ? (
        <section className="panel content-panel">
          <p className="muted" style={{ margin: 0 }}>
            Approved. Confirm shipment to deduct stock at {transfer.source_branch}. Destination receives separately.
          </p>
        </section>
      ) : null}

      {transfer.status === 'Approved' && isSourceBranch && lines.length === 0 ? (
        <section className="panel content-panel">
          <p className="muted" style={{ margin: 0 }}>
            This approved transfer has no product lines, so shipment cannot be completed.
            Open the document again after repair, or create a new multi-line transfer.
          </p>
        </section>
      ) : null}

      {transfer.status === 'Approved' && isDestinationBranch && !isSourceBranch ? (
        <section className="panel content-panel">
          <p className="muted" style={{ margin: 0 }}>
            Waiting for <strong>{transfer.source_branch}</strong> to ship. You cannot receive until it is Shipped.
          </p>
        </section>
      ) : null}

      {transfer.status === 'Shipped' && isDestinationBranch ? (
        <section className="panel content-panel">
          <p className="muted" style={{ margin: 0 }}>
            Shipped from {transfer.source_branch}. Confirm receipt to add stock at {transfer.destination_branch}.
          </p>
        </section>
      ) : null}

      {transfer.status === 'Shipped' && isSourceBranch && !isDestinationBranch ? (
        <section className="panel content-panel">
          <p className="muted" style={{ margin: 0 }}>
            Shipped. Waiting for <strong>{transfer.destination_branch}</strong> warehouse to confirm receipt.
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(backPath)}>
          Back to Transfers
        </button>
        {transferIsFinalized(transfer.status) ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/warehouse/movements?search=${encodeURIComponent(transfer.transfer_ref || '')}`)}
          >
            View related stock movements
          </button>
        ) : null}
        {canShip ? (
          <button className="button" type="button" disabled={completing} onClick={confirmShip}>
            {completing ? 'Shipping…' : 'Confirm shipment'}
          </button>
        ) : null}
        {canReceive ? (
          <button className="button" type="button" disabled={completing} onClick={confirmReceive}>
            {completing ? 'Receiving…' : 'Confirm receipt'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
function defaultRestockDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

function RestockHistoryPage({ navigate }) {
  const user = getCurrentUser();
  const branchName = user?.branch?.name || 'your branch';
  const urlProductId = new URLSearchParams(window.location.search).get('product') || '';
  const [defaults] = useState(() => defaultRestockDateRange());
  const [supplier, setSupplier] = useState('All');
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState(urlProductId);
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (search) params.search = search;
      if (productFilter) params.product_id = productFilter;
      const result = await fetchRestocks(params);
      if (!cancelled) {
        setRestocks(result.success ? (result.data || []) : []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, search, productFilter, reloadTick]);

  useEffect(() => {
    const onFocus = () => setReloadTick((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const suppliers = useMemo(
    () => ['All', ...new Set(restocks.map((r) => r.supplier_name).filter(Boolean)).values()],
    [restocks]
  );

  const filtered = useMemo(() => {
    if (supplier === 'All') return restocks;
    return restocks.filter((r) => r.supplier_name === supplier);
  }, [restocks, supplier]);

  const filtersAtDefault = supplier === 'All'
    && dateFrom === defaults.dateFrom
    && dateTo === defaults.dateTo
    && !search
    && !productFilter;

  const clearFilters = () => {
    setSupplier('All');
    setDateFrom(defaults.dateFrom);
    setDateTo(defaults.dateTo);
    setSearchInput('');
    setSearch('');
    setProductFilter('');
  };

  const pagination = usePagination(filtered, {
    pageSize: PAGE_SIZE,
    resetKey: `${supplier}|${dateFrom}|${dateTo}|${search}|${productFilter}`,
  });

  if (loading && !restocks.length) return <LoadingState message="Loading restocks…" />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Restock</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Deliveries recorded for your branch · {branchName}
            </p>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
              Record a goods receipt to increase stock immediately. No manager approval required.
            </p>
          </div>
          <button className="button whitespace-nowrap" type="button" onClick={() => navigate('/warehouse/restock-history/new')}>
            + New Restock
          </button>
        </div>

        <div className="list-section-controls" style={{ marginBottom: 12 }}>
          <input
            className="filter-input search"
            type="search"
            placeholder="Search delivery ref or restock ref"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search restocks"
          />
          <select className="filter-select" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Filter by supplier">
            {suppliers.map((s) => <option key={s} value={s}>{s === 'All' ? 'All suppliers' : s}</option>)}
          </select>
          <input className="filter-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
          <input className="filter-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          <button className="button ghost" type="button" onClick={clearFilters}>Clear filters</button>
        </div>

        {productFilter ? (
          <p className="text-ink/70" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Showing receipts that include one product.{' '}
            <button className="button ghost" type="button" style={{ padding: 0 }} onClick={() => setProductFilter('')}>
              Clear product filter
            </button>
          </p>
        ) : null}

        {loading ? (
          <LoadingState message="Refreshing restocks…" />
        ) : filtered.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Delivery ref</th>
                    <th>Supplier</th>
                    <th>Products</th>
                    <th>Total qty</th>
                    <th>Date received</th>
                    <th>Status</th>
                    <th>Recorded by</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((r) => {
                    const lineCount = Number(r.line_count) || 0;
                    return (
                      <tr
                        key={r.restock_id}
                        className="clickable-row"
                        onClick={() => navigate(`/warehouse/restock-history/${r.restock_id}`)}
                      >
                        <td>
                          <span className="mono-cell">{formatDocumentRef(r.delivery_ref || r.restock_ref)}</span>
                          {r.restock_ref ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {formatDocumentRef(r.restock_ref)}
                              {lineCount > 1 ? ` · ${lineCount} products` : ''}
                            </span>
                          ) : null}
                        </td>
                        <td>{r.supplier_name || '—'}</td>
                        <td>
                          {lineCount || '—'}
                          {lineCount > 1 && r.product_name ? (
                            <span className="text-ink/70" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {r.product_name}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ color: '#2A9B6A', fontWeight: 600 }}>+{r.total_quantity ?? r.quantity ?? 0}</td>
                        <td>{formatDisplayDate(r.received_date)}</td>
                        <td><StatusBadge status={r.status || 'Posted'} /></td>
                        <td>{r.recorded_by_name || '—'}</td>
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="table-actions">
                            <button
                              className="icon-action-button"
                              type="button"
                              title="View"
                              onClick={() => navigate(`/warehouse/restock-history/${r.restock_id}`)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </div>
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
            title={filtersAtDefault ? 'No receipts yet' : 'No receipts match these filters'}
            description={
              filtersAtDefault
                ? 'Record a delivery to increase branch stock.'
                : 'Try a wider date range or clear filters.'
            }
            actionLabel={filtersAtDefault ? 'New Restock' : 'Clear filters'}
            onAction={filtersAtDefault ? () => navigate('/warehouse/restock-history/new') : clearFilters}
          />
        )}
      </section>
    </div>
  );
}

function RestockNewPage({ navigate, showToast }) {
  const params = new URLSearchParams(window.location.search);
  const supplierId = params.get('supplier') || '';
  return (
    <RestockDocumentForm
      navigate={navigate}
      showToast={showToast}
      initialProductId={params.get('product') || ''}
      initialSupplierId={supplierId}
      cancelTo={supplierId ? `/warehouse/suppliers/${supplierId}` : '/warehouse/restock-history'}
    />
  );
}

function RestockDetailPage({ restockId, navigate, showToast }) {
  const [restock, setRestock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const reload = async () => {
    setLoading(true);
    const res = await fetchRestockById(restockId);
    if (res.success) setRestock(res.data);
    else setRestock(null);
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, [restockId]);
  if (loading) return <LoadingState message="Loading restock…" />;
  if (!restock) {
    return (
      <EmptyState
        title="Restock not found"
        actionLabel="Back to Restock"
        onAction={() => navigate('/warehouse/restock-history')}
      />
    );
  }
  const lines = restock.lines || [];
  const lineCount = restock.line_count ?? lines.length;
  const totalQty = restock.total_quantity ?? restock.quantity ?? 0;
  const movementSearch = restock.restock_ref || restock.delivery_ref || '';
  const canSubmitDraft = restock.status === 'Draft';
  const isPosted = restock.status === 'Posted';

  const handleSubmitDraft = async () => {
    setSubmitting(true);
    const result = await submitRestock(restockId);
    setSubmitting(false);
    if (result.success) {
      showToast?.(result.message || 'Restock submitted for approval.', 'success');
      reload();
    } else {
      showToast?.(result.message || 'Submit failed.', 'error');
    }
  };

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center mb-3">
          <div>
            <h3 style={{ margin: 0 }}>
              <span className="mono-cell">{formatDocumentRef(restock.delivery_ref || restock.restock_ref)}</span>
            </h3>
            <p style={{ margin: '6px 0 0' }}>
              {restock.supplier_name || '—'}
              {' · '}{lineCount} product{lineCount === 1 ? '' : 's'}
              {' · '}<span style={{ color: '#2A9B6A', fontWeight: 600 }}>+{totalQty}</span> units
            </p>
            {restock.restock_ref ? (
              <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                Document {formatDocumentRef(restock.restock_ref)}
              </p>
            ) : null}
          </div>
          <StatusBadge status={restock.status || 'Posted'} />
        </div>
        {restock.status === 'Pending Approval' ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            Waiting for Branch Manager approval. On-hand stock is unchanged until posted.
          </p>
        ) : null}
        {restock.status === 'Rejected' && restock.decision_remarks ? (
          <p className="muted" style={{ marginBottom: 12, color: '#dc2626' }}>
            Rejected: {restock.decision_remarks}
          </p>
        ) : null}
        <DetailRowsTable rows={[
          { label: 'Branch', value: restock.branch_name || '—' },
          { label: 'Date received', value: formatDisplayDate(restock.received_date) },
          { label: 'Recorded by', value: restock.recorded_by_name || '—' },
          ...(restock.submitted_by_name ? [{ label: 'Submitted by', value: restock.submitted_by_name }] : []),
          ...(restock.approved_by_name ? [{ label: 'Approved by', value: restock.approved_by_name }] : []),
          ...(restock.notes ? [{ label: 'Notes', value: restock.notes }] : []),
        ]} />
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3 style={{ margin: 0 }}>Lines</h3>
        </div>
        {lines.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th className="cell-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.line_id || line.product_id}>
                    <td><span className="mono-cell">{line.sku || '—'}</span></td>
                    <td><strong>{line.product_name}</strong></td>
                    <td style={{ color: '#2A9B6A', fontWeight: 600 }}>+{line.quantity}</td>
                    <td className="cell-actions">
                      <div className="table-actions">
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View product"
                          onClick={() => navigate(`/warehouse/product/${line.product_id}`)}
                        >
                          <NavIcon name="view" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No lines" description="This restock has no product lines." />
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/restock-history')}>
          Back to Restock
        </button>
        {isPosted && movementSearch ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/warehouse/movements?search=${encodeURIComponent(movementSearch)}`)}
          >
            Related stock movements
          </button>
        ) : null}
        {canSubmitDraft ? (
          <button className="button" type="button" disabled={submitting} onClick={handleSubmitDraft}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
function NotificationsPage({
  navigate,
  showToast
}) {
  return (
    <NotificationsInbox
      navigate={navigate}
      showToast={showToast}
      resolveRelatedPath={(item) => {
        const category = String(item.category || '').toLowerCase();
        if (category.includes('inventory') || category.includes('stock')) {
          return '/warehouse/branch-stock';
        }
        if (category.includes('restock')) {
          return '/warehouse/restock-history';
        }
        if (category.includes('stock count') || category.includes('stock-count')) {
          return '/warehouse/stock-counts';
        }
        if (category.includes('transfer')) {
          return '/warehouse/transfers';
        }
        return null;
      }}
    />
  );
}
function ProfilePage({
  navigate,
  showToast
}) {
  return <AccountProfilePanel
    showToast={showToast}
    title="Warehouse profile"
    settingsRole="warehouse"
    extraActions={<>
      <button className="button ghost" type="button" onClick={() => navigate('/warehouse/audit-log')}>Audit log</button>
      <button className="button ghost" type="button" onClick={() => navigate('/warehouse/reports')}>Reports</button>
    </>}
  />;
}
function AuditLogPage({
  navigate
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchWarehouseAuditLogs();
      if (res.success) setLogs(res.data || []);
      setLoading(false);
    }
    load();
  }, []);
  const pagination_logs = usePagination(logs);
  const paginated_logs = pagination_logs.paginatedData;
  if (loading) return <LoadingState message="Loading audit log..." />;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Audit Log</h3><p className="text-ink/70">Your warehouse actions on this account.</p></div>
        {logs.length ? <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>{paginated_logs.map(log => <tr key={log.log_id}><td>{log.action}</td><td>{log.detail}</td><td>{formatDisplayDateTime(log.timestamp)}</td></tr>)}</tbody>
          </table>
        </div><Pagination {...pagination_logs} /></> : <EmptyState title="No audit entries" description="Actions you take will appear here." />}
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/profile')}>Back to Profile</button>
      </div>
    </div>;
}
function ReportsPage({
  navigate,
  showToast
}) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const loadInventoryReport = async () => {
    setLoading(true);
    const branchId = getCurrentUser()?.branch?.id;
    const res = await getReportInventory(branchId);
    setLoading(false);
    if (res.success) {
      setReportData(res.data);
      showToast('Inventory report loaded.', 'success');
    } else showToast(res.message || 'Failed to load report.', 'error');
  };
  const exportReport = () => {
    if (!reportData?.lowStockItems?.length) {
      showToast('Load the inventory report first.', 'error');
      return;
    }
    const rows = reportData.lowStockItems.map((r) => ({
      product: r.product_name,
      branch: r.branch_name,
      available: r.available_stock,
      reorder: r.reorder_level,
      status: r.status,
    }));
    if (downloadPdf(rows, { filename: 'warehouse-low-stock.pdf', title: 'Low Stock Report' })) showToast('Report exported as PDF.', 'success');
  };
  const reports = [
    { label: 'Inventory Report', action: loadInventoryReport },
    { label: 'Export Low Stock PDF', action: exportReport },
  ];
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Generate Reports</h3></div>
        <div className="quick-link-grid">
          {reports.map(report => <button key={report.label} className="quick-link-card report-card" type="button" disabled={loading} onClick={report.action}>
              <span className="quick-link-icon"><NavIcon name="reports" /></span>
              <span className="quick-link-copy"><strong>{report.label}</strong><span className="text-ink/70">Branch-scoped data</span></span>
            </button>)}
        </div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/profile')}>Back to Profile</button>
      </div>
    </div>;
}
function SettingsPage({
  showToast
}) {
  return <UserSettingsPanel role="warehouse" showToast={showToast} />;
}
function truncateText(value, max = 48) {
  const text = String(value || '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function suppliersListPath({ status = 'Active', search = '' } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'Active') params.set('status', status);
  if (search) params.set('search', search);
  const q = params.toString();
  return q ? `/warehouse/suppliers?${q}` : '/warehouse/suppliers';
}

function SuppliersPage({
  navigate,
  showToast
}) {
  const urlParams = new URLSearchParams(window.location.search);
  const [searchInput, setSearchInput] = useState(urlParams.get('search') || '');
  const [search, setSearch] = useState(urlParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(urlParams.get('status') || 'Active');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [total, setTotal] = useState(0);
  const limit = PAGE_SIZE;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const nextPath = suppliersListPath({ status: statusFilter, search });
    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history.replaceState(null, '', nextPath);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    let cancelled = false;
    async function loadSuppliers() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        if (statusFilter !== 'All') params.append('status', statusFilter);
        if (search) params.append('search', search);
        const res = await apiClient.get(`/suppliers?${params.toString()}`);
        if (cancelled) return;
        if (res.data.success) {
          setSuppliers(res.data.data || []);
          setTotal(res.data.pagination?.total || 0);
        } else {
          setSuppliers([]);
          setTotal(0);
          setError(res.data.message || 'Failed to load suppliers.');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Suppliers] load error:', err.message);
        setSuppliers([]);
        setTotal(0);
        setError('Failed to load suppliers.');
        showToast?.('Failed to load suppliers.', 'error');
      }
      if (!cancelled) setLoading(false);
    }
    loadSuppliers();
    return () => { cancelled = true; };
  }, [page, statusFilter, search, showToast, limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const filtersActive = statusFilter !== 'Active' || Boolean(search);
  const openDetail = (id) => {
    navigate(`/warehouse/suppliers/${id}?fromStatus=${encodeURIComponent(statusFilter)}&fromSearch=${encodeURIComponent(search)}`);
  };

  if (loading && !suppliers.length && !error) return <LoadingState message="Loading suppliers…" />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Suppliers</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              Vendors used when recording restocks for your branch.
            </p>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search supplier name, contact, or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search suppliers"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              {['All', 'Active', 'Inactive'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <EmptyState title="Could not load suppliers" description={error} />
        ) : loading ? (
          <LoadingState message="Refreshing suppliers…" />
        ) : suppliers.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr
                      key={supplier.suppliers_id}
                      className="clickable-row"
                      onClick={() => openDetail(supplier.suppliers_id)}
                    >
                      <td><strong>{supplier.supplier_name}</strong></td>
                      <td>{formatPhone(supplier.contact_number || supplier.contact) || '—'}</td>
                      <td>{supplier.email || '—'}</td>
                      <td title={supplier.address || ''}>{truncateText(supplier.address)}</td>
                      <td><StatusBadge status={supplier.status} /></td>
                      <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions">
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View"
                            onClick={() => openDetail(supplier.suppliers_id)}
                          >
                            <NavIcon name="view" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalRecords={total}
              pageSize={limit}
              startRecord={total ? (page - 1) * limit + 1 : 0}
              endRecord={Math.min(page * limit, total)}
              prevPage={() => setPage((p) => Math.max(1, p - 1))}
              nextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
              goToPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title={filtersActive ? 'No suppliers match these filters' : 'No suppliers yet — contact Operating Manager.'}
            description={filtersActive ? 'Try All statuses or clear your search.' : 'Warehouse staff select approved vendors when recording restocks.'}
            actionLabel={filtersActive ? 'Show Active' : undefined}
            onAction={filtersActive ? () => { setStatusFilter('Active'); setSearchInput(''); setSearch(''); setPage(1); } : undefined}
          />
        )}
      </section>
    </div>
  );
}

function SupplierDetailPage({
  supplierId,
  navigate,
  showToast
}) {
  const backParams = new URLSearchParams(window.location.search);
  const backTo = suppliersListPath({
    status: backParams.get('fromStatus') || 'Active',
    search: backParams.get('fromSearch') || '',
  });
  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiClient.get(`/suppliers/${supplierId}`);
        if (res.data.success) setSupplier(res.data.data);
        else {
          setSupplier(null);
          showToast?.('Supplier not found.', 'error');
        }
      } catch (err) {
        console.error('[Suppliers] detail load error:', err.message);
        setSupplier(null);
        showToast?.('Failed to load supplier.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [supplierId, showToast]);

  if (loading) return <LoadingState message="Loading supplier…" />;
  if (!supplier) {
    return <EmptyState title="Supplier not found" actionLabel="Back to Suppliers" onAction={() => navigate(backTo)} />;
  }

  const isActive = String(supplier.status || '').toLowerCase() === 'active';
  const recentRestocks = supplier.recent_restocks || [];

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center mb-3">
          <div>
            <h3 style={{ margin: 0 }}>{supplier.supplier_name}</h3>
            <p className="text-ink/70" style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
              Company supplier directory · read-only for warehouse
            </p>
          </div>
          <StatusBadge status={supplier.status} />
        </div>
        <DetailRowsTable rows={[
          { label: 'Contact Number', value: formatPhone(supplier.contact_number || supplier.contact) || '—' },
          { label: 'Email', value: supplier.email || '—' },
          { label: 'Address', value: supplier.address || '—' },
          { label: 'Last Updated', value: formatDisplayDateTime(supplier.updated_at) },
        ]} />
      </section>
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3 style={{ margin: 0 }}>Recent Restocks</h3>
          <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
            Deliveries from this supplier at your branch
          </p>
        </div>
        {recentRestocks.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Products</th>
                  <th>Qty</th>
                  <th>Recorded by</th>
                  <th className="cell-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentRestocks.map((r) => (
                  <tr
                    key={r.restock_id}
                    className="clickable-row"
                    onClick={() => navigate(`/warehouse/restock-history/${r.restock_id}`)}
                  >
                    <td>{formatDisplayDate(r.received_date)}</td>
                    <td><span className="mono-cell">{formatDocumentRef(r.delivery_ref || r.restock_ref)}</span></td>
                    <td>{r.line_count ?? '—'}</td>
                    <td style={{ color: '#2A9B6A', fontWeight: 600 }}>+{r.total_quantity ?? 0}</td>
                    <td>{r.recorded_by_name || '—'}</td>
                    <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="icon-action-button"
                        type="button"
                        title="View restock"
                        onClick={() => navigate(`/warehouse/restock-history/${r.restock_id}`)}
                      >
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No restocks recorded for this supplier at your branch yet."
            description={isActive ? 'You can record a delivery using this supplier.' : 'This supplier is inactive and cannot be used on new restocks.'}
          />
        )}
      </section>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(backTo)}>Back to Suppliers</button>
        {isActive ? (
          <button
            className="button"
            type="button"
            onClick={() => navigate(`/warehouse/restock-history/new?supplier=${supplier.suppliers_id}`)}
          >
            New Restock
          </button>
        ) : (
          <span className="text-ink/70" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>
            Inactive suppliers cannot be selected for new restocks.
          </span>
        )}
      </div>
    </div>
  );
}

function ProductCategoriesPage({
  navigate,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const { fetchProductCategories } = await import('../../api/productCategoriesService');
        const params = {};
        if (search) params.search = search;
        if (statusFilter !== 'All') params.status = statusFilter;
        const result = await fetchProductCategories(params);
        if (cancelled) return;
        if (result.success) setCategories(result.data || []);
        else {
          setCategories([]);
          setError(result.message || 'Failed to load product categories.');
        }
      } catch {
        if (cancelled) return;
        setCategories([]);
        setError('Failed to load product categories.');
        showToast?.('Failed to load product categories.', 'error');
      }
      if (!cancelled) setLoading(false);
    }
    loadData();
    return () => { cancelled = true; };
  }, [search, statusFilter, showToast]);

  const pagination_categories = usePagination(categories, {
    resetKey: `${search}|${statusFilter}`,
  });
  const filtersActive = statusFilter !== 'Active' || Boolean(search);
  const openProducts = (categoryId) => navigate(`/warehouse/products?category=${categoryId}`);

  if (loading && !categories.length && !error) return <LoadingState message="Loading categories…" />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>Product Categories</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
              How products are grouped in the catalog (managed by Operating Manager).
            </p>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search category name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search categories"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
        {error ? (
          <EmptyState title="Could not load categories" description={error} />
        ) : loading ? (
          <LoadingState message="Refreshing categories…" />
        ) : categories.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Category name</th>
                    <th>Status</th>
                    <th># Products</th>
                    <th className="cell-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination_categories.paginatedData.map((c) => (
                    <tr
                      key={c.category_id}
                      className="clickable-row"
                      onClick={() => openProducts(c.category_id)}
                    >
                      <td><strong>{c.category_name}</strong></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>{Number(c.product_count) || 0}</td>
                      <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View products"
                          onClick={() => openProducts(c.category_id)}
                        >
                          <NavIcon name="view" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_categories} />
          </>
        ) : (
          <EmptyState
            title={filtersActive ? 'No categories match these filters' : 'No categories yet — OM must create categories before products can be filed'}
            description={filtersActive ? 'Try All statuses or clear your search.' : 'Warehouse staff use categories to find products. Catalog taxonomy is managed by Operating Manager.'}
            actionLabel={filtersActive ? 'Show Active' : 'Back to Products'}
            onAction={filtersActive
              ? () => { setStatusFilter('Active'); setSearchInput(''); setSearch(''); }
              : () => navigate('/warehouse/products')}
          />
        )}
      </section>
    </div>
  );
}
export function WarehousePageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = {
    productId: page.params?.productId,
    movementId: page.params?.movementId,
    transferId: page.params?.transferId,
    restockId: page.params?.restockId,
    countId: page.params?.countId,
    creditId: page.params?.creditId,
    supplierId: page.params?.supplierId,
    navigate,
    showToast
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...props} />;
    case 'settings':
      return <SettingsPage {...props} />;
    case 'centralInventory':
      return (
        <BranchInventoryViewPage
          mode="warehouse"
          navigate={navigate}
          showToast={showToast}
          branchName={getCurrentUser()?.branch?.name}
          initialStockFilter={page.params?.stockFilter || 'All'}
        />
      );
    case 'products':
      return <InventoryPage {...props} />;
    case 'addProduct':
      return (
        <EmptyState
          title="Product creation is managed by Operating Manager"
          description="There is no product-request approval workflow yet. Warehouse staff stock existing catalog SKUs via Restock and Stock Count."
          actionLabel="Back to Products"
          onAction={() => navigate('/warehouse/products')}
        />
      );
    case 'editProduct':
      return (
        <EmptyState
          title="Catalog editing is managed by Operating Manager"
          description="Warehouse staff can view products and manage stock, but cannot edit master product data."
          actionLabel="Back to product"
          onAction={() => navigate(`/warehouse/product/${props.productId}`)}
        />
      );
    case 'productDetail':
      return <ProductDetailPage {...props} />;
    case 'stockCount':
      return <StockCountPage {...props} />;
    case 'stockCountHistory':
      return <StockCountHistoryPage {...props} />;
    case 'stockCountNew':
      return <StockCountNewPage {...props} />;
    case 'stockCountDetail':
      return <StockCountDetailPage {...props} />;
    case 'restock':
      return (
        <RestockDocumentForm
          navigate={navigate}
          showToast={showToast}
          initialProductId={props.productId}
          cancelTo={`/warehouse/product/${props.productId}`}
        />
      );
    case 'transfer':
      return (
        <TransferDocumentForm
          navigate={navigate}
          showToast={showToast}
          initialProductId={props.productId}
          cancelTo={`/warehouse/product/${props.productId}`}
        />
      );
    case 'movements':
      return <MovementsPage {...props} />;
    case 'movementDetail':
      return <MovementDetailPage {...props} />;
    case 'transferRequestNew':
      return <TransferRequestNewPage {...props} />;
    case 'transfers':
      return (
        <TransfersPage
          {...props}
          transferTab={page.params?.transferTab}
          transferSegment={page.params?.transferSegment}
        />
      );
    case 'transferDetail':
      return <TransferDetailPage {...props} />;
    case 'restockHistory':
      return <RestockHistoryPage {...props} />;
    case 'restockNew':
      return <RestockNewPage {...props} />;
    case 'restockDetail':
      return <RestockDetailPage {...props} />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'profile':
      return <ProfilePage {...props} />;
    case 'auditLog':
      return <AuditLogPage {...props} />;
    case 'reports':
      return <ReportsPage {...props} />;
    case 'suppliers':
      return <SuppliersPage {...props} />;
    case 'supplierDetail':
      return <SupplierDetailPage {...props} />;
    case 'productCategories':
      return <ProductCategoriesPage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
