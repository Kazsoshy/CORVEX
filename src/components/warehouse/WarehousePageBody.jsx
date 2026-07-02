import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AUDIT_LOGS,
  BRANCHES,
  CATEGORIES,
  CUSTOMER_CREDIT_RECORDS,
  DASHBOARD_SUMMARY,
  EXISTING_SKUS,
  INVENTORY_HEALTH,
  NOTIFICATIONS,
  PRODUCTS,
  RESTOCK_RECORDS,
  STOCK_MOVEMENTS,
  TOP_MOVING_PRODUCTS,
  TRANSFERS,
  WAREHOUSE_STAFF_PROFILE,
  getCreditRecordById,
  getMovementById,
  getProductById,
  getRestockById,
  getTransferById,
} from '../../data/warehouseMockData';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';

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
                <StockStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Transfers</h3></div>
          <ul className="widget-list">
            {TRANSFERS.slice(0, 3).map((t) => (
              <li key={t.id}><div><strong>{t.id}</strong><span className="muted">{t.productName}</span></div><span>{t.status}</span></li>
            ))}
          </ul>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Restocks</h3></div>
          <ul className="widget-list">
            {RESTOCK_RECORDS.slice(0, 3).map((r) => (
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

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    let results = [...PRODUCTS];
    const query = search.trim().toLowerCase();
    if (query) results = results.filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query) || p.category.toLowerCase().includes(query));
    if (branch !== 'All') results = results.filter((p) => p.branch === branch);
    if (category !== 'All') results = results.filter((p) => p.category === category);
    if (statusFilter !== 'All') results = results.filter((p) => p.status === statusFilter);
    if (sortBy === 'Stock Level') results.sort((a, b) => a.stock - b.stock);
    else results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }, [search, branch, category, statusFilter, sortBy]);

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
          <input className="search-input" type="search" placeholder="Search by product name, SKU, or category" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <div className="accounts-filters">
            <select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }}><option value="All">All Branches</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="All">All Categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>{['All', 'Sufficient', 'Low Stock', 'Critical Stock', 'Out of Stock'].map((s) => <option key={s}>{s === 'All' ? 'All Statuses' : s}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{['Product Name', 'Stock Level'].map((s) => <option key={s}>Sort: {s}</option>)}</select>
          </div>
        </div>
      </section>

      {paginated.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Product Name</th><th>SKU</th><th>Category</th><th>Current Stock</th><th>Branch</th><th>Last Updated</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paginated.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{product.category}</td>
                    <td>{product.stock}</td>
                    <td>{product.branch}</td>
                    <td>{product.lastUpdated}</td>
                    <td><StockStatusBadge status={product.status} /></td>
                    <td className="table-actions">
                      <button className="link-button" type="button" onClick={() => navigate(`/warehouse/product/${product.id}`)}>View</button>
                      <button className="link-button" type="button" onClick={() => showToast('Edit form would open here.', 'success')}>Edit</button>
                      <button className="link-button" type="button" onClick={() => navigate(`/warehouse/product/${product.id}/stock-count`)}>Count</button>
                      <button className="link-button" type="button" onClick={() => navigate(`/warehouse/product/${product.id}/restock`)}>Restock</button>
                      <button className="link-button" type="button" onClick={() => navigate(`/warehouse/product/${product.id}/transfer`)}>Transfer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </section>
      ) : (
        <EmptyState title="No products found" description="Adjust your search or filters." actionLabel="Clear filters" onAction={() => { setSearch(''); setBranch('All'); setCategory('All'); setStatusFilter('All'); setPage(1); }} />
      )}
    </div>
  );
}

function ProductDetailPage({ productId, navigate, showToast }) {
  const product = getProductById(productId);
  if (!product) return <EmptyState title="Product not found" actionLabel="Back to Inventory" onAction={() => navigate('/warehouse/inventory')} />;

  const healthClass = { Sufficient: 'health-good', 'Low Stock': 'health-warn', 'Critical Stock': 'health-critical', 'Out of Stock': 'health-critical' }[product.status];

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Current Stock', value: `${product.stock} units` },
        { label: 'Reorder Point', value: `${product.reorderPoint} units` },
        { label: 'Predicted Stockout', value: product.forecast.stockoutDate },
        { label: 'Recommended Reorder', value: `${product.forecast.recommendedReorder} units` },
      ]} />

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{product.name}</h3>
          <StockStatusBadge status={product.status} />
        </div>
        <div className="account-detail-grid two-up">
          <div className="transfer-detail-grid">
            <article className="transfer-detail-card">
              <span>SKU</span>
              <strong>{product.sku}</strong>
            </article>
            <article className="transfer-detail-card">
              <span>Category</span>
              <strong>{product.category}</strong>
            </article>
            <article className="transfer-detail-card transfer-detail-card-wide">
              <span>Description</span>
              <strong>{product.description}</strong>
            </article>
            <article className="transfer-detail-card">
              <span>Branch</span>
              <strong>{product.branch}</strong>
            </article>
            <article className="transfer-detail-card">
              <span>Supplier</span>
              <strong>{product.supplier}</strong>
            </article>
            <article className="transfer-detail-card">
              <span>Last Updated</span>
              <strong>{product.lastUpdated}</strong>
            </article>
            <article className="transfer-detail-card transfer-detail-card-wide">
              <span>Barcode</span>
              <strong>{product.barcode}</strong>
            </article>
          </div>
          <div>
            <div className={`stock-health-indicator ${healthClass}`}>
              <strong>Stock Health: {product.status}</strong>
            </div>
            <div className="barcode-panel">
              <p className="muted">Barcode / QR Support</p>
              <div className="barcode-placeholder">{product.barcode}</div>
              <div className="inline-toolbar">
                <button className="button secondary" type="button" onClick={() => showToast('Barcode generated.', 'success')}>Generate Barcode</button>
                <button className="button ghost" type="button" onClick={() => showToast('Scanner would open here.', 'success')}>Scan Barcode</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Inventory Forecast</h3></div>
          <div className="analytics-grid two-up">
            <div className="analytics-card"><span className="metric-label">7-Day Forecast</span><strong>{product.forecast.days7} units</strong></div>
            <div className="analytics-card"><span className="metric-label">30-Day Forecast</span><strong>{product.forecast.days30} units</strong></div>
          </div>
          <div className="placeholder-map chart-placeholder">30-day inventory trend graph placeholder</div>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Stock Movement History</h3></div>
          {product.movementHistory.length ? (
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Reason</th></tr></thead>
                <tbody>
                  {product.movementHistory.map((m) => (
                    <tr key={m.date + m.type}><td>{m.date}</td><td>{m.type}</td><td>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td><td>{m.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No movement history" description="Stock movements for this product will appear here." />}
        </section>
      </div>

      <PageToolbar actions={[
        { label: 'Log Stock Count', to: `/warehouse/product/${product.id}/stock-count` },
        { label: 'Record Restock', to: `/warehouse/product/${product.id}/restock`, variant: 'secondary' },
        { label: 'Transfer Stock', to: `/warehouse/product/${product.id}/transfer`, variant: 'secondary' },
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
                    <td><button className="link-button" type="button" onClick={() => navigate(`/warehouse/movements/${m.id}`)}>View</button></td>
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
  const [branchFilter, setBranchFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => TRANSFERS.filter((t) => {
    const matchStatus = statusFilter === 'All' || t.status === statusFilter || (statusFilter === 'Pending Transfers' && t.status.includes('Pending')) || (statusFilter === 'Approved Transfers' && t.status === 'Approved') || (statusFilter === 'Completed Transfers' && t.status === 'Completed') || (statusFilter === 'Cancelled Transfers' && t.status === 'Rejected');
    const matchBranch = branchFilter === 'All' || t.sourceBranch === branchFilter || t.destinationBranch === branchFilter;
    return matchStatus && matchBranch;
  }), [statusFilter, branchFilter]);

  if (loading) return <LoadingState message="Loading transfers..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Transfer Requests</h3></div>
        <div className="segmented-control">
          {['All', 'Pending Transfers', 'Approved Transfers', 'Completed Transfers', 'Cancelled Transfers'].map((s) => (
            <button key={s} className={statusFilter === s ? 'segment active' : 'segment'} type="button" onClick={() => setStatusFilter(s)}>{s.replace(' Transfers', '')}</button>
          ))}
        </div>
        <div className="accounts-filters" style={{ marginTop: 12 }}>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}><option value="All">All Branches</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Transfer ID</th><th>Product</th><th>Quantity</th><th>From</th><th>To</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.productName}</td>
                    <td>{t.quantity}</td>
                    <td>{t.sourceBranch}</td>
                    <td>{t.destinationBranch}</td>
                    <td><span className={`transfer-status status-${t.status.toLowerCase().replace(/\s+/g, '-')}`}>{t.status}</span></td>
                    <td><button className="link-button" type="button" onClick={() => navigate(`/warehouse/transfers/${t.id}`)}>View</button></td>
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
  const transfer = getTransferById(transferId);
  if (!transfer) return <EmptyState title="Transfer not found" actionLabel="Back" onAction={() => navigate('/warehouse/transfers')} />;

  const workflowSteps = ['Submitted', 'Pending Approval', 'Approved', 'Completed'];
  const isRejected = transfer.status === 'Rejected';

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Transfer ID', value: transfer.id },
        { label: 'Quantity', value: String(transfer.quantity) },
        { label: 'Status', value: transfer.status },
      ]} />
      <section className="panel content-panel">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Product</span>
            <strong>{transfer.productName}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Source Branch</span>
            <strong>{transfer.sourceBranch}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Destination Branch</span>
            <strong>{transfer.destinationBranch}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Submitted By</span>
            <strong>{transfer.submittedBy}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Submitted Date</span>
            <strong>{transfer.submittedDate}</strong>
          </article>
          {transfer.approvalInfo ? (
            <article className="transfer-detail-card transfer-detail-card-wide">
              <span>Approval</span>
              <strong>{transfer.approvalInfo}</strong>
            </article>
          ) : null}
          <article className="transfer-detail-card transfer-detail-card-wide transfer-detail-notes">
            <span>Notes</span>
            <strong>{transfer.notes}</strong>
          </article>
        </div>
        {!isRejected ? (
          <div className="approval-workflow">
            <h4 className="subsection-title">Approval Workflow</h4>
            <div className="workflow-steps">
              {workflowSteps.map((step) => (
                <span key={step} className={`workflow-step${transfer.status.includes(step.split(' ')[0]) || (step === 'Completed' && transfer.status === 'Completed') ? ' active' : ''}`}>{step}</span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {transfer.status === 'Pending Approval' ? (
        <PageToolbar actions={[
          { label: 'Approve Transfer', action: 'approve' },
          { label: 'Reject Transfer', action: 'reject', variant: 'secondary' },
          { label: 'Back', to: '/warehouse/transfers', variant: 'ghost' },
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const suppliers = ['All', ...new Set(RESTOCK_RECORDS.map((r) => r.supplier))];
  const filtered = useMemo(() => RESTOCK_RECORDS.filter((r) => {
    const matchSupplier = supplier === 'All' || r.supplier === supplier;
    const matchProduct = productFilter === 'All' || r.productName === productFilter;
    const matchFrom = !dateFrom || r.dateReceived >= dateFrom;
    const matchTo = !dateTo || r.dateReceived <= dateTo;
    return matchSupplier && matchProduct && matchFrom && matchTo;
  }), [supplier, productFilter, dateFrom, dateTo]);

  if (loading) return <LoadingState message="Loading restock history..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Restock Records</h3></div>
        <div className="accounts-filters">
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>{suppliers.map((s) => <option key={s}>{s === 'All' ? 'All Suppliers' : s}</option>)}</select>
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}><option value="All">All Products</option>{PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Record ID</th><th>Product</th><th>Supplier</th><th>Quantity</th><th>Date Received</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.productName}</td>
                    <td>{r.supplier}</td>
                    <td>+{r.quantity}</td>
                    <td>{r.dateReceived}</td>
                    <td><button className="link-button" type="button" onClick={() => navigate(`/warehouse/restock-history/${r.id}`)}>View</button></td>
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
  const restock = getRestockById(restockId);
  if (!restock) return <EmptyState title="Restock record not found" actionLabel="Back" onAction={() => navigate('/warehouse/restock-history')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Record ID', value: restock.id },
        { label: 'Quantity', value: `+${restock.quantity}` },
        { label: 'Date Received', value: restock.dateReceived },
      ]} />
      <section className="panel content-panel">
        <div className="transfer-detail-grid">
          <article className="transfer-detail-card">
            <span>Product</span>
            <strong>{restock.productName}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Supplier</span>
            <strong>{restock.supplier}</strong>
          </article>
          <article className="transfer-detail-card">
            <span>Delivery Reference</span>
            <strong>{restock.deliveryRef}</strong>
          </article>
          <article className="transfer-detail-card transfer-detail-card-wide">
            <span>Branch</span>
            <strong>{restock.branch}</strong>
          </article>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Restock History', to: '/warehouse/restock-history', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
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
        else if (a.action === 'logout') { showToast('Logged out.', 'success'); navigate('/login'); }
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

// ── Customer Credit History ───────────────────────────────────────────────────
function CreditHistoryListPage({ navigate }) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return CUSTOMER_CREDIT_RECORDS.filter((r) => {
      const matchSearch = !q || r.clientName.toLowerCase().includes(q) || r.accountNumber.toLowerCase().includes(q);
      const matchBranch = branchFilter === 'All' || r.branch === branchFilter;
      const matchRisk   = riskFilter  === 'All' || r.riskLevel === riskFilter;
      return matchSearch && matchBranch && matchRisk;
    });
  }, [search, branchFilter, riskFilter]);

  const riskStyle = { Low: { color: '#059669', bg: 'rgba(5,150,105,0.1)' }, Medium: { color: '#d97706', bg: 'rgba(217,119,6,0.1)' }, High: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)' }, Critical: { color: '#7f1d1d', bg: 'rgba(127,29,29,0.12)' } };

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Customer Credit History</h3><p className="muted">Monitor credit standing, delinquency flags, and payment behaviour for inventory release decisions.</p></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by client name or account number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="All">All Branches</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              {['All', 'Low', 'Medium', 'High', 'Critical'].map((r) => <option key={r} value={r}>{r === 'All' ? 'All Risk Levels' : r}</option>)}
            </select>
          </div>
        </div>
      </section>

      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Account</th><th>Client</th><th>Branch</th><th>Outstanding</th><th>Credit Limit</th><th>Utilization</th><th>Days Overdue</th><th>Risk</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const rs = riskStyle[r.riskLevel] ?? {};
                  return (
                    <tr key={r.id}>
                      <td>{r.accountNumber}</td>
                      <td><strong>{r.clientName}</strong></td>
                      <td>{r.branch.replace(' Branch', '')}</td>
                      <td style={{ fontWeight: 600, color: r.outstandingBalance > 0 ? '#dc2626' : '#059669' }}>
                        {r.outstandingBalance > 0 ? `₱${r.outstandingBalance.toLocaleString('en-PH')}` : 'Clear'}
                      </td>
                      <td>₱{r.creditLimit.toLocaleString('en-PH')}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 50, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', display: 'inline-block' }}>
                            <span style={{ display: 'block', height: '100%', width: `${r.creditUtilization}%`, background: r.creditUtilization > 70 ? '#dc2626' : '#2563eb', borderRadius: 999 }} />
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.creditUtilization}%</span>
                        </span>
                      </td>
                      <td style={{ color: r.daysOverdue > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>{r.daysOverdue > 0 ? `${r.daysOverdue}d` : '—'}</td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', background: rs.bg, color: rs.color }}>
                          {r.riskLevel}
                        </span>
                      </td>
                      <td className="table-actions">
                        <button className="link-button" type="button" onClick={() => navigate(`/warehouse/credit-history/${r.id}`)}>View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No records found" description="Adjust your search or filters." />}
    </div>
  );
}

function CreditHistoryDetailPage({ creditId, navigate }) {
  const record = getCreditRecordById(creditId);
  if (!record) return <EmptyState title="Record not found" actionLabel="Back" onAction={() => navigate('/warehouse/credit-history')} />;

  const riskColors = { Low: '#059669', Medium: '#d97706', High: '#dc2626', Critical: '#7f1d1d' };
  const color = riskColors[record.riskLevel] ?? '#64748b';

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow" style={{ color }}>{record.riskLevel} Risk · {record.status}</p>
          <h2>{record.clientName}</h2>
          <p className="muted">{record.accountNumber} · {record.branch}</p>
        </div>
      </section>

      <section className="stats-grid">
        {[
          { label: 'Credit Limit',       value: `₱${record.creditLimit.toLocaleString('en-PH')}` },
          { label: 'Outstanding Balance', value: `₱${record.outstandingBalance.toLocaleString('en-PH')}` },
          { label: 'Credit Utilization',  value: `${record.creditUtilization}%` },
          { label: 'Days Overdue',        value: record.daysOverdue > 0 ? `${record.daysOverdue} days` : 'None' },
          { label: 'Last Payment',        value: `₱${record.lastPaymentAmount.toLocaleString('en-PH')}` },
          { label: 'Last Payment Date',   value: record.lastPaymentDate },
        ].map((s, i) => (
          <article key={s.label} className="stat-card" style={{ '--stat-index': i }}>
            <div className="stat-card-top"><span className="stat-index">{String(i + 1).padStart(2, '0')}</span><span className="stat-dot" /></div>
            <span className="stat-label">{s.label}</span>
            <strong className="stat-value" style={{ fontSize: '1.1rem' }}>{s.value}</strong>
          </article>
        ))}
      </section>

      {record.delinquencyFlags.length > 0 && (
        <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <div className="panel-section-header"><h3 style={{ color: '#dc2626' }}>⚠ Delinquency Flags</h3></div>
          <ul className="flag-list">
            {record.delinquencyFlags.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </section>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Payment History</h3></div>
        {record.paymentHistory.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt #</th></tr></thead>
              <tbody>
                {record.paymentHistory.map((p) => (
                  <tr key={p.receipt}>
                    <td>{p.date}</td>
                    <td>₱{p.amount.toLocaleString('en-PH')}</td>
                    <td>{p.method}</td>
                    <td style={{ color: p.status === 'Late' ? '#dc2626' : '#059669', fontWeight: 600 }}>{p.status}</td>
                    <td>{p.receipt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No payment history" description="No payments on record for this account." />}
      </section>

      <PageToolbar actions={[{ label: 'Back to Credit History', to: '/warehouse/credit-history', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}export function WarehousePageBody({ page, navigate, showToast }) {
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
    case 'dashboard':       return <DashboardPage {...props} />;
    case 'settings':        return <SettingsPage {...props} />;
    case 'inventory':       return <InventoryPage {...props} />;
    case 'addProduct':      return <AddProductPage {...props} />;
    case 'productDetail':   return <ProductDetailPage {...props} />;
    case 'stockCount':      return <StockCountPage {...props} />;
    case 'restock':         return <RestockPage {...props} />;
    case 'transfer':        return <TransferPage {...props} />;
    case 'movements':       return <MovementsPage {...props} />;
    case 'movementDetail':  return <MovementDetailPage {...props} />;
    case 'transfers':       return <TransfersPage {...props} />;
    case 'transferDetail':  return <TransferDetailPage {...props} />;
    case 'restockHistory':  return <RestockHistoryPage {...props} />;
    case 'restockDetail':   return <RestockDetailPage {...props} />;
    case 'creditHistory':   return <CreditHistoryListPage {...props} />;
    case 'creditDetail':    return <CreditHistoryDetailPage {...props} />;
    case 'notifications':   return <NotificationsPage {...props} />;
    case 'profile':         return <ProfilePage {...props} />;
    case 'auditLog':        return <AuditLogPage {...props} />;
    case 'reports':         return <ReportsPage {...props} />;
    default:                return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
