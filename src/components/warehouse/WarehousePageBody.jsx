import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AUDIT_LOGS,
  BRANCHES,
  CATEGORIES,
  DASHBOARD_SUMMARY,
  EXISTING_SKUS,
  INVENTORY_HEALTH,
  NOTIFICATIONS,
  PRODUCTS,
  RESTOCKS,
  STOCK_MOVEMENTS,
  TOP_MOVING_PRODUCTS,
  INVENTORY_TRANSFERS,
  WAREHOUSE_STAFF_PROFILE,
  getMovementById,
  getProductById,
  getRestockById,
  getTransferById,
} from '../../data/warehouseMockData';
import { fetchInventoryTransfers, fetchInventoryTransferById, fetchRestocks, fetchBranchInventory } from '../../api/inventoryService';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';
import { StatusBadge } from '../StatusBadge';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount) || 0);
}

function actionButtonClass(variant) {
  if (variant === 'secondary') return 'button secondary';
  if (variant === 'ghost') return 'button ghost';
  return 'button';
}

function PageToolbar({ actions, onAction }) {
  if (!actions?.length) return null;
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map((action) => (
            <button key={action.label} className={actionButtonClass(action.variant)} type="button" onClick={() => onAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function StatsGrid({ stats }) {
  if (!stats?.length) return null;
  return (
    <section className="stats-grid">
      {stats.map((stat, index) => (
        <article key={stat.label} className="stat-card" style={{ '--stat-index': index }}>
          <div className="stat-card-top">
            <span className="stat-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="stat-dot" aria-hidden="true" />
          </div>
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>
      ))}
    </section>
  );
}

function StockStatusBadge({ status }) {
  const cls = {
    Sufficient: 'stock-sufficient',
    'Low Stock': 'stock-low',
    'Critical Stock': 'stock-critical',
    'Out of Stock': 'stock-critical',
  }[status] ?? '';
  return <span className={`stock-status ${cls}`}>{status}</span>;
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="button ghost" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span className="muted">Page {page} of {totalPages}</span>
      <button className="button ghost" type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  );
}

const PAGE_SIZE = 5;

function DashboardPage({ navigate, showToast }) {
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;
  const criticalProducts = PRODUCTS.filter((p) => p.status === 'Critical Stock' || p.status === 'Out of Stock');
  const firstProduct = PRODUCTS[0];

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Warehouse operations</p>
          <h2>{WAREHOUSE_STAFF_PROFILE.name}</h2>
          <p className="muted">{WAREHOUSE_STAFF_PROFILE.warehouse}</p>
        </div>
        <Link to="/warehouse/notifications" className="notification-bell" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid stats={[
        { label: 'Total Products Tracked', value: String(DASHBOARD_SUMMARY.totalProducts) },
        { label: 'Low Stock Alerts', value: String(DASHBOARD_SUMMARY.lowStockAlerts) },
        { label: 'Pending Restocks', value: String(DASHBOARD_SUMMARY.pendingRestocks) },
        { label: "Today's Stock Movements", value: String(DASHBOARD_SUMMARY.movementsToday) },
      ]} />

      <PageToolbar actions={[
        { label: 'Log Stock Count', to: `/warehouse/product/${firstProduct.id}/stock-count` },
        { label: 'Record Restock', to: `/warehouse/product/${firstProduct.id}/restock`, variant: 'secondary' },
        { label: 'Transfer Stock', to: `/warehouse/product/${firstProduct.id}/transfer`, variant: 'secondary' },
        { label: 'View Inventory', to: '/warehouse/inventory', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />

      {criticalProducts.length ? (
        <section className="panel content-panel alert-panel">
          <div className="panel-section-header"><h3>Critical Stock Alerts</h3></div>
          <ul className="widget-list">
            {criticalProducts.map((p) => (
              <li key={p.id}>
                <div><strong>{p.name}</strong><span className="muted">{p.sku} · {p.branch}</span></div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Transfers</h3></div>
          <ul className="widget-list">
            {INVENTORY_TRANSFERS.slice(0, 3).map((t) => (
              <li key={t.id}><div><strong>{t.id}</strong><span className="muted">{t.productName}</span></div><span>{t.status}</span></li>
            ))}
          </ul>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Restocks</h3></div>
          <ul className="widget-list">
            {RESTOCKS.slice(0, 3).map((r) => (
              <li key={r.id}><div><strong>{r.productName}</strong><span className="muted">{r.dateReceived}</span></div><span>+{r.quantity}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Top Moving Products</h3></div>
          <ul className="widget-list">
            {TOP_MOVING_PRODUCTS.map((p) => (
              <li key={p.name}><div><strong>{p.name}</strong></div><span>{p.movements} movements</span></li>
            ))}
          </ul>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Inventory Health Summary</h3></div>
          <div className="analytics-grid two-up">
            <div className="analytics-card"><span className="metric-label">Sufficient</span><strong>{INVENTORY_HEALTH.sufficient}</strong></div>
            <div className="analytics-card"><span className="metric-label">Low Stock</span><strong>{INVENTORY_HEALTH.low}</strong></div>
            <div className="analytics-card"><span className="metric-label">Critical</span><strong>{INVENTORY_HEALTH.critical}</strong></div>
            <div className="analytics-card"><span className="metric-label">Out of Stock</span><strong>{INVENTORY_HEALTH.outOfStock}</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InventoryPage({ navigate, showToast }) {
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
        const apiClient = (await import('../../api/apiClient.js')).default;
        const res = await apiClient.get('/products');
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
  }, []);

  const filtered = useMemo(() => {
    let results = [...products];
    const query = search.trim().toLowerCase();
    if (query) results = results.filter((p) => p.product_name.toLowerCase().includes(query) || (p.category_name && p.category_name.toLowerCase().includes(query)));
    if (category !== 'All') results = results.filter((p) => p.category_id === Number(category));
    if (statusFilter !== 'All') results = results.filter((p) => p.status === statusFilter);
    if (sortBy === 'Product Name') results.sort((a, b) => a.product_name.localeCompare(b.product_name));
    else if (sortBy === 'Unit Price') results.sort((a, b) => a.unit_price - b.unit_price);
    return results;
  }, [products, search, category, statusFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <LoadingState message="Loading inventory..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Product List</h3>
          <div className="inline-toolbar">
            <button className="button secondary" type="button" onClick={() => showToast('PDF export initiated.', 'success')}>Export PDF</button>
            <button className="button secondary" type="button" onClick={() => showToast('Excel export initiated.', 'success')}>Export Excel</button>
            <button className="button" type="button" onClick={() => navigate('/warehouse/add-product')}>Add Product</button>
          </div>
        </div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by product name or category" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <div className="accounts-filters">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="All">All Categories</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {['All', 'Active', 'Inactive'].map((s) => <option key={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {['Product Name', 'Unit Price'].map((s) => <option key={s}>Sort: {s}</option>)}
            </select>
          </div>
        </div>
      </section>

      {paginated.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Product ID</th><th>Product Name</th><th>Category</th><th>Unit Price</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paginated.map((product) => (
                  <tr key={product.product_id}>
                    <td>{product.product_id}</td>
                    <td>{product.product_name}</td>
                    <td>{product.category_name || product.category_id}</td>
                    <td>{formatCurrency(product.unit_price)}</td>
                    <td><StatusBadge status={product.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/warehouse/product/${product.product_id}`)}><NavIcon name="view" /></button>
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => showToast('Edit form would open here.', 'success')}><NavIcon name="edit" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </section>
      ) : (
        <EmptyState title="No products found" description="Adjust your search or filters." actionLabel="Clear filters" onAction={() => { setSearch(''); setCategory('All'); setStatusFilter('All'); setPage(1); }} />
      )}
    </div>
  );
}

function ProductDetailPage({ productId, navigate, showToast }) {
  const [productData, setProductData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const apiClient = (await import('../../api/apiClient.js')).default;
        const res = await apiClient.get(`/products/${productId}`);
        if (res.data.success) setProductData(res.data.data);
      } catch (err) {
        console.error('[ProductDetail] load error:', err.message);
      }
      setLoading(false);
    }
    load();
  }, [productId]);

  if (loading) return <LoadingState message="Loading product..." />;

  // Fall back to mock data if API returns nothing (mock product IDs are strings like 'p1')
  const mockProduct = getProductById(productId);
  const product = productData || mockProduct;
  if (!product) return <EmptyState title="Product not found" actionLabel="Back to Inventory" onAction={() => navigate('/warehouse/inventory')} />;

  const product_id = product.product_id || product.id || '—';
  const product_name = product.product_name || product.name || '—';
  const category_id = product.category_id || '—';
  const category_name = product.category_name || product.category || '—';
  const unit_price = product.unit_price != null ? product.unit_price : (product.unitPrice || 0);
  const status = product.status || '—';
  const inventory = product.inventory || [];
  const movements = product.movements || [];

  const totalStock = productData
    ? inventory.reduce((sum, b) => sum + Number(b.quantity || 0), 0)
    : (mockProduct?.stock ?? 0);

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Product ID', value: String(product_id) },
        { label: 'Unit Price', value: formatCurrency(unit_price) },
        { label: 'Status', value: status },
        { label: 'Total Stock (All Branches)', value: `${totalStock} units` },
      ]} />

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{product_name}</h3>
          <p className="muted">Product ID: {product_id}</p>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Product ID</span><span className="info-item-value">{product_id}</span></li>
          <li><span className="info-item-label">Product Name</span><span className="info-item-value">{product_name}</span></li>
          <li><span className="info-item-label">Category ID</span><span className="info-item-value">{category_id}</span></li>
          <li><span className="info-item-label">Category Name</span><span className="info-item-value">{category_name}</span></li>
          <li><span className="info-item-label">Unit Price</span><span className="info-item-value">{formatCurrency(unit_price)}</span></li>
          <li><span className="info-item-label">Status</span><span className="info-item-value"><StatusBadge status={status} /></span></li>
        </ul>
      </section>

      {/* Inventory per branch — from branch_inventory */}
      {inventory.length > 0 && (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Stock by Branch</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Source: branch_inventory table</p>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Branch ID</th>
                  <th>Branch</th>
                  <th>Product ID</th>
                  <th>Available Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((b) => (
                  <tr key={b.branch_inventory_id ?? b.branch_id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{b.branch_inventory_id ?? '—'}</span></td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{b.branch_id}</span></td>
                    <td>{b.branch_name}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{b.product_id ?? '—'}</span></td>
                    <td style={{ fontWeight: 600 }}>{b.available_stock ?? b.quantity ?? '—'}</td>
                    <td>{b.reorder_level ?? '—'}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
                        background: b.stock_status === 'Sufficient' ? 'rgba(16,185,129,0.1)' : b.stock_status === 'Out of Stock' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color:      b.stock_status === 'Sufficient' ? '#059669' : b.stock_status === 'Out of Stock' ? '#dc2626' : '#d97706',
                      }}>
                        {b.stock_status || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{b.last_updated ? new Date(b.last_updated).toLocaleDateString('en-PH') : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{b.created_at ? new Date(b.created_at).toLocaleString() : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{b.updated_at ? new Date(b.updated_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Stock movements — from stock_movements table with movement_ref */}
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Stock Movement History</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Source: stock_movements table — type, quantity, movement_ref, branch, performed_by</p>
        </div>
        {movements.length ? (
          <div className="table-shell">
            <table className="data-table">
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
                {movements.map((m, i) => (
                  <tr key={m.id || m.stock_movements_id || i}>
                    <td>{m.movement_date ? new Date(m.movement_date).toLocaleDateString('en-PH') : (m.date || '—')}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
                        background: m.type === 'Restock' || m.type === 'Transfer In' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color:      m.type === 'Restock' || m.type === 'Transfer In' ? '#059669' : '#dc2626',
                      }}>
                        {m.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: (m.quantity || 0) > 0 ? '#059669' : '#dc2626' }}>
                      {(m.quantity || 0) > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{m.movement_ref || m.reason || '—'}</span></td>
                    <td>{m.branch_name || '—'}</td>
                    <td>{m.performed_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No movement history" description="Stock movements for this product will appear here." />}
      </section>

      <PageToolbar actions={[
        { label: 'Log Stock Count', to: `/warehouse/product/${productId}/stock-count` },
        { label: 'Record Restock',  to: `/warehouse/product/${productId}/restock`,      variant: 'secondary' },
        { label: 'Transfer Stock',  to: `/warehouse/product/${productId}/transfer`,     variant: 'secondary' },
        { label: 'Back to Inventory', to: '/warehouse/inventory', variant: 'ghost' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}


function AddProductPage({ navigate, showToast }) {
  const [form, setForm] = useState({ productName: '', sku: '', category: '', description: '', unitType: '', reorderPoint: '', supplier: '', initialQuantity: '' });
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    const nextErrors = {};
    if (!form.productName.trim()) nextErrors.productName = 'Product name is required.';
    if (!form.category) nextErrors.category = 'Category is required.';
    if (form.sku && EXISTING_SKUS.includes(form.sku.trim())) nextErrors.sku = 'SKU must be unique.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { showToast('Please fix the errors before submitting.', 'error'); return; }
    showToast('Product record created successfully.', 'success');
    navigate('/warehouse/inventory');
  };

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Add New Product</h3></div>
        {[
          { name: 'productName', label: 'Product Name', type: 'text', required: true },
          { name: 'sku', label: 'SKU', type: 'text' },
          { name: 'category', label: 'Category', type: 'select', options: CATEGORIES },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'unitType', label: 'Unit Type', type: 'text' },
          { name: 'reorderPoint', label: 'Reorder Point', type: 'number' },
          { name: 'supplier', label: 'Supplier', type: 'text' },
          { name: 'initialQuantity', label: 'Initial Quantity', type: 'number' },
        ].map((field) => (
          <div key={field.name} className="form-group">
            <label>{field.label}{field.required ? <span className="required">*</span> : null}</label>
            {field.type === 'select' ? (
              <select value={form[field.name]} onChange={(e) => setForm((p) => ({ ...p, [field.name]: e.target.value }))}>
                <option value="">Select category</option>
                {field.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea value={form[field.name]} onChange={(e) => setForm((p) => ({ ...p, [field.name]: e.target.value }))} />
            ) : (
              <input type={field.type} value={form[field.name]} onChange={(e) => setForm((p) => ({ ...p, [field.name]: e.target.value }))} />
            )}
            {errors[field.name] ? <p className="form-error">{errors[field.name]}</p> : null}
          </div>
        ))}
      </section>
      <PageToolbar actions={[
        { label: 'Create Product Record', action: 'submit' },
        { label: 'Cancel', to: '/warehouse/inventory', variant: 'secondary' },
      ]} onAction={(a) => (a.action === 'submit' ? handleSubmit() : navigate(a.to))} />
    </div>
  );
}

function StockCountPage({ productId, navigate, showToast }) {
  const product = getProductById(productId);
  const [physical, setPhysical] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  if (!product) return <EmptyState title="Product not found" actionLabel="Back" onAction={() => navigate('/warehouse/inventory')} />;

  const variance = physical !== '' ? Number(physical) - product.stock : null;
  const hasVariance = variance !== null && variance !== 0;

  const handleSubmit = () => {
    const nextErrors = {};
    if (physical === '') nextErrors.physical = 'Physical count is required.';
    if (hasVariance && !notes.trim()) nextErrors.notes = 'Notes required when variance exists.';
    if (submitted) nextErrors.submit = 'Already submitted.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { showToast('Please fix the errors.', 'error'); return; }
    setSubmitted(true);
    showToast('Stock adjustment record created.', 'success');
    navigate(`/warehouse/product/${product.id}`);
  };

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Stock Count — {product.name}</h3></div>
        <div className="form-group"><label>System Quantity</label><p className="field-preview">{product.stock} units</p></div>
        <div className="form-group">
          <label>Physical Quantity<span className="required">*</span></label>
          <input type="number" min="0" value={physical} onChange={(e) => setPhysical(e.target.value)} />
          {errors.physical ? <p className="form-error">{errors.physical}</p> : null}
        </div>
        {variance !== null ? (
          <div className={`form-group variance-display${hasVariance ? ' variance-alert' : ''}`}>
            <label>Variance</label>
            <p className="field-preview">{variance > 0 ? `+${variance}` : variance} units</p>
          </div>
        ) : null}
        <div className="form-group">
          <label>Discrepancy Notes{hasVariance ? <span className="required">*</span> : null}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain variance if any..." />
          {errors.notes ? <p className="form-error">{errors.notes}</p> : null}
        </div>
        {errors.submit ? <p className="form-error">{errors.submit}</p> : null}
      </section>
      <PageToolbar actions={[
        { label: 'Submit Stock Count', action: 'submit' },
        { label: 'Cancel', to: `/warehouse/product/${product.id}`, variant: 'secondary' },
      ]} onAction={(a) => (a.action === 'submit' ? handleSubmit() : navigate(a.to))} />
    </div>
  );
}

function RestockPage({ productId, navigate, showToast }) {
  const product = getProductById(productId);
  const [form, setForm] = useState({ quantity: '', supplier: product?.supplier ?? '', deliveryRef: '', dateReceived: new Date().toISOString().slice(0, 10) });
  const [errors, setErrors] = useState({});

  if (!product) return <EmptyState title="Product not found" actionLabel="Back" onAction={() => navigate('/warehouse/inventory')} />;

  const handleSubmit = () => {
    const nextErrors = {};
    if (!form.quantity || Number(form.quantity) <= 0) nextErrors.quantity = 'Quantity must be positive.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { showToast('Please fix the errors.', 'error'); return; }
    showToast('Restock transaction created. Inventory updated.', 'success');
    navigate(`/warehouse/product/${product.id}`);
  };

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Record Restock — {product.name}</h3></div>
        <div className="form-group"><label>Product Name</label><p className="field-preview">{product.name}</p></div>
        <div className="form-group">
          <label>Quantity Restocked<span className="required">*</span></label>
          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          {errors.quantity ? <p className="form-error">{errors.quantity}</p> : null}
        </div>
        <div className="form-group"><label>Supplier</label><input type="text" value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} /></div>
        <div className="form-group"><label>Delivery Reference Number</label><input type="text" value={form.deliveryRef} onChange={(e) => setForm((p) => ({ ...p, deliveryRef: e.target.value }))} /></div>
        <div className="form-group"><label>Date Received</label><input type="date" value={form.dateReceived} onChange={(e) => setForm((p) => ({ ...p, dateReceived: e.target.value }))} /></div>
      </section>
      <PageToolbar actions={[
        { label: 'Create Restock Transaction', action: 'submit' },
        { label: 'Cancel', to: `/warehouse/product/${product.id}`, variant: 'secondary' },
      ]} onAction={(a) => (a.action === 'submit' ? handleSubmit() : navigate(a.to))} />
    </div>
  );
}

function TransferPage({ productId, navigate, showToast }) {
  const product = getProductById(productId);
  const [form, setForm] = useState({ destination: '', quantity: '', notes: '' });
  const [errors, setErrors] = useState({});

  if (!product) return <EmptyState title="Product not found" actionLabel="Back" onAction={() => navigate('/warehouse/inventory')} />;

  const handleSubmit = () => {
    const qty = Number(form.quantity);
    const nextErrors = {};
    if (!form.destination) nextErrors.destination = 'Destination branch is required.';
    if (!qty || qty <= 0) nextErrors.quantity = 'Quantity must be positive.';
    if (qty > product.stock) nextErrors.quantity = `Cannot transfer more than available stock (${product.stock} units).`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { showToast('Please fix the errors.', 'error'); return; }
    showToast('Transfer submitted for approval.', 'success');
    navigate('/warehouse/transfers');
  };

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Transfer Stock — {product.name}</h3></div>
        <div className="form-group"><label>Product Name</label><p className="field-preview">{product.name}</p></div>
        <div className="form-group"><label>Source Branch</label><p className="field-preview">{product.branch}</p></div>
        <div className="form-group">
          <label>Destination Branch<span className="required">*</span></label>
          <select value={form.destination} onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}>
            <option value="">Select destination</option>
            {BRANCHES.filter((b) => b !== product.branch).map((b) => <option key={b}>{b}</option>)}
          </select>
          {errors.destination ? <p className="form-error">{errors.destination}</p> : null}
        </div>
        <div className="form-group">
          <label>Quantity<span className="required">*</span></label>
          <input type="number" min="1" max={product.stock} value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          {errors.quantity ? <p className="form-error">{errors.quantity}</p> : null}
        </div>
        <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
      </section>
      <PageToolbar actions={[
        { label: 'Create Transfer Transaction', action: 'submit' },
        { label: 'Cancel', to: `/warehouse/product/${product.id}`, variant: 'secondary' },
      ]} onAction={(a) => (a.action === 'submit' ? handleSubmit() : navigate(a.to))} />
    </div>
  );
}

function MovementsPage({ navigate }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => STOCK_MOVEMENTS.filter((m) => {
    const matchProduct = productFilter === 'All' || m.productName === productFilter;
    const matchBranch = branchFilter === 'All' || m.branch === branchFilter;
    const matchType = typeFilter === 'All' || m.type === typeFilter;
    const matchFrom = !dateFrom || m.date >= dateFrom;
    const matchTo = !dateTo || m.date <= dateTo;
    return matchProduct && matchBranch && matchType && matchFrom && matchTo;
  }), [dateFrom, dateTo, productFilter, branchFilter, typeFilter]);

  const movementTypes = ['All', ...new Set(STOCK_MOVEMENTS.map((m) => m.type))];

  if (loading) return <LoadingState message="Loading stock movements..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Movement History</h3></div>
        <div className="accounts-filters">
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}><option value="All">All Products</option>{PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}><option value="All">All Branches</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>{movementTypes.map((t) => <option key={t}>{t === 'All' ? 'All Types' : t}</option>)}</select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Transaction ID</th><th>Product Name</th><th>Quantity</th><th>Type</th><th>Branch</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{m.productName}</td>
                    <td>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td>{m.type}</td>
                    <td>{m.branch}</td>
                    <td>{m.date}</td>
                    <td><button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/warehouse/movements/${m.id}`)}><NavIcon name="view" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No movements found" description="Adjust your filters." />}
    </div>
  );
}

function MovementDetailPage({ movementId, navigate }) {
  const movement = getMovementById(movementId);
  if (!movement) return <EmptyState title="Movement not found" actionLabel="Back" onAction={() => navigate('/warehouse/movements')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Transaction ID', value: movement.id },
        { label: 'Quantity', value: String(movement.quantity) },
        { label: 'Type', value: movement.type },
      ]} />
      <section className="panel content-panel">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Product</span>
            <strong>{movement.productName}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Branch</span>
            <strong>{movement.branch}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Date</span>
            <strong>{movement.date}</strong>
          </article>
          <article className="transfer-detail-card transfer-detail-card-wide">
            <span>Notes</span>
            <strong>{movement.notes}</strong>
          </article>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Movements', to: '/warehouse/movements', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function TransfersPage({ navigate }) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchInventoryTransfers();
      if (result.success) setTransfers(result.data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return transfers;
    if (statusFilter === 'Pending Transfers') return transfers.filter((t) => t.status.includes('Pending') || t.status === 'Submitted');
    if (statusFilter === 'Approved Transfers') return transfers.filter((t) => t.status === 'Approved');
    if (statusFilter === 'Completed Transfers') return transfers.filter((t) => t.status === 'Completed');
    if (statusFilter === 'Cancelled Transfers') return transfers.filter((t) => t.status === 'Rejected');
    return transfers;
  }, [statusFilter, transfers]);

  if (loading) return <LoadingState message="Loading transfers..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Inventory Transfer Requests</h3></div>
        <div className="segmented-control">
          {['All', 'Pending Transfers', 'Approved Transfers', 'Completed Transfers', 'Cancelled Transfers'].map((s) => (
            <button key={s} className={statusFilter === s ? 'segment active' : 'segment'} type="button" onClick={() => setStatusFilter(s)}>
              {s.replace(' Transfers', '')}
            </button>
          ))}
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transfer Ref</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Submitted By</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.transfer_id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{t.transfer_ref}</span></td>
                    <td>{t.product_name}<br /><span className="muted" style={{ fontSize: '0.75rem' }}>{t.sku}</span></td>
                    <td>{t.quantity}</td>
                    <td>{t.source_branch}</td>
                    <td>{t.destination_branch}</td>
                    <td>{t.submitted_by_name || '—'}</td>
                    <td className="muted" style={{ fontSize: '0.82rem' }}>
                      {t.submitted_date ? new Date(t.submitted_date).toLocaleDateString('en-PH') : '—'}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
                        background: t.status === 'Completed' ? 'rgba(16,185,129,0.1)' : t.status === 'Rejected' ? 'rgba(239,68,68,0.1)' : t.status === 'Approved' ? 'rgba(37,99,235,0.1)' : 'rgba(245,158,11,0.1)',
                        color: t.status === 'Completed' ? '#059669' : t.status === 'Rejected' ? '#dc2626' : t.status === 'Approved' ? '#2563eb' : '#d97706',
                      }}>
                        {t.status}
                      </span>
                    </td>
                    <td>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/warehouse/transfers/${t.transfer_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No transfers found" description="Adjust your filters." />}
    </div>
  );
}

function TransferDetailPage({ transferId, navigate, showToast }) {
  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchInventoryTransferById(transferId);
      if (result.success) setTransfer(result.data);
      setLoading(false);
    }
    load();
  }, [transferId]);

  if (loading) return <LoadingState message="Loading transfer..." />;
  if (!transfer) return <EmptyState title="Transfer not found" actionLabel="Back" onAction={() => navigate('/warehouse/transfers')} />;

  const workflowSteps = ['Submitted', 'Pending Approval', 'Approved', 'Completed'];

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Transfer Ref', value: transfer.transfer_ref },
        { label: 'Product',      value: transfer.product_name },
        { label: 'Quantity',     value: String(transfer.quantity) },
        { label: 'Status',       value: transfer.status },
      ]} />
      <section className="panel content-panel">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Product</span>
            <strong>{transfer.product_name} <span className="muted" style={{ fontSize: '0.78rem' }}>({transfer.sku})</span></strong>
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
            <strong>{transfer.submitted_date ? new Date(transfer.submitted_date).toLocaleDateString('en-PH') : '—'}</strong>
          </article>
          {transfer.approved_by_name ? (
            <article className="transfer-detail-card">
              <span>Approved By</span>
              <strong>{transfer.approved_by_name}</strong>
            </article>
          ) : null}
          {transfer.completed_date ? (
            <article className="transfer-detail-card">
              <span>Completed Date</span>
              <strong>{new Date(transfer.completed_date).toLocaleDateString('en-PH')}</strong>
            </article>
          ) : null}
          {transfer.approval_info ? (
            <article className="transfer-detail-card transfer-detail-card-wide">
              <span>Approval Info</span>
              <strong>{transfer.approval_info}</strong>
            </article>
          ) : null}
        </div>
        {transfer.status !== 'Rejected' ? (
          <div className="approval-workflow">
            <h4 className="subsection-title">Approval Workflow</h4>
            <div className="workflow-steps">
              {workflowSteps.map((step) => (
                <span key={step} className={`workflow-step${transfer.status && transfer.status.includes(step.split(' ')[0]) ? ' active' : ''}`}>{step}</span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {transfer.status === 'Pending Approval' ? (
        <PageToolbar actions={[
          { label: 'Approve Transfer', action: 'approve' },
          { label: 'Reject Transfer',  action: 'reject',  variant: 'secondary' },
          { label: 'Back',             to: '/warehouse/transfers', variant: 'ghost' },
        ]} onAction={(a) => {
          if (a.action === 'approve') showToast('Transfer approved.', 'success');
          else if (a.action === 'reject') showToast('Transfer rejected.', 'error');
          else navigate(a.to);
        }} />
      ) : (
        <PageToolbar actions={[{ label: 'Back to Transfers', to: '/warehouse/transfers', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
      )}
    </div>
  );
}

function RestockHistoryPage({ navigate }) {
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

  const suppliers = ['All', ...new Set(restocks.map((r) => r.supplier_name))];
  const productNames = ['All', ...new Set(restocks.map((r) => r.product_name))];

  const filtered = useMemo(() => restocks.filter((r) => {
    const matchSupplier = supplier === 'All' || r.supplier_name === supplier;
    const matchProduct  = productFilter === 'All' || r.product_name === productFilter;
    const matchFrom     = !dateFrom || r.received_date >= dateFrom;
    const matchTo       = !dateTo   || r.received_date <= dateTo;
    return matchSupplier && matchProduct && matchFrom && matchTo;
  }), [supplier, productFilter, dateFrom, dateTo, restocks]);

  if (loading) return <LoadingState message="Loading restock history..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Restock Records</h3></div>
        <div className="accounts-filters">
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            {suppliers.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Suppliers' : s}</option>)}
          </select>
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            {productNames.map((p) => <option key={p} value={p}>{p === 'All' ? 'All Products' : p}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   aria-label="To date" />
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
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
                {filtered.map((r) => (
                  <tr key={r.restock_id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.delivery_ref}</span></td>
                    <td>{r.product_name}</td>
                    <td>{r.supplier_name}</td>
                    <td>{r.branch_name}</td>
                    <td style={{ color: '#059669', fontWeight: 600 }}>+{r.quantity}</td>
                    <td>{r.received_date ? new Date(r.received_date).toLocaleDateString('en-PH') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No restock records found" description="Adjust your filters." />}
    </div>
  );
}

function RestockDetailPage({ restockId, navigate }) {
  return (
    <div className="page">
      <EmptyState title="Restock Detail" description="Select a record from the Restock History page." actionLabel="Back" onAction={() => navigate('/warehouse/restock-history')} />
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter((n) => !n.read);
    if (filter === 'Read') return notifications.filter((n) => n.read);
    if (filter === 'Low Stock') return notifications.filter((n) => n.type === 'low');
    if (filter === 'Critical') return notifications.filter((n) => n.type === 'critical');
    if (filter === 'Transfers') return notifications.filter((n) => n.type === 'transfer');
    if (filter === 'Restocks') return notifications.filter((n) => n.type === 'restock');
    if (filter === 'Forecast') return notifications.filter((n) => n.type === 'forecast');
    return notifications;
  }, [notifications, filter]);

  return (
    <div className="page">
      <PageToolbar actions={[{ label: 'Mark All as Read', action: 'markAll' }]} onAction={() => { setNotifications((items) => items.map((n) => ({ ...n, read: true }))); showToast('All marked as read.', 'success'); }} />
      <section className="panel content-panel">
        <div className="segmented-control">
          {['All', 'Unread', 'Read', 'Low Stock', 'Critical', 'Transfers', 'Restocks', 'Forecast'].map((f) => (
            <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </section>
      {filtered.length ? (
        <div className="notification-list">
          {filtered.map((item) => (
            <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div><h4>{item.title}</h4><p className="muted">{item.message}</p><span className="notification-time">{item.time}</span></div>
              <div className="notification-actions">
                {!item.read ? <button className="button ghost" type="button" onClick={() => { setNotifications((items) => items.map((n) => (n.id === item.id ? { ...n, read: true } : n))); showToast('Marked as read.', 'success'); }}>Mark as Read</button> : null}
                <button className="button secondary" type="button" onClick={() => navigate(item.relatedTo)}>Open Related Record</button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No notifications" description="You're all caught up." />}
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{WAREHOUSE_STAFF_PROFILE.avatarInitials}</div>
          <div><h3>{WAREHOUSE_STAFF_PROFILE.name}</h3><p className="muted">{WAREHOUSE_STAFF_PROFILE.employeeId}</p></div>
        </div>
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Assigned Warehouse</span>
            <strong>{WAREHOUSE_STAFF_PROFILE.warehouse}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Branch</span>
            <strong>{WAREHOUSE_STAFF_PROFILE.branch}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Email</span>
            <strong>{WAREHOUSE_STAFF_PROFILE.email}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Phone</span>
            <strong>{WAREHOUSE_STAFF_PROFILE.phone}</strong>
          </article>
        </div>
      </section>
      <PageToolbar actions={[
        { label: 'Update Profile', action: 'update' },
        { label: 'Change Password', action: 'password', variant: 'secondary' },
        { label: 'Audit Log', to: '/warehouse/audit-log', variant: 'ghost' },
        { label: 'Reports', to: '/warehouse/reports', variant: 'ghost' },
        { label: 'Logout', action: 'logout', variant: 'ghost' },
      ]} onAction={(a) => {
        if (a.to) navigate(a.to);
        else if (a.action === 'logout') { requestLogout(); }
        else showToast(`${a.label} form would open here.`, 'success');
      }} />
    </div>
  );
}

function AuditLogPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3><p className="muted">Product creation, updates, stock adjustments, restocks, and transfers.</p></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>{AUDIT_LOGS.map((log) => <tr key={log.id}><td>{log.action}</td><td>{log.detail}</td><td>{log.timestamp}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Profile', to: '/warehouse/profile', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function ReportsPage({ navigate, showToast }) {
  const reports = ['Inventory Report', 'Low Stock Report', 'Transfer Report', 'Restock Report', 'Stock Adjustment Report'];
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Generate Reports</h3></div>
        <div className="quick-link-grid">
          {reports.map((report) => (
            <button key={report} className="quick-link-card report-card" type="button" onClick={() => showToast(`${report} generated.`, 'success')}>
              <span className="quick-link-icon"><NavIcon name="reports" /></span>
              <span className="quick-link-copy"><strong>{report}</strong><span className="muted">Export PDF or Excel</span></span>
            </button>
          ))}
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Profile', to: '/warehouse/profile', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function SettingsPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Settings</h3></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Enable barcode scanning</label></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Low stock alert notifications</label></div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Dashboard', to: '/warehouse/dashboard', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function SuppliersPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [form, setForm] = useState({ supplier_name: '', contact: '', email: '', address: '', status: 'Active' });

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
        limit: String(limit),
      });
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await apiClient.get(`/suppliers?${params.toString()}`);
      if (res.data.success) {
        setSuppliers(res.data.data);
        setTotal(res.data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('[Suppliers] load error:', err.message);
      showToast('Failed to load suppliers.', 'error');
    }
    setLoading(false);
  }

  const handleAdd = () => {
    setForm({ supplier_name: '', contact: '', email: '', address: '', status: 'Active' });
    setErrors({});
    setShowAddModal(true);
  };

  const handleEdit = (supplier) => {
    setForm({
      supplier_name: supplier.supplier_name,
      contact: supplier.contact || '',
      email: supplier.email || '',
      address: supplier.address || '',
      status: supplier.status,
    });
    setEditingSupplier(supplier);
    setErrors({});
    setShowAddModal(true);
  };

  const handleDelete = async (supplierId) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      const apiClient = (await import('../../api/apiClient.js')).default;
      await apiClient.delete(`/suppliers/${supplierId}`);
      showToast('Supplier deleted successfully.', 'success');
      loadSuppliers();
    } catch (err) {
      console.error('[Suppliers] delete error:', err.message);
      showToast('Failed to delete supplier.', 'error');
    }
  };

  const handleSubmit = async (e) => {
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

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Suppliers</h3>
          <div className="inline-toolbar">
            <button className="button" type="button" onClick={handleAdd}>Add Supplier</button>
          </div>
        </div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by name, contact, or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <div className="accounts-filters">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {['All', 'Active', 'Inactive'].map((s) => <option key={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
          </div>
        </div>
      </section>

      {suppliers.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Supplier ID</th><th>Supplier Name</th><th>Contact</th><th>Email</th><th>Address</th><th>Status</th><th>Created At</th><th>Updated At</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.supplier_id}>
                    <td>{supplier.supplier_id}</td>
                    <td>{supplier.supplier_name}</td>
                    <td>{supplier.contact || '—'}</td>
                    <td>{supplier.email || '—'}</td>
                    <td>{supplier.address || '—'}</td>
                    <td><StatusBadge status={supplier.status} /></td>
                    <td>{supplier.created_at ? new Date(supplier.created_at).toLocaleDateString('en-PH') : '—'}</td>
                    <td>{supplier.updated_at ? new Date(supplier.updated_at).toLocaleDateString('en-PH') : '—'}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => handleEdit(supplier)}><NavIcon name="edit" /></button>
                      <button className="icon-action-button" type="button" title="Delete" onClick={() => handleDelete(supplier.supplier_id)}><NavIcon name="delete" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </section>
      ) : (
        <EmptyState title="No suppliers found" description="Adjust your search or filters." actionLabel="Add Supplier" onAction={handleAdd} />
      )}

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setEditingSupplier(null); } }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
              <button className="icon-action-button" onClick={() => { setShowAddModal(false); setEditingSupplier(null); }}><NavIcon name="close" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Supplier Name *</label>
                <input type="text" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
                {errors.supplier_name && <p className="form-error">{errors.supplier_name}</p>}
              </div>
              <div className="form-group">
                <label>Contact</label>
                <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                {errors.email && <p className="form-error">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => { setShowAddModal(false); setEditingSupplier(null); }}>Cancel</button>
                <button type="submit" className="button">{editingSupplier ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BranchInventoryPage({ navigate, showToast }) {
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

  const branches = useMemo(() => ['All', ...new Set(records.map((r) => r.branch_name).filter(Boolean))], [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchSearch =
        !q ||
        (r.product_name || '').toLowerCase().includes(q) ||
        (r.sku || '').toLowerCase().includes(q) ||
        String(r.branch_inventory_id).includes(q);
      const matchStatus = statusFilter === 'All' || r.stock_status === statusFilter;
      const matchBranch = branchFilter === 'All' || r.branch_name === branchFilter;
      return matchSearch && matchStatus && matchBranch;
    });
  }, [records, search, statusFilter, branchFilter]);

  if (loading) return <LoadingState message="Loading branch inventory..." />;

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
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Branch Inventory</h3>
          <p className="muted">{records.length} record{records.length !== 1 ? 's' : ''} in database</p>
        </div>
        <div className="accounts-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by product name, SKU, or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="accounts-filters">
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              {branches.map((b) => <option key={b} value={b}>{b === 'All' ? 'All Branches' : b}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {['All', 'Sufficient', 'Low Stock', 'Out of Stock'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Branch ID</th>
                  <th>Branch</th>
                  <th>Product ID</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Available Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.branch_inventory_id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.branch_inventory_id}</span></td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.branch_id}</span></td>
                    <td>{r.branch_name}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.product_id}</span></td>
                    <td><strong>{r.product_name}</strong></td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.sku || '—'}</span></td>
                    <td>{r.category_name || '—'}</td>
                    <td style={{ fontWeight: 600, color: r.available_stock <= 0 ? '#dc2626' : r.available_stock <= r.reorder_level ? '#d97706' : '#059669' }}>
                      {r.available_stock}
                    </td>
                    <td>{r.reorder_level}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
                        background: r.stock_status === 'Sufficient' ? 'rgba(16,185,129,0.1)' : r.stock_status === 'Out of Stock' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color:      r.stock_status === 'Sufficient' ? '#059669'               : r.stock_status === 'Out of Stock' ? '#dc2626'              : '#d97706',
                      }}>
                        {r.stock_status || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{r.last_updated ? new Date(r.last_updated).toLocaleDateString('en-PH') : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState title="No records found" description="Adjust your search or filters." />
      )}
    </div>
  );
}

export function WarehousePageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = {
    productId: page.params?.productId,
    movementId: page.params?.movementId,
    transferId: page.params?.transferId,
    restockId: page.params?.restockId,
    creditId: page.params?.creditId,
    navigate,
    showToast,
  };
  switch (page.pageType) {
    case 'dashboard':         return <DashboardPage {...props} />;
    case 'settings':          return <SettingsPage {...props} />;
    case 'inventory':         return <InventoryPage {...props} />;
    case 'branchInventory':   return <BranchInventoryPage {...props} />;
    case 'addProduct':        return <AddProductPage {...props} />;
    case 'productDetail':     return <ProductDetailPage {...props} />;
    case 'stockCount':        return <StockCountPage {...props} />;
    case 'restock':           return <RestockPage {...props} />;
    case 'transfer':          return <TransferPage {...props} />;
    case 'movements':         return <MovementsPage {...props} />;
    case 'movementDetail':    return <MovementDetailPage {...props} />;
    case 'transfers':         return <TransfersPage {...props} />;
    case 'transferDetail':    return <TransferDetailPage {...props} />;
    case 'restockHistory':    return <RestockHistoryPage {...props} />;
    case 'restockDetail':     return <RestockDetailPage {...props} />;
    case 'creditHistory':     return <CreditHistoryListPage {...props} />;
    case 'creditDetail':      return <CreditHistoryDetailPage {...props} />;
    case 'notifications':     return <NotificationsPage {...props} />;
    case 'profile':           return <ProfilePage {...props} />;
    case 'auditLog':          return <AuditLogPage {...props} />;
    case 'reports':           return <ReportsPage {...props} />;
    case 'suppliers':         return <SuppliersPage {...props} />;
    default:                  return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}