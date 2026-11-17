import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ADMIN_BRANCHES, ADMIN_INVENTORY, ADMIN_PROFILE, BRANCH_PERFORMANCE_CHART, TRANSFER_REQUESTS, USER_GROWTH, USER_STATS } from '../../data/adminMockData';
import { fetchAuditLogs } from '../../api/adminService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../utils/formatters.js';
import { exportRows } from '../../utils/dataExport.js';
import { getOperatingManagerAnalytics } from '../../api/reportsService.js';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import { StatusBadge } from '../StatusBadge';
import { CentralInventoryPanel } from '../inventory/CentralInventoryPanel';
import { ProductImagePicker } from '../shared/ProductImagePicker';
import { deleteProductImage, uploadProductImage } from '../../api/inventoryService';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { UserFormPage, UserListPage } from './UserManagement';
import { BranchListPage, BranchDetailPage } from './BranchManagement';

function btn(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}
function Toolbar({
  actions,
  onAction,
  children
}) {
  if (!actions?.length && !children) return null;
  return <section className="panel content-panel filter-panel">
      <div className="filter-panel-header">
        <div className="filter-panel-search" style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
          {children}
        </div>
        {actions?.length > 0 && <div className="filter-panel-actions">
            {actions.map(a => <button key={a.label} className={btn(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>)}
          </div>}
      </div>
    </section>;
}
function Card({
  title,
  sub,
  children,
  action,
  onAction
}) {
  return <section className="panel content-panel relative overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
        <div><h3>{title}</h3>{sub && <p className="text-ink/70" style={{
          margin: '2px 0 0',
          fontSize: '0.85rem'
        }}>{sub}</p>}</div>
        {action && <button className="button ghost" type="button" onClick={onAction}>{action}</button>}
      </div>
      {children}
    </section>;
}
function StatusPill({
  status
}) {
  return <StatusBadge status={status} />;
}

const DEFAULT_ADMIN_BASE = '/operating-manager/admin';

function getAdminBase(page) {
  if (page?.breadcrumbs?.some((c) => c.to?.startsWith('/operating-manager/admin'))) {
    return '/operating-manager/admin';
  }
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/operating-manager/admin')) {
    return '/operating-manager/admin';
  }
  return '/admin';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({
  navigate,
  showToast
}) {
  return <div className="page">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Operating Manager Administration</p>
          <h2>{ADMIN_PROFILE.name}</h2>
          <p className="text-ink/70">System Administration</p>
        </div>
      </section>

      <Stats stats={[{
      label: 'Total Users',
      value: String(USER_STATS.total)
    }, {
      label: 'Active Users',
      value: String(USER_STATS.active)
    }, {
      label: 'Inactive Users',
      value: String(USER_STATS.inactive)
    }, {
      label: 'New This Month',
      value: String(USER_STATS.newThisMonth)
    }, {
      label: 'Pending Approvals',
      value: String(USER_STATS.pendingApprovals)
    }, {
      label: 'Active Branches',
      value: String(ADMIN_BRANCHES.filter(b => b.status === 'Active').length)
    }]} />

      <div className="grid two-up">
        <Card title="User Growth" sub="Monthly registered users">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={USER_GROWTH}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Area type="monotone" dataKey="users" name="Users" stroke="#153450" fill="#153450" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Branch Overview" sub="Performance scores">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={BRANCH_PERFORMANCE_CHART}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="branch" tick={{
              fontSize: 12
            }} />
              <YAxis domain={[0, 100]} tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="performance" name="Performance" fill="#153450" radius={[4, 4, 0, 0]} />
              <Bar dataKey="risk" name="Risk Score" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid two-up">
        <Card title="Inventory Alerts" sub="Low stock & out of stock" action="Manage Inventory" onAction={() => navigate('/operating-manager/admin/inventory')}>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {ADMIN_INVENTORY.filter(p => p.status !== 'Sufficient').map(p => <li key={p.id}>
                <div><strong>{p.name}</strong><span className="text-ink/70">{p.branch}</span></div>
                <StatusPill status={p.status === 'Out of Stock' ? 'Inactive' : 'Pending'} />
              </li>)}
          </ul>
        </Card>

        <Card title="Pending Transfer Requests" sub="Awaiting approval" action="View All" onAction={() => navigate('/operating-manager/admin/inventory')}>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {TRANSFER_REQUESTS.filter(t => t.status === 'Pending').map(t => <li key={t.id}>
                <div><strong>{t.product}</strong><span className="text-ink/70">{t.from} → {t.to}</span></div>
                <StatusPill status={t.status} />
              </li>)}
          </ul>
        </Card>
      </div>

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Quick Access</h3></div>
        <div className="quick-link-grid">
          {[{
          label: 'User Management',
          to: '/operating-manager/admin/users',
          icon: 'account'
        }, {
          label: 'Branch Management',
          to: '/operating-manager/admin/branches',
          icon: 'home'
        }, {
          label: 'Inventory Management',
          to: '/operating-manager/admin/inventory',
          icon: 'inventory'
        }, {
          label: 'System Reports',
          to: '/operating-manager/admin/reports',
          icon: 'reports'
        }, {
          label: 'Audit Logs',
          to: '/operating-manager/admin/audit-logs',
          icon: 'log'
        }].map(item => <button key={item.to} className="quick-link-card" type="button" onClick={() => navigate(item.to)} style={{
          textAlign: 'left',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer'
        }}>
              <span className="quick-link-icon"><NavIcon name={item.icon} /></span>
              <span className="quick-link-copy"><strong>{item.label}</strong><span className="text-ink/70">Open</span></span>
              <span className="quick-link-arrow">→</span>
            </button>)}
        </div>
      </section>
    </div>;
}

// ── Inventory Management ──────────────────────────────────────────────────────
function InventoryPage({
  navigate,
  showToast
}) {
  const [tab, setTab] = useState('overview');
  const tabs = [{
    key: 'overview',
    label: 'Overview'
  }, {
    key: 'products',
    label: 'Products'
  }, {
    key: 'transfers',
    label: 'Transfer Requests'
  }, {
    key: 'restock',
    label: 'Restock Records'
  }];
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productStatusFilter, setProductStatusFilter] = useState('All');
  const [confirmProductAction, setConfirmProductAction] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    unit_price: '',
    status: 'Active'
  });
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const loadProducts = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/products', {
        params: { limit: 200, product_status: productStatusFilter },
      });
      if (res.data.success) setProducts(res.data.data || []);
    } catch (err) {
      showToast('Failed to load products.', 'error');
    }
    setLoadingTab(false);
  }, [showToast, productStatusFilter]);
  const loadTransfers = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/inventory/transfers');
      if (res.data.success) setTransfers(res.data.data || []);
    } catch (err) {
      showToast('Failed to load transfers.', 'error');
    }
    setLoadingTab(false);
  }, [showToast]);
  const loadRestocks = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/inventory/restocks');
      if (res.data.success) setRestocks(res.data.data || []);
    } catch (err) {
      showToast('Failed to load restocks.', 'error');
    }
    setLoadingTab(false);
  }, [showToast]);
  useEffect(() => {
    if (tab === 'products') loadProducts();
    if (tab === 'transfers') loadTransfers();
    if (tab === 'restock') loadRestocks();
  }, [tab, loadProducts, loadTransfers, loadRestocks]);
  const openCreateProduct = () => {
    setEditingProductId(null);
    setProductForm({ name: '', sku: '', category_id: '', unit_price: '', status: 'Active' });
    setImageUrl('');
    setImageFile(null);
    setImageRemoved(false);
    setShowProductForm(true);
  };
  const openEditProduct = (p) => {
    setEditingProductId(p.product_id);
    setProductForm({
      name: p.product_name || p.name || '',
      sku: p.sku || '',
      category_id: p.category_id ? String(p.category_id) : '',
      unit_price: p.unit_price != null ? String(p.unit_price) : '',
      status: p.status || 'Active',
    });
    setImageUrl(p.image_url || '');
    setImageFile(null);
    setImageRemoved(false);
    setShowProductForm(true);
  };
  const saveProductImage = async (productId) => {
    if (imageFile) {
      const uploaded = await uploadProductImage(productId, imageFile);
      if (!uploaded.success) {
        showToast(uploaded.message || 'Product saved, but the image could not be updated.', 'error');
        return false;
      }
    } else if (imageRemoved) {
      const removed = await deleteProductImage(productId);
      if (!removed.success) {
        showToast(removed.message || 'Product saved, but the image could not be removed.', 'error');
        return false;
      }
    }
    return true;
  };
  const handleProductSubmit = async e => {
    e.preventDefault();
    if (!productForm.name.trim() || !productForm.sku.trim()) return showToast('Name and SKU are required.', 'error');
    try {
      const payload = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim(),
        category_id: productForm.category_id ? Number(productForm.category_id) : null,
        unit_price: productForm.unit_price ? Number(productForm.unit_price) : 0,
        status: productForm.status,
      };
      if (editingProductId) {
        await apiClient.put(`/products/${editingProductId}`, payload);
        const imageSaved = await saveProductImage(editingProductId);
        if (!imageSaved) return;
        showToast('Product updated.', 'success');
      } else {
        const created = await apiClient.post('/products', payload);
        const createdId = created.data?.data?.product_id;
        if (imageFile && createdId) {
          const imageSaved = await saveProductImage(createdId);
          if (!imageSaved) {
            setEditingProductId(createdId);
            setImageUrl('');
            loadProducts();
            return;
          }
        }
        showToast('Product created.', 'success');
      }
      setShowProductForm(false);
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save product.', 'error');
    }
  };
  const updateTransferStatus = async (transferId, status) => {
    try {
      await apiClient.patch(`/inventory/transfers/${transferId}`, { status });
      showToast(`Transfer ${status.toLowerCase()}.`, 'success');
      loadTransfers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update transfer.', 'error');
    }
  };
  const handleArchiveProduct = async (product) => {
    try {
      await apiClient.delete(`/products/${product.product_id}`, { params: { mode: 'archive' } });
      showToast('Product archived.', 'success');
      setConfirmProductAction(null);
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive product.', 'error');
    }
  };
  const handleRestoreProduct = async (product) => {
    try {
      await apiClient.put(`/products/${product.product_id}`, { status: 'Active' });
      showToast('Product restored.', 'success');
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to restore product.', 'error');
    }
  };
  const pagination_products = usePagination(products);
  const paginated_products = pagination_products.paginatedData;
  const pagination_TRANSFER_REQUESTS = usePagination(transfers);
  const paginated_TRANSFER_REQUESTS = pagination_TRANSFER_REQUESTS.paginatedData;
  const pagination_RESTOCK_REQUESTS = usePagination(restocks);
  const paginated_RESTOCK_REQUESTS = pagination_RESTOCK_REQUESTS.paginatedData;
  const pendingTransfer = (t) => ['Pending Approval', 'Submitted'].includes(t.status);
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'overview' && <CentralInventoryPanel title="Inventory Management" onToast={showToast} />}

      {tab === 'products' && <>
          <section className="panel content-panel relative overflow-hidden">
            <div className="list-section-header inventory-products-header">
              <h3>All Products</h3>
              <div className="list-section-actions inventory-products-actions">
                <select
                  className="filter-select"
                  value={productStatusFilter}
                  onChange={(e) => setProductStatusFilter(e.target.value)}
                  aria-label="Product status"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Archived</option>
                </select>
                <button className="button" type="button" onClick={openCreateProduct}>+ Add Product</button>
              </div>
            </div>
            {loadingTab ? <LoadingState message="Loading products…" /> : <><div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Unit Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!paginated_products.length ? <tr><td colSpan={7}><EmptyState title="No products" /></td></tr> : paginated_products.map(p => <tr key={p.product_id}>
                      <td>
                        <div className="product-name-with-image">
                          {p.image_url ? <img src={p.image_url} alt="" width={40} height={40} /> : null}
                          <strong>{p.product_name}</strong>
                        </div>
                      </td><td>{p.sku}</td><td>{p.category_name || '—'}</td>
                      <td>{p.unit_price != null ? Number(p.unit_price).toFixed(2) : '—'}</td>
                      <td>{p.total_quantity ?? p.quantity ?? '—'}</td>
                      <td><StatusPill status={p.status || p.stock_status} /></td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="Edit" onClick={() => openEditProduct(p)}><NavIcon name="edit" /></button>
                        {String(p.status) === 'Inactive' ? (
                          <button className="icon-action-button" type="button" title="Restore" onClick={() => handleRestoreProduct(p)}><NavIcon name="reset" /></button>
                        ) : (
                          <button
                            className="icon-action-button danger"
                            type="button"
                            title="Archive"
                            onClick={() => setConfirmProductAction({ type: 'archive', product: p })}
                          >
                            <NavIcon name="archive" />
                          </button>
                        )}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div><Pagination {...pagination_products} /></>}
          </section>

          {confirmProductAction ? <div className="modal-overlay" onClick={() => setConfirmProductAction(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <h3>Archive Product</h3>
              <p className="text-ink/70">
                Archive “{confirmProductAction.product.product_name}”? It will be hidden from active catalogs but the record is preserved and can be restored later.
              </p>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setConfirmProductAction(null)}>Cancel</button>
                <button
                  type="button"
                  className="button"
                  onClick={() => handleArchiveProduct(confirmProductAction.product)}
                >
                  Confirm Archive
                </button>
              </div>
            </div>
          </div> : null}

          {showProductForm && <div className="modal-overlay" onClick={() => setShowProductForm(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{
          maxWidth: 500
        }}>
                <h3>{editingProductId ? 'Edit Product' : 'Add Product'}</h3>
                <form onSubmit={handleProductSubmit}>
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
                    <label>Product Name <span className="required">*</span></label>
                    <input type="text" value={productForm.name} onChange={e => setProductForm(p => ({
                ...p,
                name: e.target.value
              }))} placeholder="e.g. Sofa" />
                  </div>
                  <div className="form-group">
                    <label>SKU <span className="required">*</span></label>
                    <input type="text" value={productForm.sku} onChange={e => setProductForm(p => ({
                ...p,
                sku: e.target.value
              }))} placeholder="SOFA-123" disabled={Boolean(editingProductId)} />
                  </div>
                  <div className="form-group">
                    <label>Category ID</label>
                    <input type="text" value={productForm.category_id} onChange={e => setProductForm(p => ({
                ...p,
                category_id: e.target.value
              }))} placeholder="e.g. 1" />
                  </div>
                  <div className="form-group">
                    <label>Unit Price</label>
                    <input type="number" min="0" step="0.01" value={productForm.unit_price} onChange={e => setProductForm(p => ({
                ...p,
                unit_price: e.target.value
              }))} />
                  </div>
                  {editingProductId ? <div className="form-group">
                    <label>Status</label>
                    <select className="filter-select" value={productForm.status} onChange={e => setProductForm(p => ({ ...p, status: e.target.value }))}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div> : null}
                  <div className="modal-actions">
                    <button type="button" className="button secondary" onClick={() => setShowProductForm(false)}>Cancel</button>
                    <button type="submit" className="button">{editingProductId ? 'Save Changes' : 'Create Product'}</button>
                  </div>
                </form>
              </div>
            </div>}
        </>}

      {tab === 'transfers' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Transfer Requests</h3></div>
          {loadingTab ? <LoadingState message="Loading transfers…" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Ref</th><th>Product</th><th>From</th><th>To</th><th>Qty</th><th>Submitted By</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_TRANSFER_REQUESTS.map(t => <tr key={t.transfer_id}>
                    <td>{t.transfer_ref}</td><td>{t.product_name}</td><td>{t.source_branch}</td><td>{t.destination_branch}</td><td>{t.quantity}</td>
                    <td>{t.submitted_by_name || '—'}</td><td>{formatDisplayDate(t.submitted_date)}</td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="table-actions">
                      {pendingTransfer(t) && <>
                        <button className="icon-action-button" type="button" title="Approve" onClick={() => updateTransferStatus(t.transfer_id, 'Approved')}><NavIcon name="check" /></button>
                        <button className="icon-action-button danger" type="button" title="Reject" onClick={() => updateTransferStatus(t.transfer_id, 'Rejected')}><NavIcon name="close" /></button>
                      </>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_TRANSFER_REQUESTS} /></>}
        </section>}

      {tab === 'restock' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Restock Records</h3></div>
          {loadingTab ? <LoadingState message="Loading restocks…" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Delivery Ref</th><th>Product</th><th>Branch</th><th>Qty</th><th>Supplier</th><th>Received</th></tr></thead>
              <tbody>
                {paginated_RESTOCK_REQUESTS.map(r => <tr key={r.restock_id}>
                    <td>{r.delivery_ref}</td><td>{r.product_name}</td><td>{r.branch_name}</td><td>{r.quantity}</td>
                    <td>{r.supplier_name || '—'}</td><td>{formatDisplayDate(r.received_date)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_RESTOCK_REQUESTS} /></>}
        </section>}
    </div>;
}

// ── System Reports ────────────────────────────────────────────────────────────
function reportRows(tab, analytics, users) {
  if (tab === 'collections') {
    return (analytics?.trends?.collections || []).map((row) => ({
      day: row.day,
      amount: row.amount,
    }));
  }
  if (tab === 'sales') {
    return (analytics?.topProducts || []).map((row) => ({
      product: row.productName,
      category: row.categoryName,
      quantity: row.quantitySold,
      revenue: row.revenue,
    }));
  }
  if (tab === 'branches') {
    return (analytics?.branchSummary || []).map((row) => ({
      branch: row.branchName,
      collections: row.totalCollections,
      sales: row.totalSales,
      compliance: row.routeCompliance,
      inventory_health: row.inventoryHealth,
    }));
  }
  const counts = {};
  (users || []).forEach((user) => {
    const role = user.role?.name || 'Unassigned';
    if (!counts[role]) counts[role] = { role, count: 0, active: 0, inactive: 0 };
    counts[role].count += 1;
    if (user.status === 'Active') counts[role].active += 1;
    else counts[role].inactive += 1;
  });
  return Object.values(counts);
}

function ReportsPage({
  showToast
}) {
  const [tab, setTab] = useState('collections');
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tabs = [{
    key: 'collections',
    label: 'Collections'
  }, {
    key: 'sales',
    label: 'Sales'
  }, {
    key: 'branches',
    label: 'Branch Performance'
  }, {
    key: 'employees',
    label: 'Employee Performance'
  }];
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      const [report, userRes] = await Promise.all([
        getOperatingManagerAnalytics({}),
        apiClient.get('/users?limit=200').then((res) => res.data).catch(() => ({ success: false, data: [] })),
      ]);
      if (!active) return;
      if (report.success) setAnalytics(report.data);
      else setError(report.message || 'Failed to load reports.');
      if (userRes.success) setUsers(userRes.data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);
  const exportCurrent = (format) => {
    const rows = reportRows(tab, analytics, users);
    const ok = exportRows(rows, {
      format,
      filename: `admin-${tab}-report`,
      title: `CORVEX ${tabs.find((item) => item.key === tab)?.label || 'Report'}`,
    });
    if (ok) showToast(format === 'pdf' ? 'Report exported as PDF.' : 'Excel file downloaded.', 'success');
    else showToast('Nothing to export.', 'error');
  };
  const exportRow = <div className="flex justify-end gap-2 mb-4">
      <button className="button secondary" type="button" onClick={() => exportCurrent('excel')}>Export Excel</button>
      <button className="button" type="button" onClick={() => exportCurrent('pdf')}>Export PDF</button>
    </div>;
  if (loading) return <LoadingState message="Loading system reports..." />;
  if (error || !analytics) return <EmptyState title="Reports unavailable" description={error || 'No report data is available.'} />;
  const employeeRows = reportRows('employees', analytics, users);
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'collections' && <>
        <Stats stats={[{
        label: 'Collections',
        value: formatCurrency(analytics.summary?.totalCollections || 0)
      }, {
        label: 'Growth',
        value: analytics.summary?.collectionGrowthRate == null ? '—' : `${analytics.summary.collectionGrowthRate}%`
      }]} />
        <Card title="Collections Trend" sub={analytics.scope || 'All branches'}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={analytics.trends?.collections || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} /><YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Area type="monotone" dataKey="amount" name="Collections" stroke="#153450" fill="#153450" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'sales' && <>
        <Stats stats={[{
        label: 'Sales',
        value: formatCurrency(analytics.summary?.totalSales || 0)
      }, {
        label: 'Growth',
        value: analytics.summary?.salesGrowthRate == null ? '—' : `${analytics.summary.salesGrowthRate}%`
      }]} />
        <Card title="Top Products" sub="Current reporting period">
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Product</th><th>Category</th><th>Qty</th><th>Revenue</th></tr></thead>
              <tbody>
                {(analytics.topProducts || []).length ? analytics.topProducts.map((row) => <tr key={row.productId}>
                  <td>{row.productName}</td><td>{row.categoryName}</td><td>{row.quantitySold}</td><td>{formatCurrency(row.revenue)}</td>
                </tr>) : <tr><td colSpan="4">No sales in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        {exportRow}
      </>}

      {tab === 'branches' && <>
        <Card title="Branch Performance">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={(analytics.branchSummary || []).map((row) => ({
              branch: row.branchName,
              compliance: row.routeCompliance,
              inventory: row.inventoryHealth,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="branch" tick={{
              fontSize: 12
            }} /><YAxis domain={[0, 100]} tick={{
              fontSize: 12
            }} />
              <Tooltip /><Legend />
              <Bar dataKey="compliance" name="Route Compliance" fill="#153450" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inventory" name="Inventory Health" fill="#153450" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'employees' && <>
        <Card title="Employee Distribution by Role">
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Role</th><th>Count</th><th>Active</th><th>Inactive</th></tr></thead>
              <tbody>
                {employeeRows.length ? employeeRows.map((row) => <tr key={row.role}><td>{row.role}</td><td>{row.count}</td><td>{row.active}</td><td>{row.inactive}</td></tr>) : <tr><td colSpan="4">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        {exportRow}
      </>}
    </div>;
}

function auditStatusLabel(log) {
  return String(log?.status || log?.status_details || log?.action || '—').trim() || '—';
}

function auditActivityLabel(log) {
  return String(log?.activity || log?.action || '—').trim() || '—';
}

function uniqueSortedLabels(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildAuditDetailRows(log) {
  if (!log) return [];
  const status = auditStatusLabel(log);
  const description = String(log.description || log.status_details || '').trim() || '—';
  return [
    { key: 'log_id', label: 'Log ID', value: log.log_id ?? '—' },
    { key: 'date', label: 'Date', value: formatDisplayDate(log.activity_date || log.created_at) },
    { key: 'timestamp', label: 'Timestamp', value: formatDisplayDateTime(log.created_at) },
    { key: 'user', label: 'User', value: log.user_name || (log.user_id ? `User #${log.user_id}` : 'System') },
    { key: 'role', label: 'Role', value: log.role_name || '—' },
    { key: 'module', label: 'Module', value: log.module || '—' },
    { key: 'activity', label: 'Activity', value: auditActivityLabel(log) },
    { key: 'status', label: 'Status', value: <StatusBadge status={status} /> },
    { key: 'reference', label: 'Reference', value: log.affected_record || '—' },
    { key: 'branch', label: 'Affected Branch', value: log.branch_name || log.branch_id || '—' },
    { key: 'description', label: 'Description', value: description },
    { key: 'ip', label: 'IP Address', value: log.ip_address || '—' },
  ];
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
function AuditLogsPage({
  showToast
}) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [viewingLog, setViewingLog] = useState(null);
  useEffect(() => {
    async function loadAuditLogs() {
      setLoading(true);
      const result = await fetchAuditLogs();
      if (result.success) {
        setAuditLogs(result.data || []);
      } else {
        setError(result.message || 'Failed to load audit logs');
      }
      setLoading(false);
    }
    loadAuditLogs();
  }, []);

  const userOptions = useMemo(() => uniqueSortedLabels(auditLogs.map((l) => l.user_name || (l.user_id ? `User #${l.user_id}` : ''))), [auditLogs]);
  const roleOptions = useMemo(() => uniqueSortedLabels(auditLogs.map((l) => l.role_name)), [auditLogs]);
  const moduleOptions = useMemo(() => uniqueSortedLabels(auditLogs.map((l) => l.module)), [auditLogs]);
  const activityOptions = useMemo(() => uniqueSortedLabels(auditLogs.map((l) => auditActivityLabel(l))), [auditLogs]);
  const statusOptions = useMemo(() => uniqueSortedLabels(auditLogs.map((l) => auditStatusLabel(l))), [auditLogs]);

  const filtered = useMemo(() => auditLogs.filter((log) => {
    const userName = String(log.user_name || (log.user_id ? `User #${log.user_id}` : 'System'));
    const activity = auditActivityLabel(log);
    const status = auditStatusLabel(log);
    const q = searchFilter.trim().toLowerCase();

    if (userFilter !== 'all' && userName !== userFilter) return false;
    if (roleFilter !== 'all' && String(log.role_name || '') !== roleFilter) return false;
    if (moduleFilter !== 'all' && String(log.module || '') !== moduleFilter) return false;
    if (activityFilter !== 'all' && activity !== activityFilter) return false;
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (dateFilter) {
      const created = new Date(log.created_at);
      if (!Number.isFinite(created.getTime())) return false;
      const day = [
        created.getFullYear(),
        String(created.getMonth() + 1).padStart(2, '0'),
        String(created.getDate()).padStart(2, '0'),
      ].join('-');
      if (day !== dateFilter) return false;
    }
    if (q) {
      const haystack = [
        userName, log.role_name, log.module, activity, log.action, status,
        log.description, log.status_details, log.ip_address, log.affected_record,
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [auditLogs, searchFilter, userFilter, roleFilter, moduleFilter, activityFilter, statusFilter, dateFilter]);

  const pagination_filtered = usePagination(filtered, {
    resetKey: `${searchFilter}|${userFilter}|${roleFilter}|${moduleFilter}|${activityFilter}|${statusFilter}|${dateFilter}`,
  });
  const paginated_filtered = pagination_filtered.paginatedData;

  const exportPdf = () => {
    const rows = filtered.map((l) => ({
      timestamp: formatDisplayDateTime(l.created_at),
      user: l.user_name || (l.user_id ? `User #${l.user_id}` : 'System'),
      role: l.role_name || '—',
      module: l.module || '—',
      activity: auditActivityLabel(l),
      status: auditStatusLabel(l),
      description: l.description || l.status_details || '—',
      ip_address: l.ip_address || '—',
    }));
    if (exportRows(rows, { format: 'pdf', filename: 'admin-audit-logs.pdf', title: 'Audit Logs' })) {
      showToast('Logs exported as PDF.', 'success');
    } else {
      showToast('Nothing to export.', 'error');
    }
  };

  if (loading) {
    return <div className="page"><LoadingState message="Loading audit logs..." /></div>;
  }
  if (error) {
    return <div className="page">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Audit Logs</h3></div>
          <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#dc2626'
        }}>{error}</div>
        </section>
      </div>;
  }
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Audit Log <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({filtered.length} entries)</span></h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              className="filter-input search"
              type="search"
              placeholder="Search user, module, activity, status…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Search audit logs"
            />
            <select className="filter-select" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="Filter by user">
              <option value="all">All Users</option>
              {userOptions.map((user) => <option key={user} value={user}>{user}</option>)}
            </select>
            <select className="filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="all">All Roles</option>
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label="Filter by module">
              <option value="all">All Modules</option>
              {moduleOptions.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
            </select>
            <select className="filter-select" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} aria-label="Filter by activity">
              <option value="all">All Activities</option>
              {activityOptions.map((activity) => <option key={activity} value={activity}>{activity}</option>)}
            </select>
            <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All Statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <input className="filter-input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" />
            <button className="button" type="button" onClick={exportPdf}>Export PDF</button>
          </div>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Role</th>
                <th>Module</th>
                <th>Activity</th>
                <th>IP Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="7" style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#5F7385'
                }}>No audit logs found</td></tr> : paginated_filtered.map((l) => (
                  <tr key={l.log_id}>
                    <td>{formatDisplayDateTime(l.created_at)}</td>
                    <td>{l.user_name || (l.user_id ? `User #${l.user_id}` : 'System')}</td>
                    <td>{l.role_name || '—'}</td>
                    <td>{l.module || '—'}</td>
                    <td>{auditActivityLabel(l)}</td>
                    <td>{l.ip_address || '—'}</td>
                    <td>
                      <button
                        className="icon-action-button"
                        type="button"
                        title="View"
                        aria-label={`View audit log ${l.log_id}`}
                        onClick={() => setViewingLog(l)}
                      >
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div><Pagination {...pagination_filtered} /></>
      </section>
      {viewingLog ? <div className="modal-overlay" onClick={() => setViewingLog(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 560 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-log-view-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="audit-log-view-title" style={{ marginTop: 0 }}>Audit Log Details</h3>
            <p className="text-ink/70" style={{ margin: '0 0 16px', fontSize: '0.88rem' }}>
              Full record of the selected system activity.
            </p>
            <DetailRowsTable rows={buildAuditDetailRows(viewingLog)} />
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button secondary" type="button" onClick={() => setViewingLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div> : null}
    </div>;
}

// ── Notifications & Profile ───────────────────────────────────────────────────
function NotificationsPage({
  navigate,
  showToast
}) {
  return <NotificationsInbox navigate={navigate} showToast={showToast} />;
}
function ProfilePage({
  showToast
}) {
  return <AccountProfilePanel
    showToast={showToast}
    title="Admin profile"
  />;
}

// ── Product Categories (Admin) ────────────────────────────────────────────────
function ProductCategoriesPage({
  navigate,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const query = params.toString();
      const res = await apiClient.get(`/product-categories${query ? `?${query}` : ''}`);
      if (res.data.success) setCategories(res.data.data || []);
    } catch (err) {
      showToast('Failed to load product categories.', 'error');
    }
    setLoading(false);
  }, [search, statusFilter, showToast]);
  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, loadData]);
  const handleAdd = () => {
    setEditing(null);
    setFormName('');
    setShowForm(true);
  };
  const handleEdit = c => {
    setEditing(c);
    setFormName(c.category_name);
    setShowForm(true);
  };
  const handleArchive = async c => {
    const count = Number(c.product_count) || 0;
    const warn = count > 0
      ? `\n\n${count} product(s) are filed under this category. Archiving hides it from Active pickers but keeps those product assignments.`
      : '';
    if (!window.confirm(`Archive category "${c.category_name}"?${warn}`)) return;
    try {
      const res = await apiClient.delete(`/product-categories/${c.category_id}`);
      showToast(res.data?.message || 'Category archived.', 'success');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive.', 'error');
    }
  };
  const handleSubmit = async e => {
    e.preventDefault();
    if (!formName.trim()) return showToast('Category name is required.', 'error');
    try {
      if (editing) {
        await apiClient.put(`/product-categories/${editing.category_id}`, {
          category_name: formName.trim()
        });
        showToast('Category updated.', 'success');
      } else {
        await apiClient.post('/product-categories', {
          category_name: formName.trim()
        });
        showToast('Category created.', 'success');
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save.', 'error');
    }
  };
  const pagination_categories = usePagination(categories, {
    resetKey: `${search}|${statusFilter}`,
  });
  const paginated_categories = pagination_categories.paginatedData;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Product Categories <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({categories.length})</span></h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search categories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search categories"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Archived</option>
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button" type="button" onClick={handleAdd}>+ Add Category</button>
          </div>
        </div>
        {loading ? <LoadingState message="Loading categories..." /> : categories.length === 0 ? <EmptyState title="No categories found" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Category Name</th><th>Status</th><th># Products</th><th>Updated At</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_categories.map(c => <tr key={c.category_id}>
                    <td>{c.category_name}</td>
                    <td><StatusPill status={c.status} /></td>
                    <td>{Number(c.product_count) || 0}</td>
                    <td>{formatDisplayDateTime(c.updated_at || c.created_at)}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => handleEdit(c)}><NavIcon name="edit" /></button>
                      {String(c.status || '').toLowerCase() === 'inactive' ? (
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Restore"
                          onClick={async () => {
                            try {
                              await apiClient.put(`/product-categories/${c.category_id}`, { status: 'Active' });
                              showToast('Category restored.', 'success');
                              loadData();
                            } catch (err) {
                              showToast(err.response?.data?.message || 'Failed to restore.', 'error');
                            }
                          }}
                        >
                          <NavIcon name="reset" />
                        </button>
                      ) : (
                        <button className="icon-action-button danger" type="button" title="Archive" onClick={() => handleArchive(c)}><NavIcon name="archive" /></button>
                      )}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_categories} /></>}
      </section>
      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        maxWidth: 500
      }}>
            <h3>{editing ? 'Edit Category' : 'Add Category'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category Name</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Living Room" />
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="button">{editing ? 'Save Changes' : 'Create Category'}</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// ── Suppliers (Admin) ─────────────────────────────────────────────────────────
function SuppliersAdminPage({
  navigate,
  showToast
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    supplier_name: '',
    contact: '',
    email: '',
    address: '',
    status: 'Active'
  });
  const emptyForm = {
    supplier_name: '',
    contact: '',
    email: '',
    address: '',
    status: 'Active'
  };
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const query = params.toString();
      const res = await apiClient.get(`/suppliers${query ? `?${query}` : ''}`);
      if (res.data.success) setSuppliers(res.data.data || []);
    } catch (err) {
      showToast('Failed to load suppliers.', 'error');
    }
    setLoading(false);
  }, [search, statusFilter, showToast]);
  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, loadData]);
  const openForm = (supplier = null) => {
    if (supplier) {
      setEditingSupplierId(supplier.suppliers_id ?? supplier.supplier_id);
      setForm({
        supplier_name: supplier.supplier_name || '',
        contact: supplier.contact || supplier.contact_number || '',
        email: supplier.email || '',
        address: supplier.address || '',
        status: supplier.status || 'Active',
      });
    } else {
      setEditingSupplierId(null);
      setForm(emptyForm);
    }
    setErrors({});
    setShowForm(true);
  };
  const closeForm = () => {
    if (submitting) return;
    setShowForm(false);
    setForm(emptyForm);
    setErrors({});
  };
  const updateFormField = (field, value) => {
    setForm(current => ({
      ...current,
      [field]: value
    }));
    setErrors(current => {
      if (!current[field] && !current.submit) return current;
      const next = {
        ...current
      };
      delete next[field];
      delete next.submit;
      return next;
    });
  };
  const handleSubmit = async e => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.supplier_name.trim()) nextErrors.supplier_name = 'Supplier name is required.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        supplier_name: form.supplier_name.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        status: form.status
      };
      if (editingSupplierId) {
        await apiClient.put(`/suppliers/${editingSupplierId}`, payload);
        showToast('Supplier updated.', 'success');
      } else {
        await apiClient.post('/suppliers', payload);
        showToast('Supplier created.', 'success');
      }
      setShowForm(false);
      setEditingSupplierId(null);
      setForm(emptyForm);
      setErrors({});
      loadData();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to create supplier.';
      setErrors({
        submit: message
      });
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };
  const pagination_suppliers = usePagination(suppliers, {
    resetKey: `${search}|${statusFilter}`,
  });
  const paginated_suppliers = pagination_suppliers.paginatedData;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Suppliers <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({suppliers.length})</span></h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search suppliers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search suppliers"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Archived</option>
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button" type="button" onClick={openForm}>+ Add Supplier</button>
          </div>
        </div>
        {loading ? <LoadingState message="Loading suppliers..." /> : suppliers.length === 0 ? <EmptyState title="No suppliers found" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>ID</th><th>Supplier Name</th><th>Contact Number</th><th>Email</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_suppliers.map(s => <tr key={s.suppliers_id ?? s.supplier_id}>
                    <td>{s.suppliers_id ?? s.supplier_id ?? '—'}</td>
                    <td>{s.supplier_name}</td>
                    <td>{formatPhone(s.contact_number || s.contact)}</td>
                    <td>{s.email || '—'}</td>
                    <td>{s.address?.trim() ? s.address : '—'}</td>
                    <td><StatusPill status={s.status || 'Active'} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => openForm(s)}><NavIcon name="edit" /></button>
                      {String(s.status || 'Active').toLowerCase() === 'inactive' ? (
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Restore"
                          onClick={async () => {
                            try {
                              await apiClient.put(`/suppliers/${s.suppliers_id ?? s.supplier_id}`, { status: 'Active' });
                              showToast('Supplier restored.', 'success');
                              loadData();
                            } catch (err) {
                              showToast(err.response?.data?.message || 'Failed to restore supplier.', 'error');
                            }
                          }}
                        >
                          <NavIcon name="reset" />
                        </button>
                      ) : (
                        <button className="icon-action-button danger" type="button" title="Archive" onClick={() => setConfirmArchive(s)}>
                          <NavIcon name="archive" />
                        </button>
                      )}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_suppliers} /></>}
      </section>
      {showForm && <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="add-supplier-title" onClick={e => e.stopPropagation()} style={{
        maxWidth: 500
      }}>
            <h3 id="add-supplier-title">{editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="supplier-name">Supplier Name <span aria-hidden="true">*</span></label>
                <input id="supplier-name" type="text" value={form.supplier_name} onChange={e => updateFormField('supplier_name', e.target.value)} placeholder="Company Name" aria-invalid={Boolean(errors.supplier_name)} aria-describedby={errors.supplier_name ? 'supplier-name-error' : undefined} autoFocus />
                {errors.supplier_name && <p id="supplier-name-error" className="form-error">{errors.supplier_name}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="supplier-contact">Contact Number</label>
                <input id="supplier-contact" type="text" value={form.contact} onChange={e => updateFormField('contact', e.target.value)} placeholder="+63..." />
              </div>
              <div className="form-group">
                <label htmlFor="supplier-email">Email Address</label>
                <input id="supplier-email" type="email" value={form.email} onChange={e => updateFormField('email', e.target.value)} placeholder="email@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'supplier-email-error' : undefined} />
                {errors.email && <p id="supplier-email-error" className="form-error">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="supplier-address">Address</label>
                <textarea id="supplier-address" value={form.address} onChange={e => updateFormField('address', e.target.value)} placeholder="Supplier address" rows={3} />
              </div>
              <div className="form-group">
                <label htmlFor="supplier-status">Status</label>
                <select id="supplier-status" className="filter-select" value={form.status} onChange={e => updateFormField('status', e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              {errors.submit && <p className="form-error" role="alert">{errors.submit}</p>}
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={closeForm} disabled={submitting}>Cancel</button>
                <button type="submit" className="button" disabled={submitting}>{submitting ? 'Saving…' : editingSupplierId ? 'Save Changes' : 'Add Supplier'}</button>
              </div>
            </form>
          </div>
        </div>}
      {confirmArchive && <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Archive supplier</h3>
          <p style={{ margin: 0 }}>
            Archive supplier <strong>{confirmArchive.supplier_name}</strong>? The record is preserved and can be restored later.
          </p>
          <div className="flex gap-2 mt-4">
            <button className="button danger" type="button" onClick={async () => {
              try {
                await apiClient.delete(`/suppliers/${confirmArchive.suppliers_id ?? confirmArchive.supplier_id}`);
                showToast('Supplier archived.', 'success');
                setConfirmArchive(null);
                loadData();
              } catch (err) {
                showToast(err.response?.data?.message || 'Failed to archive supplier.', 'error');
              }
            }}>Confirm Archive</button>
            <button className="button secondary" type="button" onClick={() => setConfirmArchive(null)}>Cancel</button>
          </div>
        </section>}
    </div>;
}

// ── Export ────────────────────────────────────────────────────────────────────
export function AdminPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to navigate." />;
  const adminBase = getAdminBase(page);
  const p = {
    userId: page.params?.userId,
    branchId: page.params?.branchId,
    navigate,
    showToast,
    adminBase
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...p} />;
    case 'userList':
      return <UserListPage {...p} />;
    case 'userForm':
      return <UserFormPage {...p} />;
    case 'branchList':
      return <BranchListPage {...p} />;
    case 'branchDetail':
      return <BranchDetailPage {...p} />;
    case 'inventory':
      return <InventoryPage {...p} />;
    case 'reports':
      return <ReportsPage {...p} />;
    case 'auditLogs':
      return <AuditLogsPage {...p} />;
    case 'notifications':
      return <NotificationsPage {...p} />;
    case 'profile':
      return <ProfilePage {...p} />;
    case 'productCategories':
      return <ProductCategoriesPage {...p} />;
    case 'suppliers':
      return <SuppliersAdminPage {...p} />;
    default:
      return <EmptyState title="Page not found" />;
  }
}