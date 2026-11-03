import { useEffect, useMemo, useRef, useState } from 'react';
import { NavIcon } from '../../navIcons';

/**
 * Single searchable product dropdown (type to filter, click to select).
 * options: [{ product_id, product_name, sku, ... }]
 */
export function ProductSearchSelect({
  options = [],
  onSelect,
  placeholder = 'Search product or SKU…',
  emptyLabel = 'No matching products',
  disabled = false,
}) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = !q
      ? options
      : options.filter((p) => (
        String(p.product_name || '').toLowerCase().includes(q)
        || String(p.sku || '').toLowerCase().includes(q)
      ));
    return rows.slice(0, 80);
  }, [options, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const choose = (product) => {
    if (!product) return;
    onSelect?.(product);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex]);
    }
  };

  return (
    <div className="search-bar product-search-select" ref={rootRef} style={{ flex: 1, minWidth: 240, maxWidth: '100%' }}>
      <NavIcon name="search" />
      <input
        className="search-input"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="product-search-select-list"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <span className="product-search-select-caret" aria-hidden="true">▾</span>

      {open ? (
        <ul
          id="product-search-select-list"
          className="search-suggestions product-search-select-menu"
          role="listbox"
        >
          {filtered.length ? filtered.map((p, index) => (
            <li key={p.product_id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`search-suggestion-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(p)}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{p.product_name || '—'}</strong>
                  <span className="mono-cell" style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                    {p.sku || 'No SKU'}
                  </span>
                </span>
              </button>
            </li>
          )) : (
            <li className="product-search-select-empty" role="presentation">
              {options.length ? emptyLabel : 'No products available'}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
