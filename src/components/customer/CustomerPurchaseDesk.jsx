import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, LayoutGrid, Minus, Plus, Search, Store, Table2, Trash2 } from 'lucide-react';
import {
  fetchCustomerPortalProducts,
  fetchCustomerPurchaseRequests,
  submitCustomerPurchaseRequest,
} from '../../api/customerPortalService.js';
import { formatCurrency, formatDisplayDateTime } from '../../utils/formatters.js';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';

const VIEW_KEY = 'corvex_customer_catalog_view';
const CATALOG_PAGE_SIZE = 12;

function ProductPhoto({ src, name, size = 'card' }) {
  const [failed, setFailed] = useState(false);
  const mark = String(name || '?').trim().slice(0, 2).toUpperCase();
  if (!src || failed) {
    return <span className={`pos-photo pos-photo-${size}`} aria-hidden="true">{mark}</span>;
  }
  return (
    <img
      className={`pos-photo pos-photo-${size}`}
      src={src}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

export function CustomerPurchaseDesk({ showToast }) {
  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [view, setView] = useState(() => (localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'));
  const [panel, setPanel] = useState('catalog');
  const [requestStatus, setRequestStatus] = useState('All');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [productsRes, requestsRes] = await Promise.all([
      fetchCustomerPortalProducts(),
      fetchCustomerPurchaseRequests(),
    ]);
    if (productsRes.success) setProducts(productsRes.data || []);
    if (requestsRes.success) setRequests(requestsRes.data || []);
  };

  useEffect(() => {
    let active = true;
    async function run() {
      await load();
      if (active) setLoading(false);
    }
    run();
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => {
    const names = new Set(products.map((product) => product.category_name || 'Uncategorized'));
    return ['All', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const inCategory = category === 'All' || (product.category_name || 'Uncategorized') === category;
      if (!inCategory) return false;
      if (!needle) return true;
      return [product.product_name, product.sku, product.category_name]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [products, query, category]);

  const catalogPagination = usePagination(filtered, {
    pageSize: CATALOG_PAGE_SIZE,
    resetKey: `${query}|${category}`,
  });
  const pageProducts = catalogPagination.paginatedData;

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + (Number(line.unit_price) || 0) * line.quantity, 0);
  const requestStatuses = useMemo(() => {
    const names = new Set(requests.map((request) => request.status).filter(Boolean));
    return ['All', ...Array.from(names)];
  }, [requests]);
  const visibleRequests = useMemo(() => (
    requestStatus === 'All' ? requests : requests.filter((request) => request.status === requestStatus)
  ), [requests, requestStatus]);

  const setCatalogView = (next) => {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  };

  const addProduct = (product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product_id === product.product_id);
      if (existing) {
        return current.map((line) => (
          line.product_id === product.product_id ? { ...line, quantity: line.quantity + 1 } : line
        ));
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const setLineQty = (productId, quantity) => {
    setCart((current) => current.flatMap((line) => {
      if (line.product_id !== productId) return [line];
      if (quantity <= 0) return [];
      return [{ ...line, quantity }];
    }));
  };

  const submit = async () => {
    if (!cart.length) {
      showToast?.('Add at least one product.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await submitCustomerPurchaseRequest({
      notes: notes.trim() || undefined,
      items: cart.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
    });
    setSubmitting(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to submit request.', 'error');
      return;
    }
    showToast?.(result.message || 'Request submitted.', 'success');
    setCart([]);
    setNotes('');
    setRequestStatus('All');
    setPanel('requests');
    await load();
  };

  if (loading) return <LoadingState message="Loading purchase requests…" />;

  return (
    <div className="page customer-page pos-page">
      <header className="settings-hero pos-hero">
        <div>
          <p className="settings-kicker">Purchase desk</p>
          <h2>{panel === 'catalog' ? 'Request products' : 'Your requests'}</h2>
          <p className="muted">
            {panel === 'catalog'
              ? 'Tap a product to add it. Your sales agent reviews the request before an order or invoice is created.'
              : 'Status updates from your sales agent appear here.'}
          </p>
        </div>
        <div className="settings-hero-meta">
          {panel === 'catalog' ? (
            <>
              <span className="settings-pill">{products.length} products</span>
              <span className="settings-pill">{cartCount} in this request</span>
            </>
          ) : (
            <span className="settings-pill">{requests.length} request{requests.length === 1 ? '' : 's'}</span>
          )}
        </div>
      </header>

      <div className="pos-tabs" role="tablist" aria-label="Purchase desk">
        <button type="button" role="tab" aria-selected={panel === 'catalog'} onClick={() => setPanel('catalog')}>
          <Store size={16} aria-hidden="true" />
          Catalog
          {cartCount ? <span>{cartCount}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={panel === 'requests'} onClick={() => setPanel('requests')}>
          <ClipboardList size={16} aria-hidden="true" />
          Requests
          <span>{requests.length}</span>
        </button>
      </div>

      {panel === 'catalog' ? <div className="pos-desk">
        <section className="pos-catalog" aria-label="Product catalog">
          <div className="pos-toolbar">
            <label className="pos-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search products</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or SKU"
              />
            </label>
            <select
              className="filter-select pos-category-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter by category"
            >
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name === 'All' ? 'All Categories' : name}
                </option>
              ))}
            </select>
            <div className="pos-view" role="group" aria-label="Catalog layout">
              <button type="button" aria-pressed={view === 'cards'} onClick={() => setCatalogView('cards')}>
                <LayoutGrid size={16} aria-hidden="true" />
                Cards
              </button>
              <button type="button" aria-pressed={view === 'table'} onClick={() => setCatalogView('table')}>
                <Table2 size={16} aria-hidden="true" />
                Table
              </button>
            </div>
          </div>

          {!filtered.length ? (
            <EmptyState title="No products match" description="Try another category or clear the search." />
          ) : view === 'cards' ? (
            <>
              <div className="pos-grid">
                {pageProducts.map((product) => {
                  const inCart = cart.find((line) => line.product_id === product.product_id);
                  const stock = Number(product.available_stock) || 0;
                  return (
                    <button
                      key={product.product_id}
                      type="button"
                      className={inCart ? 'pos-card in-cart' : 'pos-card'}
                      onClick={() => addProduct(product)}
                      aria-label={`Add ${product.product_name}`}
                    >
                      <ProductPhoto src={product.image_url} name={product.product_name} />
                      {inCart ? <span className="pos-badge">{inCart.quantity}</span> : null}
                      <span className="pos-card-body">
                        <strong>{product.product_name}</strong>
                        <small>{product.sku || product.category_name || 'Product'}</small>
                        <span className="pos-card-meta">
                          <b>{formatCurrency(Number(product.unit_price || 0))}</b>
                          <em>{stock > 0 ? `${stock} in branch` : 'Ask branch'}</em>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <Pagination {...catalogPagination} />
            </>
          ) : (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table pos-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>In branch</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pageProducts.map((product) => {
                      const inCart = cart.find((line) => line.product_id === product.product_id);
                      const stock = Number(product.available_stock) || 0;
                      return (
                        <tr key={product.product_id}>
                          <td>
                            <span className="pos-table-product">
                              <ProductPhoto src={product.image_url} name={product.product_name} size="row" />
                              <strong>{product.product_name}</strong>
                            </span>
                          </td>
                          <td>{product.sku || '—'}</td>
                          <td>{product.category_name || '—'}</td>
                          <td>{formatCurrency(Number(product.unit_price || 0))}</td>
                          <td>{stock > 0 ? stock : 'Ask branch'}</td>
                          <td>
                            <button className="button secondary" type="button" onClick={() => addProduct(product)}>
                              {inCart ? `Add (${inCart.quantity})` : 'Add'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination {...catalogPagination} />
            </>
          )}
        </section>

        <aside className="pos-ticket" aria-label="Current request">
          <header>
            <h3>This request</h3>
            <p>{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Nothing added yet'}</p>
          </header>
          {!cart.length ? (
            <p className="pos-ticket-empty">Choose products from the catalog. Each tap adds one.</p>
          ) : (
            <ul className="pos-lines">
              {cart.map((line) => (
                <li key={line.product_id}>
                  <ProductPhoto src={line.image_url} name={line.product_name} size="row" />
                  <div>
                    <strong>{line.product_name}</strong>
                    <small>{formatCurrency(Number(line.unit_price || 0))}</small>
                    <div className="pos-stepper">
                      <button type="button" aria-label={`Decrease ${line.product_name}`} onClick={() => setLineQty(line.product_id, line.quantity - 1)}>
                        <Minus size={14} />
                      </button>
                      <span>{line.quantity}</span>
                      <button type="button" aria-label={`Increase ${line.product_name}`} onClick={() => setLineQty(line.product_id, line.quantity + 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <button type="button" className="pos-remove" aria-label={`Remove ${line.product_name}`} onClick={() => setLineQty(line.product_id, 0)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="pos-notes">
            Note for your sales agent
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
          </label>
          <div className="pos-total">
            <span>Estimated total</span>
            <strong>{formatCurrency(cartTotal)}</strong>
          </div>
          <button className="button pos-submit" type="button" onClick={submit} disabled={submitting || !cart.length}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </aside>
      </div> : (
      <section className="pos-history" role="tabpanel" aria-label="Your requests">
        <div className="pos-chips" role="group" aria-label="Request status">
          {requestStatuses.map((status) => (
            <button
              key={status}
              type="button"
              className={requestStatus === status ? 'pos-chip active' : 'pos-chip'}
              aria-pressed={requestStatus === status}
              onClick={() => setRequestStatus(status)}
            >
              {status}
            </button>
          ))}
        </div>
        {!visibleRequests.length ? (
          <EmptyState
            title={requests.length ? 'Nothing in this status' : 'No requests yet'}
            description={requests.length
              ? 'Choose another status to see the rest of your requests.'
              : 'Submitted purchase requests will appear here with status updates from your sales agent.'}
          />
        ) : (
          <div className="pos-history-list">
            {visibleRequests.map((request) => (
              <article key={request.request_id}>
                <div className="pos-history-top">
                  <strong>Request {request.request_id}</strong>
                  <StatusBadge status={request.status} />
                </div>
                <p>{formatDisplayDateTime(request.created_at)}{request.sales_agent_name ? ` · ${request.sales_agent_name}` : ''}</p>
                <ul>
                  {(request.items || []).map((item) => (
                    <li key={item.item_id || `${request.request_id}-${item.product_id}`}>
                      <ProductPhoto src={item.image_url} name={item.product_name} size="row" />
                      <span>{item.product_name} × {item.quantity}</span>
                    </li>
                  ))}
                </ul>
                {request.notes ? <p className="pos-history-note">Your note: {request.notes}</p> : null}
                {request.agent_reply ? (
                  <p className="pos-history-note">
                    {request.status === 'Rejected' || request.status === 'Cancelled' ? 'Reason: ' : 'From your sales agent: '}
                    {request.agent_reply}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
