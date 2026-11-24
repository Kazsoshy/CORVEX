import { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../../../utils/formatters.js';
import { ProductThumb } from './ProductThumb';

export function ProductPickerModal({
  open,
  products,
  excludeIds = [],
  onClose,
  onPick,
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const excluded = new Set(excludeIds.map(String));
    const term = query.trim().toLowerCase();
    return (products || []).filter((p) => {
      if (excluded.has(String(p.product_id))) return false;
      if (!term) return true;
      const hay = `${p.product_name || ''} ${p.sku || p.product_code || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [products, excludeIds, query]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay modal-overlay--elevated"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-sale-product-picker-title"
      onClick={onClose}
    >
      <div className="modal-content log-sale-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="log-sale-product-picker-title">Add product</h3>
        </div>
        <div className="form-group">
          <label htmlFor="log-sale-product-search">Search</label>
          <input
            id="log-sale-product-search"
            className="filter-input search"
            type="search"
            autoFocus
            placeholder="Name or SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="log-sale-picker-table-wrap">
          <table className="corvex-table log-sale-picker-table">
            <thead>
              <tr>
                <th aria-label="Image" />
                <th>Product</th>
                <th>SKU</th>
                <th>Stock</th>
                <th>Price</th>
                <th aria-label="Add" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const stock = Number(p.available_stock ?? p.quantity ?? 0);
                const out = stock <= 0;
                return (
                  <tr key={p.product_id}>
                    <td className="log-sale-picker-thumb">
                      <ProductThumb
                        src={p.image_url || p.image || ''}
                        alt={p.product_name || ''}
                        size={52}
                      />
                    </td>
                    <td className="log-sale-picker-name">
                      <strong>{p.product_name}</strong>
                    </td>
                    <td className="log-sale-picker-sku">{p.sku || p.product_code || '—'}</td>
                    <td>{stock}</td>
                    <td>{formatCurrency(p.unit_price)}</td>
                    <td>
                      <button
                        className="button"
                        type="button"
                        disabled={out}
                        onClick={() => onPick(p)}
                      >
                        {out ? 'Out' : 'Add'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="muted">No products match.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
