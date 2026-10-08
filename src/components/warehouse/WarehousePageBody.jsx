import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createInventoryTransfer,
  createRestock,
  createWarehouseProduct,
  fetchBranchInventory,
  fetchInventoryBranches,
  fetchInventoryTransferById,
  fetchInventoryTransfers,
  fetchRestockById,
  fetchRestocks,
  fetchStockMovementById,
  fetchStockMovements,
  fetchWarehouseAuditLogs,
  fetchWarehouseDashboard,
  patchInventoryTransfer,
  submitStockCount,
} from '../../api/inventoryService';
import { fetchNotifications } from '../../api/notificationService.js';
import { fetchMyProfile, updateMyProfile } from '../../api/profileService.js';
import { getCurrentUser, persistCurrentUserFromProfile, requestLogout } from '../../api/authService.js';

function transferWorkflowStepIndex(status) {
  if (status === 'Rejected') return -1;
  if (status === 'Pending Approval' || status === 'Submitted') return 0;
  if (status === 'Approved') return 2;
  if (status === 'Completed') return 3;
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
import { NavIcon } from '../../navIcons';
import { StatusBadge } from '../StatusBadge';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
function StockStatusBadge({
  status
}) {
  const cls = {
    Sufficient: 'stock-sufficient',
    'Low Stock': 'stock-low',
    'Critical Stock': 'stock-critical',
    'Out of Stock': 'stock-critical'
  }[status] ?? '';
  return <span className={`stock-status ${cls}`}>{status}</span>;
}
const PAGE_SIZE = 10;
function DashboardPage({
  navigate,
  showToast
}) {
  const user = getCurrentUser();
  const [dashboard, setDashboard] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [dashRes, notifRes] = await Promise.all([fetchWarehouseDashboard(), fetchNotifications()]);
      if (dashRes.success) setDashboard(dashRes.data);
      else if (showToast) showToast(dashRes.message || 'Failed to load dashboard.', 'error');
      if (notifRes.success) {
        setUnreadCount((notifRes.data || []).filter(n => n.status !== 'Read').length);
      }
      setLoading(false);
    }
    load();
  }, [showToast]);

  const summary = dashboard?.summary || {};
  const health = dashboard?.inventoryHealth || {};
  const quickId = dashboard?.quickProductId;
  const transfers = dashboard?.recentTransfers || [];
  const restocks = dashboard?.recentRestocks || [];
  const topMoving = dashboard?.topMovingProducts || [];
  const criticalProducts = dashboard?.criticalProducts || [];

  const transfersPager = usePagination(transfers);
  const restocksPager = usePagination(restocks);
  const topMovingPager = usePagination(topMoving);
  const criticalPager = usePagination(criticalProducts);

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <div className="warehouse-dashboard relative z-10 grid gap-5 w-full">
      <section className="panel dashboard-greeting warehouse-dashboard-header">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Warehouse operations</p>
          <h2>{user?.fullName || 'Warehouse Staff'}</h2>
          <p className="muted">{user?.branch?.name || 'Branch warehouse'}</p>
        </div>
        <Link
          to="/warehouse/notifications"
          className="relative p-2 text-ink/70 hover:text-blue hover:bg-blue/5 rounded-md transition-colors cursor-pointer"
          aria-label={`${unreadCount} unread notifications`}
        >
          <NavIcon name="bell" />
          {unreadCount > 0 ? (
            <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex justify-center items-center rounded-full bg-red text-white text-[0.7rem] font-bold border-2 border-mint">
              {unreadCount}
            </span>
          ) : null}
        </Link>
      </section>

      {/* Overview */}
      <section className="dashboard-section" aria-labelledby="wh-overview-heading">
        <div className="dashboard-section-header">
          <h3 id="wh-overview-heading" className="dashboard-section-title">Overview</h3>
          <p className="dashboard-section-sub">Key inventory metrics for your branch</p>
        </div>

        <StatsGrid stats={[
          { label: 'Total Products Tracked', value: String(summary.totalProducts ?? 0) },
          { label: 'Low Stock Alerts', value: String(summary.lowStockAlerts ?? 0) },
          { label: 'Pending Transfers', value: String(summary.pendingTransfers ?? 0) },
          { label: "Today's Stock Movements", value: String(summary.movementsToday ?? 0) },
        ]} />

        <div className="dashboard-actions">
          <button className="button" type="button" onClick={() => navigate('/warehouse/transfers/new')}>
            New Transfer Request
          </button>
          <button className="button secondary" type="button" onClick={() => navigate('/warehouse/transfers')}>
            Transfers
          </button>
          <button className="button secondary" type="button" onClick={() => navigate('/warehouse/branch-inventory')}>
            View Branch Inventory
          </button>
          {quickId ? (
            <>
              <button className="button ghost" type="button" onClick={() => navigate(`/warehouse/product/${quickId}/transfer`)}>
                Transfer Stock
              </button>
              <button className="button ghost" type="button" onClick={() => navigate(`/warehouse/product/${quickId}/restock`)}>
                Record Restock
              </button>
              <button className="button ghost" type="button" onClick={() => navigate(`/warehouse/product/${quickId}/stock-count`)}>
                Log Stock Count
              </button>
            </>
          ) : null}
        </div>

        {criticalProducts.length ? (
          <section className="panel dashboard-panel-compact alert-panel">
            <div className="dashboard-panel-heading">
              <h4>Stock Alerts</h4>
              <span className="muted">{criticalProducts.length} item{criticalProducts.length === 1 ? '' : 's'}</span>
            </div>
            <div className="corvex-table-wrapper dashboard-table-wrap">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Branch</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalPager.paginatedData.map((p) => (
                    <tr
                      key={p.product_id}
                      className="clickable-row"
                      onClick={() => navigate(`/warehouse/product/${p.product_id}`)}
                    >
                      <td>{p.product_name}</td>
                      <td>{p.sku || '—'}</td>
                      <td>{p.branch_name || '—'}</td>
                      <td><StatusBadge status={p.stock_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...criticalPager} />
          </section>
        ) : null}
      </section>

      {/* Recent Activity */}
      <section className="dashboard-section" aria-labelledby="wh-activity-heading">
        <div className="dashboard-section-header">
          <h3 id="wh-activity-heading" className="dashboard-section-title">Recent Activity</h3>
          <p className="dashboard-section-sub">Latest transfers and restocks</p>
        </div>

        <div className="dashboard-widgets grid two-up">
          <section className="panel dashboard-panel-compact">
            <div className="dashboard-panel-heading">
              <h4>Recent Transfers</h4>
            </div>
            {transfers.length ? (
              <>
                <div className="corvex-table-wrapper dashboard-table-wrap">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Transfer ID</th>
                        <th>Product</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfersPager.paginatedData.map((t) => (
                        <tr
                          key={t.transfer_id}
                          className="clickable-row"
                          onClick={() => navigate(`/warehouse/transfers/${t.transfer_id}`)}
                        >
                          <td><span className="mono-cell">{t.transfer_ref}</span></td>
                          <td>{t.product_name}</td>
                          <td><StatusBadge status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...transfersPager} />
              </>
            ) : (
              <p className="dashboard-empty muted">No transfers yet.</p>
            )}
          </section>

          <section className="panel dashboard-panel-compact">
            <div className="dashboard-panel-heading">
              <h4>Recent Restocks</h4>
            </div>
            {restocks.length ? (
              <>
                <div className="corvex-table-wrapper dashboard-table-wrap">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Date</th>
                        <th className="text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restocksPager.paginatedData.map((r) => (
                        <tr key={r.restock_id}>
                          <td>{r.product_name}</td>
                          <td>{formatDisplayDate(r.received_date)}</td>
                          <td className="text-right qty-positive">+{r.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...restocksPager} />
              </>
            ) : (
              <p className="dashboard-empty muted">No restocks yet.</p>
            )}
          </section>
        </div>
      </section>

      {/* Product Activity + Inventory Health */}
      <section className="dashboard-section" aria-labelledby="wh-product-heading">
        <div className="dashboard-section-header">
          <h3 id="wh-product-heading" className="dashboard-section-title">Product Activity</h3>
          <p className="dashboard-section-sub">Movement trends and stock health</p>
        </div>

        <div className="dashboard-widgets grid two-up dashboard-widgets-start">
          <section className="panel dashboard-panel-compact">
            <div className="dashboard-panel-heading">
              <h4>Top Moving Products</h4>
              <span className="muted">Last 30 days</span>
            </div>
            {topMoving.length ? (
              <>
                <div className="corvex-table-wrapper dashboard-table-wrap">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-right">Movements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topMovingPager.paginatedData.map((p) => {
                        const count = Number(p.movements) || 0;
                        return (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td className="text-right" title={`${count} movement${count === 1 ? '' : 's'}`}>
                              {count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination {...topMovingPager} />
              </>
            ) : (
              <p className="dashboard-empty muted">No movement data (30 days).</p>
            )}
          </section>

          <section className="panel dashboard-panel-compact" aria-labelledby="wh-health-heading">
            <div className="dashboard-panel-heading">
              <h4 id="wh-health-heading">Inventory Health</h4>
            </div>
            <div className="inventory-health-grid">
              <article className="inventory-health-item health-sufficient">
                <span className="inventory-health-label">Sufficient</span>
                <strong className="inventory-health-value">{health.sufficient ?? 0}</strong>
              </article>
              <article className="inventory-health-item health-low">
                <span className="inventory-health-label">Low Stock</span>
                <strong className="inventory-health-value">{health.low ?? 0}</strong>
              </article>
              <article className="inventory-health-item health-critical">
                <span className="inventory-health-label">Critical</span>
                <strong className="inventory-health-value">{health.critical ?? 0}</strong>
              </article>
              <article className="inventory-health-item health-out">
                <span className="inventory-health-label">Out of Stock</span>
                <strong className="inventory-health-value">{health.outOfStock ?? 0}</strong>
              </article>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
function InventoryPage({
  navigate,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('All');
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('Product Name');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const params = {};
        if (statusFilter !== 'All') params.product_status = statusFilter;
        const res = await apiClient.get('/products', { params });
        if (res.data.success) {
          setProducts(res.data.data);
          setCategories(res.data.categories || []);
        }
      } catch (err) {
        console.error('[Inventory] load error:', err.message);
        showToast('Failed to load products.', 'error');
      }
      setLoading(false);
    }
    loadProducts();
  }, [statusFilter, showToast]);
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
    if (category !== 'All') results = results.filter(p => p.category_id === Number(category));
    if (sortBy === 'Product Name') results.sort((a, b) => a.product_name.localeCompare(b.product_name));else if (sortBy === 'Unit Price') results.sort((a, b) => a.unit_price - b.unit_price);
    return results;
  }, [products, search, category, statusFilter, sortBy]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (loading) return <LoadingState message="Loading inventory..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Product List</h3>
          <div className="list-section-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const rows = filtered.map(p => ({
                  sku: p.sku,
                  name: p.product_name,
                  category: p.category_name,
                  unit_price: p.unit_price,
                  status: p.status,
                }));
                if (downloadPdf(rows, { filename: 'warehouse-products.pdf', title: 'Warehouse Products' })) showToast('Products exported as PDF.', 'success');
                else showToast('Nothing to export.', 'error');
              }}
            >
              Export PDF
            </button>
            <button className="button" type="button" onClick={() => navigate('/warehouse/add-product')}>Add Product</button>
          </div>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by name, SKU, or category" value={search} onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #c5c8d0',
            fontSize: '0.9rem',
            flex: 1,
            minWidth: '200px'
          }} />
            <select className="filter-select" value={category} onChange={e => {
            setCategory(e.target.value);
            setPage(1);
          }} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #c5c8d0',
            fontSize: '0.9rem'
          }}>
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
            <select className="filter-select" value={statusFilter} onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
          }} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #c5c8d0',
            fontSize: '0.9rem'
          }}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
            <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #c5c8d0',
            fontSize: '0.9rem'
          }}>
              {['Product Name', 'Unit Price'].map(s => <option key={s}>Sort: {s}</option>)}
            </select>
          </div>
        </div>
        {paginated.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr><th>Image</th><th>Product ID</th><th>SKU</th><th>Product Name</th><th>Category</th><th>Unit Price</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paginated.map(product => <tr key={product.product_id}>
                    <td>
                      {product.image_url ? <img src={product.image_url} alt="" width={48} height={48} style={{
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '1px solid #c5c8d0'
                  }} /> : <span className="text-ink/50" style={{
                    fontSize: '0.75rem'
                  }}>—</span>}
                    </td>
                    <td>{product.product_id}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{product.sku || '—'}</span></td>
                    <td>{product.product_name}</td>
                    <td>{product.category_name || product.category_id}</td>
                    <td>{formatCurrency(product.unit_price)}</td>
                    <td><StatusBadge status={product.status} /></td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/warehouse/product/${product.product_id}`)}><NavIcon name="view" /></button>
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => navigate(`/warehouse/product/${product.product_id}/edit`)}><NavIcon name="edit" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
            </div>
            <Pagination currentPage={page} totalPages={Math.max(1, totalPages)} totalRecords={filtered.length} pageSize={PAGE_SIZE} startRecord={filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0} endRecord={Math.min(page * PAGE_SIZE, filtered.length)} prevPage={() => setPage((p) => Math.max(1, p - 1))} nextPage={() => setPage((p) => Math.min(Math.max(1, totalPages), p + 1))} goToPage={setPage} /></>
        : <EmptyState title="No products found" description="Adjust your search or filters." actionLabel="Clear filters" onAction={() => {
      setSearch('');
      setCategory('All');
      setStatusFilter('All');
      setPage(1);
    }} />}
      </section>
    </div>;
}
function ProductDetailPage({
  productId,
  navigate,
  showToast
}) {
  const [productData, setProductData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
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
    }
    load();
  }, [productId]);
  const inventory = productData?.inventory || [];
  const movements = productData?.movements || [];
  const pagination_inventory = usePagination(inventory);
  const paginated_inventory = pagination_inventory.paginatedData;
  const pagination_movements = usePagination(movements);
  const paginated_movements = pagination_movements.paginatedData;
  if (loading) return <LoadingState message="Loading product..." />;
  const product = productData;
  if (!product) {
    return <EmptyState
      title={loadError || 'Product not found'}
      description={loadError && loadError !== 'Product not found.' ? 'Check that the API is running and try again.' : 'This product ID may not exist in the catalog.'}
      actionLabel="Back to Products"
      onAction={() => navigate('/warehouse/products')}
    />;
  }
  const product_id = product.product_id || product.id || '—';
  const product_name = product.product_name || product.name || '—';
  const sku = product.sku || '—';
  const category_id = product.category_id || '—';
  const category_name = product.category_name || product.category || '—';
  const unit_price = product.unit_price != null ? product.unit_price : product.unitPrice || 0;
  const status = product.status || '—';
  const totalStock = inventory.reduce((sum, b) => sum + Number(b.quantity || b.available_stock || 0), 0);
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
      label: 'Product ID',
      value: String(product_id)
    }, {
      label: 'Unit Price',
      value: formatCurrency(unit_price)
    }, {
      label: 'Status',
      value: status
    }, {
      label: 'Total Stock (All Branches)',
      value: `${totalStock} units`
    }]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div className="flex gap-4 items-start">
            {product.image_url ? <img src={product.image_url} alt={product_name} width={96} height={96} style={{
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid #c5c8d0'
          }} /> : null}
            <div>
              <h3 style={{
              margin: 0
            }}>{product_name}</h3>
              <p className="text-ink/70" style={{
              margin: '4px 0 0'
            }}>Product ID: {product_id}</p>
            </div>
          </div>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Product ID</span><span className="info-item-value">{product_id}</span></li>
          <li><span className="info-item-label">SKU</span><span className="info-item-value"><span style={{ fontFamily: 'monospace' }}>{sku}</span></span></li>
          <li><span className="info-item-label">Product Name</span><span className="info-item-value">{product_name}</span></li>
          <li><span className="info-item-label">Category ID</span><span className="info-item-value">{category_id}</span></li>
          <li><span className="info-item-label">Category Name</span><span className="info-item-value">{category_name}</span></li>
          <li><span className="info-item-label">Unit Price</span><span className="info-item-value">{formatCurrency(unit_price)}</span></li>
          <li><span className="info-item-label">Status</span><span className="info-item-value"><StatusBadge status={status} /></span></li>
          {product.description ? <li><span className="info-item-label">Description</span><span className="info-item-value">{product.description}</span></li> : null}
          {product.unit_type ? <li><span className="info-item-label">Unit Type</span><span className="info-item-value">{product.unit_type}</span></li> : null}
          {product.reorder_point != null ? <li><span className="info-item-label">Reorder Point</span><span className="info-item-value">{product.reorder_point}</span></li> : null}
        </ul>
      </section>

      {/* Inventory per branch — from branch_inventory */}
      {inventory.length > 0 && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Stock by Branch</h3>
            <p className="text-ink/70" style={{
          margin: 0,
          fontSize: '0.82rem'
        }}>Source: branch_inventory table</p>
          </div>
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Branch ID</th>
                  <th>Branch</th>
                  <th>Product ID</th>
                  <th>Available Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {paginated_inventory.map(b => <tr key={b.branch_inventory_id ?? b.branch_id}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{b.branch_inventory_id ?? '—'}</span></td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{b.branch_id}</span></td>
                    <td>{b.branch_name}</td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{b.product_id ?? '—'}</span></td>
                    <td style={{
                  fontWeight: 600
                }}>{b.available_stock ?? b.quantity ?? '—'}</td>
                    <td>{b.reorder_level ?? '—'}</td>
                    <td>
                      <StatusBadge status={b.stock_status || '—'} />
                    </td>
                    <td style={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem'
                }}>{formatDisplayDateTime(b.created_at)}</td>
                    <td style={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem'
                }}>{formatDisplayDateTime(b.updated_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_inventory} /></>
        </section>}

      {/* Stock movements — from stock_movements table with movement_ref */}
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Stock Movement History</h3>
          <p className="text-ink/70" style={{
          margin: 0,
          fontSize: '0.82rem'
        }}>Source: stock_movements table — type, quantity, movement_ref, branch, performed_by</p>
        </div>
        {movements.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Reference</th>
                  <th>Branch</th>
                  <th>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {paginated_movements.map((m, i) => <tr key={m.id || m.stock_movements_id || i}>
                    <td>{m.movement_date ? formatDisplayDate(m.movement_date) : m.date ? formatDisplayDate(m.date) : '—'}</td>
                    <td>
                      <StatusBadge status={m.type} />
                    </td>
                    <td style={{
                  fontWeight: 600,
                  color: (m.quantity || 0) > 0 ? '#4A6B12' : '#dc2626'
                }}>
                      {(m.quantity || 0) > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{m.movement_ref || m.reason || '—'}</span></td>
                    <td>{m.branch_name || '—'}</td>
                    <td>{m.performed_by_name || '—'}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_movements} /></> : <EmptyState title="No movement history" description="Stock movements for this product will appear here." />}
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/products')}>Back to Products</button>
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}/edit`)}>Edit Product</button>
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}/transfer`)}>Transfer Stock</button>
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}/restock`)}>Record Restock</button>
        <button className="button" type="button" onClick={() => navigate(`/warehouse/product/${productId}/stock-count`)}>Log Stock Count</button>
      </div>
    </div>;
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
      };
      const res = await apiClient.put(`/products/${productId}`, payload);
      if (!res.data?.success) {
        showToast(res.data?.message || 'Update failed.', 'error');
        return;
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

  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Edit Product</h3></div>
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
  const [form, setForm] = useState({
    productName: '',
    sku: '',
    category: '',
    description: '',
    unitType: 'Unit',
    unitPrice: '',
    reorderPoint: '5',
    supplierId: '',
    initialQuantity: ''
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
      });
      if (!result.success) {
        showToast(result.message || 'Failed to create product.', 'error');
        return;
      }
      showToast('Product record created successfully.', 'success');
      navigate('/warehouse/products');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create product.', 'error');
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Add New Product</h3></div>
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
        }))} /> : <input type={field.type} value={form[field.name]} onChange={e => setForm(p => ({
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
function useWarehouseProductContext(productId) {
  const user = getCurrentUser();
  const [product, setProduct] = useState(null);
  const [branchStock, setBranchStock] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await apiClient.get(`/products/${productId}`);
      if (res.data?.success) {
        setProduct(res.data.data);
        const branchId = user?.branch?.id;
        const inv = res.data.data?.inventory || [];
        setBranchStock(branchId ? inv.find((r) => r.branch_id === branchId) : inv[0]);
      }
      setLoading(false);
    }
    load();
  }, [productId, user?.branch?.id]);
  return { product, branchStock, loading, systemQty: Number(branchStock?.available_stock ?? 0) };
}

function StockCountPage({
  productId,
  navigate,
  showToast
}) {
  const { product, loading, systemQty } = useWarehouseProductContext(productId);
  const [physical, setPhysical] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  if (loading) return <LoadingState message="Loading product..." />;
  if (!product) return <EmptyState title="Product not found" actionLabel="Back" onAction={() => navigate('/warehouse/branch-inventory')} />;
  const variance = physical !== '' ? Number(physical) - systemQty : null;
  const hasVariance = variance !== null && variance !== 0;
  const handleSubmit = async () => {
    const nextErrors = {};
    if (physical === '') nextErrors.physical = 'Physical count is required.';
    if (hasVariance && !notes.trim()) nextErrors.notes = 'Notes required when variance exists.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await submitStockCount({
      product_id: Number(productId),
      physical_count: Number(physical),
      notes: notes.trim(),
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Submit failed.', 'error');
      return;
    }
    showToast(result.message || 'Stock count saved.', 'success');
    navigate(`/warehouse/product/${productId}`);
  };
  const productName = product.product_name || product.name;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Stock Count — {productName}</h3></div>
        <div className="form-group"><label>System Quantity</label><p className="field-preview">{systemQty} units</p></div>
        <div className="form-group">
          <label>Physical Quantity<span className="required">*</span></label>
          <input type="number" min="0" value={physical} onChange={e => setPhysical(e.target.value)} />
          {errors.physical ? <p className="form-error">{errors.physical}</p> : null}
        </div>
        {variance !== null ? <div className={`form-group variance-display${hasVariance ? ' variance-alert' : ''}`}>
            <label>Variance</label>
            <p className="field-preview">{variance > 0 ? `+${variance}` : variance} units</p>
          </div> : null}
        <div className="form-group">
          <label>Discrepancy Notes{hasVariance ? <span className="required">*</span> : null}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Explain variance if any..." />
          {errors.notes ? <p className="form-error">{errors.notes}</p> : null}
        </div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}`)}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Submit Stock Count'}</button>
      </div>
    </div>;
}
function RestockPage({
  productId,
  navigate,
  showToast
}) {
  const { product, loading } = useWarehouseProductContext(productId);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({
    quantity: '',
    supplierId: '',
    deliveryRef: '',
    dateReceived: new Date().toISOString().slice(0, 10)
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    async function loadSuppliers() {
      try {
        const res = await apiClient.get('/suppliers', { params: { status: 'Active', limit: 200 } });
        if (res.data?.success) setSuppliers(res.data.data || []);
      } catch {
        setSuppliers([]);
      }
    }
    loadSuppliers();
  }, []);
  if (loading) return <LoadingState message="Loading product..." />;
  if (!product) return <EmptyState title="Product not found" actionLabel="Back" onAction={() => navigate('/warehouse/branch-inventory')} />;
  const handleSubmit = async () => {
    const nextErrors = {};
    if (!form.quantity || Number(form.quantity) <= 0) nextErrors.quantity = 'Quantity must be positive.';
    if (!form.supplierId) nextErrors.supplierId = 'Supplier is required.';
    if (!form.deliveryRef.trim()) nextErrors.deliveryRef = 'Delivery reference is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await createRestock({
      product_id: Number(productId),
      supplier_id: Number(form.supplierId),
      quantity: Number(form.quantity),
      delivery_ref: form.deliveryRef.trim(),
      received_date: form.dateReceived,
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Restock failed.', 'error');
      return;
    }
    showToast(result.message || 'Restock recorded.', 'success');
    navigate(`/warehouse/product/${productId}`);
  };
  const productName = product.product_name || product.name;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Record Restock — {productName}</h3></div>
        <div className="form-group"><label>Product Name</label><p className="field-preview">{productName}</p></div>
        <div className="form-group">
          <label>Quantity Restocked<span className="required">*</span></label>
          <input type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({
          ...p,
          quantity: e.target.value
        }))} />
          {errors.quantity ? <p className="form-error">{errors.quantity}</p> : null}
        </div>
        <div className="form-group">
          <label>Supplier<span className="required">*</span></label>
          <select className="filter-select" value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))}>
            <option value="">Select supplier</option>
            {suppliers.map(s => <option key={s.suppliers_id} value={s.suppliers_id}>{s.supplier_name}</option>)}
          </select>
          {errors.supplierId ? <p className="form-error">{errors.supplierId}</p> : null}
        </div>
        <div className="form-group">
          <label>Delivery Reference Number<span className="required">*</span></label>
          <input type="text" value={form.deliveryRef} onChange={e => setForm(p => ({
          ...p,
          deliveryRef: e.target.value
        }))} />
          {errors.deliveryRef ? <p className="form-error">{errors.deliveryRef}</p> : null}
        </div>
        <div className="form-group"><label>Date Received</label><input className="filter-input" type="date" value={form.dateReceived} onChange={e => setForm(p => ({
          ...p,
          dateReceived: e.target.value
        }))} /></div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}`)}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Create Restock Transaction'}</button>
      </div>
    </div>;
}
function TransferPage({
  productId,
  navigate,
  showToast
}) {
  const user = getCurrentUser();
  const { product, loading, systemQty } = useWarehouseProductContext(productId);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({
    destination: '',
    quantity: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    async function load() {
      const res = await fetchInventoryBranches();
      if (res.success) setBranches(res.data || []);
    }
    load();
  }, []);
  if (loading) return <LoadingState message="Loading product..." />;
  if (!product) return <EmptyState title="Product not found" actionLabel="Back" onAction={() => navigate('/warehouse/branch-inventory')} />;
  const sourceBranchId = user?.branch?.id;
  const handleSubmit = async () => {
    const qty = Number(form.quantity);
    const nextErrors = {};
    if (!form.destination) nextErrors.destination = 'Destination branch is required.';
    if (!qty || qty <= 0) nextErrors.quantity = 'Quantity must be positive.';
    if (qty > systemQty) nextErrors.quantity = `Cannot transfer more than available stock (${systemQty} units).`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await createInventoryTransfer({
      product_id: Number(productId),
      destination_branch_id: Number(form.destination),
      quantity: qty,
      notes: form.notes.trim(),
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Transfer failed.', 'error');
      return;
    }
    showToast(result.message || 'Transfer submitted for manager approval.', 'success');
    navigate('/warehouse/transfers?tab=requests');
  };
  const productName = product.product_name || product.name;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Transfer Stock — {productName}</h3></div>
        <div className="form-group"><label>Product Name</label><p className="field-preview">{productName}</p></div>
        <div className="form-group"><label>Source Branch</label><p className="field-preview">{user?.branch?.name || '—'}</p></div>
        <div className="form-group">
          <label>Destination Branch<span className="required">*</span></label>
          <select className="filter-select" value={form.destination} onChange={e => setForm(p => ({
          ...p,
          destination: e.target.value
        }))}>
            <option value="">Select destination</option>
            {branches.filter(b => b.branch_id !== sourceBranchId).map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
          </select>
          {errors.destination ? <p className="form-error">{errors.destination}</p> : null}
        </div>
        <div className="form-group">
          <label>Quantity<span className="required">*</span></label>
          <input type="number" min="1" max={systemQty || undefined} value={form.quantity} onChange={e => setForm(p => ({
          ...p,
          quantity: e.target.value
        }))} />
          {errors.quantity ? <p className="form-error">{errors.quantity}</p> : null}
        </div>
        <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => setForm(p => ({
          ...p,
          notes: e.target.value
        }))} /></div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${productId}`)}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Create Transfer Transaction'}</button>
      </div>
    </div>;
}
function MovementsPage({
  navigate
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const params = {};
      if (typeFilter !== 'All') params.type = typeFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const result = await fetchStockMovements(params);
      if (result.success) {
        setMovements(result.data || []);
      } else {
        setMovements([]);
        setError('Failed to load stock movements.');
      }
      setLoading(false);
    }
    load();
  }, [typeFilter, dateFrom, dateTo]);
  const productOptions = useMemo(() => {
    const map = new Map();
    movements.forEach(m => {
      if (m.product_id != null) map.set(String(m.product_id), m.product_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movements]);
  const branchOptions = useMemo(() => {
    return [...new Set(movements.map(m => m.branch_name).filter(Boolean))].sort();
  }, [movements]);
  const movementTypes = useMemo(() => {
    const types = [...new Set(movements.map(m => m.type).filter(Boolean))].sort();
    return ['All', ...types];
  }, [movements]);
  const filtered = useMemo(() => movements.filter(m => {
    const matchProduct = productFilter === 'All' || String(m.product_id) === productFilter;
    const matchBranch = branchFilter === 'All' || m.branch_name === branchFilter;
    return matchProduct && matchBranch;
  }), [movements, productFilter, branchFilter]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading stock movements..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Movement History</h3>
          <p className="text-ink/70" style={{
          margin: 0,
          fontSize: '0.82rem'
        }}>{movements.length} record{movements.length !== 1 ? 's' : ''} from database</p>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="list-section-controls" style={{ marginBottom: 12 }}>
          <select className="filter-select" value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            <option value="All">All Products</option>
            {productOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="filter-select" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
            <option value="All">All Branches</option>
            {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {movementTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
          </select>
          <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" />
          <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" />
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Movement ID</th>
                  <th>Reference</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Type</th>
                  <th>Branch</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(m => <tr key={m.movement_id} className="clickable-row" onClick={() => navigate(`/warehouse/movements/${m.movement_id}`)}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{m.movement_id}</span></td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{m.movement_ref || '—'}</span></td>
                    <td>{m.product_name}{m.sku ? <><br /><span className="text-ink/70" style={{
                      fontSize: '0.75rem'
                    }}>{m.sku}</span></> : null}</td>
                    <td style={{
                  fontWeight: 600,
                  color: m.quantity > 0 ? '#4A6B12' : '#dc2626'
                }}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td><StatusBadge status={m.type} /></td>
                    <td>{m.branch_name || '—'}</td>
                    <td style={{
                  fontSize: '0.82rem'
                }}>{formatDisplayDate(m.movement_date)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No movements found" description="Adjust your filters or record stock activity to populate this list." />}
      </section>
    </div>;
}
function MovementDetailPage({
  movementId,
  navigate
}) {
  const [movement, setMovement] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchStockMovementById(movementId);
      if (result.success) setMovement(result.data);
      setLoading(false);
    }
    load();
  }, [movementId]);
  if (loading) return <LoadingState message="Loading movement..." />;
  if (!movement) return <EmptyState title="Movement not found" actionLabel="Back" onAction={() => navigate('/warehouse/movements')} />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
      label: 'Movement ID',
      value: String(movement.movement_id)
    }, {
      label: 'Quantity',
      value: movement.quantity > 0 ? `+${movement.quantity}` : String(movement.quantity)
    }, {
      label: 'Type',
      value: movement.type
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Reference</span>
            <strong style={{
            fontFamily: 'monospace'
          }}>{movement.movement_ref || '—'}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Product</span>
            <strong>{movement.product_name}{movement.sku ? ` (${movement.sku})` : ''}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Branch</span>
            <strong>{movement.branch_name || '—'}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Movement Date</span>
            <strong>{formatDisplayDate(movement.movement_date)}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Performed By</span>
            <strong>{movement.performed_by_name || '—'}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Recorded At</span>
            <strong>{formatDisplayDateTime(movement.created_at)}</strong>
          </article>
        </div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/movements')}>Back to Movements</button>
      </div>
    </div>;
}
function TransferRequestNewPage({
  navigate,
  showToast
}) {
  const user = getCurrentUser();
  const sourceBranchId = user?.branch?.id;
  const [branchStock, setBranchStock] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ productId: '', destination: '', quantity: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [invRes, branchRes] = await Promise.all([
        fetchBranchInventory(),
        fetchInventoryBranches(),
      ]);
      if (invRes.success) setBranchStock(invRes.data || []);
      if (branchRes.success) setBranches(branchRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const selectedRow = branchStock.find(r => String(r.product_id) === String(form.productId));
  const availableQty = Number(selectedRow?.available_stock ?? selectedRow?.quantity ?? 0);

  const handleSubmit = async () => {
    const qty = Number(form.quantity);
    const nextErrors = {};
    if (!form.productId) nextErrors.productId = 'Select a product.';
    if (!form.destination) nextErrors.destination = 'Select destination branch.';
    if (!qty || qty <= 0) nextErrors.quantity = 'Enter a positive quantity.';
    if (form.productId && qty > availableQty) nextErrors.quantity = `Max available at your branch: ${availableQty}.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await createInventoryTransfer({
      product_id: Number(form.productId),
      destination_branch_id: Number(form.destination),
      quantity: qty,
      notes: form.notes.trim(),
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Request failed.', 'error');
      return;
    }
    showToast(result.message || 'Transfer request submitted.', 'success');
    navigate('/warehouse/transfers?tab=requests');
  };

  if (loading) return <LoadingState message="Loading branch stock..." />;

  const stockOptions = branchStock.filter(r => Number(r.available_stock ?? r.quantity ?? 0) > 0);

  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <h3>New transfer request</h3>
        <p className="text-ink/70" style={{ marginTop: 0 }}>From <strong>{user?.branch?.name || 'your branch'}</strong>. Request goes to branch / operating manager for approval.</p>
        <div className="form-group">
          <label>Product<span className="required">*</span></label>
          <select className="filter-select" value={form.productId} onChange={e => setForm(p => ({ ...p, productId: e.target.value, quantity: '' }))}>
            <option value="">Select product with stock</option>
            {stockOptions.map(r => <option key={r.product_id} value={r.product_id}>
                {r.product_name} ({r.sku}) — {r.available_stock ?? r.quantity} on hand
              </option>)}
          </select>
          {errors.productId ? <p className="form-error">{errors.productId}</p> : null}
        </div>
        <div className="form-group">
          <label>Destination branch<span className="required">*</span></label>
          <select className="filter-select" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}>
            <option value="">Select destination</option>
            {branches.filter(b => b.branch_id !== sourceBranchId).map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
          </select>
          {errors.destination ? <p className="form-error">{errors.destination}</p> : null}
        </div>
        <div className="form-group">
          <label>Quantity<span className="required">*</span></label>
          <input type="number" min="1" max={availableQty || undefined} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
          {selectedRow ? <p className="text-ink/60" style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>Available: {availableQty}</p> : null}
          {errors.quantity ? <p className="form-error">{errors.quantity}</p> : null}
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/warehouse/transfers?tab=requests')}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting || !stockOptions.length}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
      {!stockOptions.length ? <p className="form-error">No products with stock at your branch. Restock or pick a product from Branch Inventory first.</p> : null}
    </div>;
}

function TransfersPage({
  navigate,
  transferTab: transferTabProp = 'requests',
}) {
  const user = getCurrentUser();
  const branchId = user?.branch?.id;
  const mainTab = transferTabProp === 'history' ? 'history' : 'requests';
  const [requestSegment, setRequestSegment] = useState('Action required');
  const [statusFilter, setStatusFilter] = useState('All');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchInventoryTransfers();
      if (result.success) setTransfers(result.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const setMainTab = (tab) => {
    navigate(tab === 'history' ? '/warehouse/transfers?tab=history' : '/warehouse/transfers?tab=requests');
  };

  const counts = useMemo(() => {
    const awaiting = transfers.filter(t => isTransferPendingApproval(t.status)
      && Number(t.source_branch_id) === Number(branchId)).length;
    const readyToShip = transfers.filter(t => t.status === 'Approved'
      && Number(t.source_branch_id) === Number(branchId)).length;
    const incoming = transfers.filter(t => (t.status === 'Approved' || isTransferPendingApproval(t.status))
      && Number(t.destination_branch_id) === Number(branchId)
      && Number(t.source_branch_id) !== Number(branchId)).length;
    return { awaiting, readyToShip, incoming };
  }, [transfers, branchId]);

  const requestsFiltered = useMemo(() => {
    if (requestSegment === 'Action required') {
      return transfers.filter(t => t.status === 'Approved'
        && Number(t.source_branch_id) === Number(branchId));
    }
    if (requestSegment === 'Awaiting approval') {
      return transfers.filter(t => isTransferPendingApproval(t.status)
        && Number(t.source_branch_id) === Number(branchId));
    }
    if (requestSegment === 'Incoming') {
      return transfers.filter(t => (t.status === 'Approved' || isTransferPendingApproval(t.status))
        && Number(t.destination_branch_id) === Number(branchId)
        && Number(t.source_branch_id) !== Number(branchId));
    }
    return transfers;
  }, [requestSegment, transfers, branchId]);

  const historyFiltered = useMemo(() => {
    if (statusFilter === 'All') return transfers;
    if (statusFilter === 'Pending Transfers') return transfers.filter(t => t.status.includes('Pending') || t.status === 'Submitted');
    if (statusFilter === 'Approved Transfers') return transfers.filter(t => t.status === 'Approved');
    if (statusFilter === 'Completed Transfers') return transfers.filter(t => t.status === 'Completed');
    if (statusFilter === 'Cancelled Transfers') return transfers.filter(t => t.status === 'Rejected');
    return transfers;
  }, [statusFilter, transfers]);

  const pagination_requests = usePagination(requestsFiltered);
  const paginated_requests = pagination_requests.paginatedData;
  const pagination_history = usePagination(historyFiltered);
  const paginated_history = pagination_history.paginatedData;

  if (loading) return <LoadingState message="Loading transfers..." />;

  return <div className="relative z-10 grid gap-[22px] w-full">
      {mainTab === 'requests' ? <StatsGrid stats={[{
      label: 'Ready to ship',
      value: String(counts.readyToShip)
    }, {
      label: 'Awaiting manager approval',
      value: String(counts.awaiting)
    }, {
      label: 'Incoming to your branch',
      value: String(counts.incoming)
    }]} /> : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Transfers</h3>
            <p className="text-ink/70" style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
              Submit requests from your branch, track approval, and view full history.
            </p>
          </div>
          <div className="list-section-actions">
            <button className="button" type="button" onClick={() => navigate('/warehouse/transfers/new')}>New transfer request</button>
          </div>
        </div>

        <div className="segmented-control" style={{ marginBottom: 16 }}>
          <button className={mainTab === 'requests' ? 'segment active' : 'segment'} type="button" onClick={() => setMainTab('requests')}>
            Transfer requests
          </button>
          <button className={mainTab === 'history' ? 'segment active' : 'segment'} type="button" onClick={() => setMainTab('history')}>
            History
          </button>
        </div>

        {mainTab === 'requests' ? <>
            <div className="segmented-control" style={{ marginBottom: 12 }}>
              {['Action required', 'Awaiting approval', 'Incoming', 'All'].map(s => <button key={s} className={requestSegment === s ? 'segment active' : 'segment'} type="button" onClick={() => setRequestSegment(s)}>
                  {s}
                </button>)}
            </div>
            {requestsFiltered.length ? <><div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>From → To</th>
                      <th>Submitted</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated_requests.map(t => <tr key={t.transfer_id} className="clickable-row" onClick={() => navigate(`/warehouse/transfers/${t.transfer_id}`)}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{t.transfer_ref}</span></td>
                        <td>{t.product_name}<br /><span className="text-ink/70" style={{ fontSize: '0.75rem' }}>{t.sku}</span></td>
                        <td>{t.quantity}</td>
                        <td>{t.source_branch} → {t.destination_branch}</td>
                        <td style={{ fontSize: '0.82rem' }}>{formatDisplayDate(t.submitted_date)}</td>
                        <td><StatusBadge status={t.status} /></td>
                      </tr>)}
                  </tbody>
                </table>
              </div><Pagination {...pagination_requests} /></>
            : <EmptyState
                title="No requests in this view"
                description={requestSegment === 'Action required'
                  ? 'Approved transfers ready for shipment will appear here.'
                  : 'Create a new request or check another filter.'}
                actionLabel="New transfer request"
                onAction={() => navigate('/warehouse/transfers/new')}
              />}
          </> : <>
            <div className="segmented-control" style={{ marginBottom: 12 }}>
              {['All', 'Pending Transfers', 'Approved Transfers', 'Completed Transfers', 'Cancelled Transfers'].map(s => <button key={s} className={statusFilter === s ? 'segment active' : 'segment'} type="button" onClick={() => setStatusFilter(s)}>
                  {s.replace(' Transfers', '')}
                </button>)}
            </div>
            {historyFiltered.length ? <><div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Transfer Ref</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Submitted By</th>
                      <th>Date</th>
                      <th>Created At</th>
                      <th>Updated At</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated_history.map(t => <tr key={t.transfer_id} className="clickable-row" onClick={() => navigate(`/warehouse/transfers/${t.transfer_id}`)}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{t.transfer_ref}</span></td>
                        <td>{t.product_name}<br /><span className="text-ink/70" style={{ fontSize: '0.75rem' }}>{t.sku}</span></td>
                        <td>{t.quantity}</td>
                        <td>{t.source_branch}</td>
                        <td>{t.destination_branch}</td>
                        <td>{t.submitted_by_name || '—'}</td>
                        <td className="text-ink/70" style={{ fontSize: '0.82rem' }}>{formatDisplayDate(t.submitted_date)}</td>
                        <td style={{ fontSize: '0.82rem' }}>{formatDisplayDateTime(t.created_at)}</td>
                        <td style={{ fontSize: '0.82rem' }}>{formatDisplayDateTime(t.updated_at)}</td>
                        <td><StatusBadge status={t.status} /></td>
                      </tr>)}
                  </tbody>
                </table>
              </div><Pagination {...pagination_history} /></>
            : <EmptyState title="No transfers found" description="Adjust your filters." />}
          </>}
      </section>
    </div>;
}
function TransferDetailPage({
  transferId,
  navigate,
  showToast,
  backPath = '/warehouse/transfers?tab=requests',
  backLabel = 'Back to Transfers',
}) {
  const currentUser = getCurrentUser();
  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    const result = await fetchInventoryTransferById(transferId);
    if (result.success) setTransfer(result.data);
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, [transferId]);
  if (loading) return <LoadingState message="Loading transfer..." />;
  if (!transfer) return <EmptyState title="Transfer not found" actionLabel="Back" onAction={() => navigate(backPath)} />;
  const workflowSteps = ['Submitted', 'Manager approval', 'Approved', 'Completed'];
  const activeStep = transferWorkflowStepIndex(transfer.status);
  const isSourceBranch = currentUser?.branch?.id != null
    && Number(transfer.source_branch_id) === Number(currentUser.branch.id);
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
      label: 'Transfer Ref',
      value: transfer.transfer_ref
    }, {
      label: 'Product',
      value: transfer.product_name
    }, {
      label: 'Quantity',
      value: String(transfer.quantity)
    }, {
      label: 'Status',
      value: transfer.status
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Product</span>
            <strong>{transfer.product_name} <span className="text-ink/70" style={{
              fontSize: '0.78rem'
            }}>({transfer.sku})</span></strong>
          </article>
          <article className="transfer-detail-card">
            <span>Source Branch</span>
            <strong>{transfer.source_branch}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Destination Branch</span>
            <strong>{transfer.destination_branch}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Submitted By</span>
            <strong>{transfer.submitted_by_name || '—'}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Submitted Date</span>
            <strong>{formatDisplayDate(transfer.submitted_date)}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Created At</span>
            <strong>{formatDisplayDateTime(transfer.created_at)}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Updated At</span>
            <strong>{formatDisplayDateTime(transfer.updated_at)}</strong>
          </article>
          {transfer.approved_by_name ? <article className="transfer-detail-card">
              <span>Approved By</span>
              <strong>{transfer.approved_by_name}</strong>
            </article> : null}
          {transfer.completed_date ? <article className="transfer-detail-card">
              <span>Completed Date</span>
              <strong>{formatDisplayDate(transfer.completed_date)}</strong>
            </article> : null}
          {transfer.approval_info ? <article className="transfer-detail-card transfer-detail-card-wide">
              <span>Approval Info</span>
              <strong>{transfer.approval_info}</strong>
            </article> : null}
        </div>
        {transfer.status !== 'Rejected' ? <div className="approval-workflow">
            <h4 className="subsection-title">Approval Workflow</h4>
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
          </div> : null}
      </section>
      {(transfer.status === 'Pending Approval' || transfer.status === 'Submitted') ? (
        <section className="panel content-panel">
          <p className="muted">
            This request is waiting for <strong>branch manager</strong> or <strong>operating manager</strong> approval
            (Approval Center). Warehouse staff cannot approve their own transfers — that separation prevents stock
            leaving the branch without oversight.
          </p>
        </section>
      ) : null}
      {transfer.status === 'Approved' && isSourceBranch ? (
        <section className="panel content-panel">
          <p className="muted">Managers approved this transfer. Confirm physical shipment to deduct source stock and add destination stock.</p>
        </section>
      ) : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(backPath)}>{backLabel}</button>
        {transfer.status === 'Approved' && isSourceBranch ? (
          <button className="button" type="button" onClick={async () => {
            const result = await patchInventoryTransfer(transferId, { status: 'Completed' });
            if (result.success) {
              showToast(result.message || 'Transfer completed.', 'success');
              reload();
            } else showToast(result.message || 'Complete failed.', 'error');
          }}
          >
            Confirm shipment & complete
          </button>
        ) : null}
      </div>
    </div>;
}
function RestockHistoryPage({
  navigate
}) {
  const [supplier, setSupplier] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchRestocks();
      if (result.success) setRestocks(result.data);
      setLoading(false);
    }
    load();
  }, []);
  const suppliers = ['All', ...new Set(restocks.map(r => r.supplier_name))];
  const productNames = ['All', ...new Set(restocks.map(r => r.product_name))];
  const filtered = useMemo(() => restocks.filter(r => {
    const matchSupplier = supplier === 'All' || r.supplier_name === supplier;
    const matchProduct = productFilter === 'All' || r.product_name === productFilter;
    const matchFrom = !dateFrom || r.received_date >= dateFrom;
    const matchTo = !dateTo || r.received_date <= dateTo;
    return matchSupplier && matchProduct && matchFrom && matchTo;
  }), [supplier, productFilter, dateFrom, dateTo, restocks]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading restock history..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Restock Records</h3></div>
        <div className="list-section-controls" style={{ marginBottom: 12 }}>
          <select className="filter-select" value={supplier} onChange={e => setSupplier(e.target.value)}>
            {suppliers.map(s => <option key={s} value={s}>{s === 'All' ? 'All Suppliers' : s}</option>)}
          </select>
          <select className="filter-select" value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            {productNames.map(p => <option key={p} value={p}>{p === 'All' ? 'All Products' : p}</option>)}
          </select>
          <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" />
          <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" />
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Delivery Ref</th>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th>Branch</th>
                  <th>Quantity</th>
                  <th>Date Received</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(r => <tr key={r.restock_id} className="clickable-row" onClick={() => navigate(`/warehouse/restock-history/${r.restock_id}`)}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.delivery_ref}</span></td>
                    <td>{r.product_name}</td>
                    <td>{r.supplier_name}</td>
                    <td>{r.branch_name}</td>
                    <td style={{
                  color: '#4A6B12',
                  fontWeight: 600
                }}>+{r.quantity}</td>
                    <td>{formatDisplayDate(r.received_date)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No restock records found" description="Adjust your filters." />}
      </section>
    </div>;
}
function RestockDetailPage({
  restockId,
  navigate
}) {
  const [restock, setRestock] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchRestockById(restockId);
      if (res.success) setRestock(res.data);
      setLoading(false);
    }
    load();
  }, [restockId]);
  if (loading) return <LoadingState message="Loading restock..." />;
  if (!restock) return <EmptyState title="Restock not found" actionLabel="Back" onAction={() => navigate('/warehouse/restock-history')} />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
        label: 'Delivery ref',
        value: restock.delivery_ref
      }, {
        label: 'Quantity',
        value: `+${restock.quantity}`
      }, {
        label: 'Received',
        value: formatDisplayDate(restock.received_date)
      }]} />
      <section className="panel content-panel">
        <ul className="info-grid">
          <li><span className="info-item-label">Product</span><span className="info-item-value">{restock.product_name}</span></li>
          <li><span className="info-item-label">SKU</span><span className="info-item-value">{restock.sku}</span></li>
          <li><span className="info-item-label">Supplier</span><span className="info-item-value">{restock.supplier_name}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{restock.branch_name}</span></li>
        </ul>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/restock-history')}>Back</button>
        <button className="button secondary" type="button" onClick={() => navigate(`/warehouse/product/${restock.product_id}`)}>View product</button>
      </div>
    </div>;
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
          return '/warehouse/branch-inventory';
        }
        if (category.includes('restock')) {
          return '/warehouse/restock-history';
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
  const user = getCurrentUser();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    async function load() {
      const res = await fetchMyProfile();
      if (res.success && res.data) {
        setProfile(res.data);
        setPhone(res.data.phone || '');
      }
    }
    load();
  }, []);
  const initials = (profile?.fullName || user?.fullName || 'W').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const save = async () => {
    const body = { phone: phone.trim() };
    if (password.trim().length >= 8) body.password = password.trim();
    const res = await updateMyProfile(body);
    if (res.success) {
      persistCurrentUserFromProfile(res.data);
      setProfile(res.data);
      setPassword('');
      setEditing(false);
      showToast('Profile updated.', 'success');
    } else showToast(res.message || 'Update failed.', 'error');
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div><h3>{profile?.fullName || user?.fullName}</h3><p className="text-ink/70">{profile?.email || user?.email}</p></div>
        </div>
        {editing ? <div className="form-group">
            <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
            <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" /></label>
          </div> : <div className="transfer-detail-grid">
          <article className="transfer-detail-card"><span>Branch</span><strong>{profile?.branch?.name || user?.branch?.name || '—'}</strong></article>
          <article className="transfer-detail-card"><span>Email</span><strong>{profile?.email || '—'}</strong></article>
          <article className="transfer-detail-card"><span>Phone</span><strong>{profile?.phone || '—'}</strong></article>
          <article className="transfer-detail-card"><span>Status</span><strong>{profile?.status || '—'}</strong></article>
        </div>}
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/audit-log')}>Audit Log</button>
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/reports')}>Reports</button>
        <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
        {editing ? <>
            <button className="button ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="button" type="button" onClick={save}>Save</button>
          </> : <button className="button" type="button" onClick={() => setEditing(true)}>Update Profile</button>}
      </div>
    </div>;
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
  return <div className="relative z-10 grid gap-[22px] w-full">
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
  return <div className="relative z-10 grid gap-[22px] w-full">
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
  navigate
}) {
  const [prefs, setPrefs] = useState(() => ({
    barcode: localStorage.getItem('corvex_warehouse_barcode') !== '0',
    lowStock: localStorage.getItem('corvex_warehouse_low_stock') !== '0',
  }));
  const save = (next) => {
    setPrefs(next);
    localStorage.setItem('corvex_warehouse_barcode', next.barcode ? '1' : '0');
    localStorage.setItem('corvex_warehouse_low_stock', next.lowStock ? '1' : '0');
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Settings</h3></div>
        <p className="text-ink/70">These preferences are saved on this device.</p>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" checked={prefs.barcode} onChange={(e) => save({ ...prefs, barcode: e.target.checked })} />Enable barcode scanning</label></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" checked={prefs.lowStock} onChange={(e) => save({ ...prefs, lowStock: e.target.checked })} />Low stock alert notifications</label></div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/dashboard')}>Back to Dashboard</button>
      </div>
    </div>;
}
function SuppliersPage({
  navigate,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [form, setForm] = useState({
    supplier_name: '',
    contact: '',
    email: '',
    address: '',
    status: 'Active'
  });
  const [errors, setErrors] = useState({});
  const limit = 20;
  useEffect(() => {
    loadSuppliers();
  }, [page, statusFilter, search]);
  async function loadSuppliers() {
    setLoading(true);
    try {
      const apiClient = (await import('../../api/apiClient.js')).default;
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (search) params.append('search', search);
      const res = await apiClient.get(`/suppliers?${params.toString()}`);
      if (res.data.success) {
        setSuppliers(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('[Suppliers] load error:', err.message);
      showToast('Failed to load suppliers.', 'error');
    }
    setLoading(false);
  }
  const handleAdd = () => {
    setForm({
      supplier_name: '',
      contact: '',
      email: '',
      address: '',
      status: 'Active'
    });
    setErrors({});
    setShowAddModal(true);
  };
  const handleEdit = supplier => {
    setForm({
      supplier_name: supplier.supplier_name,
      contact: supplier.contact || '',
      email: supplier.email || '',
      address: supplier.address || '',
      status: supplier.status
    });
    setEditingSupplier(supplier);
    setErrors({});
    setShowAddModal(true);
  };
  const handleArchive = async supplierId => {
    if (!confirm('Are you sure you want to archive this supplier?')) return;
    try {
      const apiClient = (await import('../../api/apiClient.js')).default;
      await apiClient.delete(`/suppliers/${supplierId}`);
      showToast('Supplier archived successfully.', 'success');
      loadSuppliers();
    } catch (err) {
      console.error('[Suppliers] archive error:', err.message);
      showToast('Failed to archive supplier.', 'error');
    }
  };
  const handleSubmit = async e => {
    e.preventDefault();
    const newErrors = {};
    if (!form.supplier_name.trim()) newErrors.supplier_name = 'Supplier name is required';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) newErrors.email = 'Invalid email format';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    try {
      const apiClient = (await import('../../api/apiClient.js')).default;
      if (editingSupplier) {
        await apiClient.put(`/suppliers/${editingSupplier.suppliers_id}`, form);
        showToast('Supplier updated successfully.', 'success');
      } else {
        await apiClient.post('/suppliers', form);
        showToast('Supplier created successfully.', 'success');
      }
      setShowAddModal(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (err) {
      console.error('[Suppliers] submit error:', err.message);
      showToast(err.response?.data?.message || 'Failed to save supplier.', 'error');
    }
  };
  const totalPages = Math.ceil(total / limit);
  if (loading) return <LoadingState message="Loading suppliers..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Suppliers</h3>
          <div className="list-section-actions">
            <button className="button" type="button" onClick={handleAdd}>Add Supplier</button>
          </div>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by name, contact, or email" value={search} onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }} />
            <select className="filter-select" value={statusFilter} onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
          </div>
        </div>
        {suppliers.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr><th>Supplier ID</th><th>Supplier Name</th><th>Contact</th><th>Email</th><th>Address</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {suppliers.map(supplier => <tr key={supplier.suppliers_id} className="clickable-row" onClick={() => navigate(`/warehouse/suppliers/${supplier.suppliers_id}`)}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{supplier.suppliers_id}</span></td>
                    <td>{supplier.supplier_name}</td>
                    <td>{supplier.contact || '—'}</td>
                    <td>{supplier.email || '—'}</td>
                    <td>{supplier.address || '—'}</td>
                    <td><StatusBadge status={supplier.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={e => {
                    e.stopPropagation();
                    handleEdit(supplier);
                  }}><NavIcon name="edit" /></button>
                      <button className="icon-action-button danger" type="button" title="Archive" onClick={e => {
                    e.stopPropagation();
                    handleArchive(supplier.suppliers_id);
                  }}><NavIcon name="archive" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={Math.max(1, totalPages)}
              totalRecords={total}
              pageSize={limit}
              startRecord={total ? (page - 1) * limit + 1 : 0}
              endRecord={Math.min(page * limit, total)}
              prevPage={() => setPage((p) => Math.max(1, p - 1))}
              nextPage={() => setPage((p) => Math.min(Math.max(1, totalPages), p + 1))}
              goToPage={setPage}
            /></>
        : <EmptyState title="No suppliers found" description="Adjust your search or filters." actionLabel="Add Supplier" onAction={handleAdd} />}
      </section>

      {showAddModal && <div className="modal-overlay" role="dialog" aria-modal="true" onClick={e => {
      if (e.target === e.currentTarget) {
        setShowAddModal(false);
        setEditingSupplier(null);
      }
    }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
              <button className="icon-action-button" type="button" title="Close" onClick={() => {
            setShowAddModal(false);
            setEditingSupplier(null);
          }}><NavIcon name="close" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Supplier Name *</label>
                <input type="text" value={form.supplier_name} onChange={e => setForm({
              ...form,
              supplier_name: e.target.value
            })} />
                {errors.supplier_name && <p className="form-error">{errors.supplier_name}</p>}
              </div>
              <div className="form-group">
                <label>Contact</label>
                <input type="text" value={form.contact} onChange={e => setForm({
              ...form,
              contact: e.target.value
            })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({
              ...form,
              email: e.target.value
            })} />
                {errors.email && <p className="form-error">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea value={form.address} onChange={e => setForm({
              ...form,
              address: e.target.value
            })} rows={3} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="filter-select" value={form.status} onChange={e => setForm({
              ...form,
              status: e.target.value
            })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => {
              setShowAddModal(false);
              setEditingSupplier(null);
            }}>Cancel</button>
                <button type="submit" className="button">{editingSupplier ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}
function SupplierDetailPage({
  supplierId,
  navigate,
  showToast
}) {
  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const apiClient = (await import('../../api/apiClient.js')).default;
        const res = await apiClient.get(`/suppliers/${supplierId}`);
        if (res.data.success) setSupplier(res.data.data);else if (showToast) showToast('Supplier not found.', 'error');
      } catch (err) {
        console.error('[Suppliers] detail load error:', err.message);
        if (showToast) showToast('Failed to load supplier.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [supplierId, showToast]);
  if (loading) return <LoadingState message="Loading supplier..." />;
  if (!supplier) {
    return <EmptyState title="Supplier not found" actionLabel="Back" onAction={() => navigate('/warehouse/suppliers')} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
      label: 'Supplier ID',
      value: String(supplier.suppliers_id)
    }, {
      label: 'Status',
      value: supplier.status
    }, {
      label: 'Contact',
      value: supplier.contact || '—'
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Supplier Name</span>
            <strong>{supplier.supplier_name}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Email</span>
            <strong>{supplier.email || '—'}</strong>
          </article>
          <article className="transfer-detail-card transfer-detail-card-wide">
            <span>Address</span>
            <strong>{supplier.address || '—'}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Created At</span>
            <strong>{formatDisplayDateTime(supplier.created_at)}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Updated At</span>
            <strong>{formatDisplayDateTime(supplier.updated_at)}</strong>
          </article>
        </div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/warehouse/suppliers')}>Back to Suppliers</button>
      </div>
    </div>;
}
function BranchInventoryPage({
  navigate,
  showToast
}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchBranchInventory();
      if (result.success) {
        setRecords(result.data || []);
      } else {
        setError(result.message || 'Failed to load branch inventory.');
        if (showToast) showToast(result.message || 'Failed to load branch inventory', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);
  const branches = useMemo(() => ['All', ...new Set(records.map(r => r.branch_name).filter(Boolean))], [records]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      const matchSearch = !q || (r.product_name || '').toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q) || String(r.branch_inventory_id).includes(q);
      const matchStatus = statusFilter === 'All' || r.stock_status === statusFilter;
      const matchBranch = branchFilter === 'All' || r.branch_name === branchFilter;
      return matchSearch && matchStatus && matchBranch;
    });
  }, [records, search, statusFilter, branchFilter]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading branch inventory..." />;
  if (error && !records.length) {
    return <EmptyState title="Unable to load branch inventory" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Branch Inventory</h3>
          <p className="text-ink/70">{records.length} record{records.length !== 1 ? 's' : ''} in database</p>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by product or branch name" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              {branches.map(b => <option key={b} value={b}>{b === 'All' ? 'All Branches' : b}</option>)}
            </select>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Sufficient', 'Low Stock', 'Out of Stock'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
          </div>
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Branch</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Available Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(r => <tr key={r.branch_inventory_id} className="clickable-row" onClick={() => navigate(`/warehouse/product/${r.product_id}`)}>
                    <td>{r.branch_inventory_id}</td>
                    <td>{r.branch_name || '—'}</td>
                    <td>{r.product_name || '—'}</td>
                    <td>{r.category_name || '—'}</td>
                    <td>{r.available_stock}</td>
                    <td>{r.reorder_level}</td>
                    <td>
                      <StatusBadge status={r.stock_status || '—'} />
                    </td>
                    <td>{formatDisplayDateTime(r.created_at)}</td>
                    <td>{formatDisplayDateTime(r.updated_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No records found" description="Adjust your search or filters." />}
      </section>
    </div>;
}

// ── Product Categories (View-Only for Warehouse) ──────────────────────────────
function ProductCategoriesPage({
  navigate,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const {
          fetchProductCategories
        } = await import('../../api/productCategoriesService');
        const result = await fetchProductCategories(search ? {
          search
        } : {});
        if (result.success) setCategories(result.data || []);
      } catch (err) {
        showToast('Failed to load product categories.', 'error');
      }
      setLoading(false);
    }
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search]);
  const pagination_categories = usePagination(categories);
  const paginated_categories = pagination_categories.paginatedData;
  return <div className="page-container">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Product Categories</h3>
        </div>
        <div className="list-section-toolbar">
          <p className="list-section-subtitle">View product categories (read-only)</p>
          <div className="search-bar">
            <NavIcon name="search" />
            <input className="search-input" type="search" placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? <LoadingState message="Loading categories…" /> : categories.length === 0 ? <EmptyState title="No categories found" description="No product categories match your search." /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr><th>ID</th><th>Category Name</th><th>Status</th><th>Created At</th></tr>
              </thead>
              <tbody>
                {paginated_categories.map(c => <tr key={c.category_id}>
                    <td>{c.category_id}</td>
                    <td>{c.category_name}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem'
                }}>{formatDisplayDateTime(c.created_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_categories} /></>}
      </section>
    </div>;
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
    case 'inventory':
    case 'branchInventory':
      return <BranchInventoryPage {...props} />;
    case 'products':
      return <InventoryPage {...props} />;
    case 'addProduct':
      return <AddProductPage {...props} />;
    case 'editProduct':
      return <EditProductPage {...props} />;
    case 'productDetail':
      return <ProductDetailPage {...props} />;
    case 'stockCount':
      return <StockCountPage {...props} />;
    case 'restock':
      return <RestockPage {...props} />;
    case 'transfer':
      return <TransferPage {...props} />;
    case 'movements':
      return <MovementsPage {...props} />;
    case 'movementDetail':
      return <MovementDetailPage {...props} />;
    case 'transferRequestNew':
      return <TransferRequestNewPage {...props} />;
    case 'transfers':
      return <TransfersPage {...props} transferTab={page.params?.transferTab} />;
    case 'transferDetail':
      return <TransferDetailPage {...props} />;
    case 'restockHistory':
      return <RestockHistoryPage {...props} />;
    case 'restockDetail':
      return <RestockDetailPage {...props} />;
    case 'creditHistory':
      return <CreditHistoryListPage {...props} />;
    case 'creditDetail':
      return <CreditHistoryDetailPage {...props} />;
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