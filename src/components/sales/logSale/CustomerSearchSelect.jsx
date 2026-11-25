import { useEffect, useRef, useState } from 'react';
import { fetchCustomers } from '../../../api/salesService';
import { formatCustomerFullName } from '../../../utils/customerDisplay';
import { StatusBadge } from '../../StatusBadge';

function customerLabel(customer) {
  if (!customer) return '';
  const formatted = formatCustomerFullName(customer);
  if (formatted && formatted !== '—') return formatted;
  if (String(customer.business_name || '').trim()) return String(customer.business_name).trim();
  return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Customer';
}

export function CustomerSearchSelect({
  value,
  selectedCustomer,
  locked,
  onSelect,
  onClear,
  disabled,
}) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (locked || disabled) return undefined;
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await fetchCustomers({
        search: term,
        limit: 20,
        status: 'Active',
      });
      if (cancelled) return;
      setSearching(false);
      setResults(result.success ? (result.data || []) : []);
      setActiveIndex(0);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, locked, disabled]);

  useEffect(() => {
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (value && selectedCustomer) {
    return (
      <div className="log-sale-customer-selected">
        <div className="log-sale-customer-selected__main">
          <strong className="log-sale-customer-selected__name">{customerLabel(selectedCustomer)}</strong>
          <div className="log-sale-customer-selected__meta">
            {selectedCustomer.contact_phone ? (
              <span>{selectedCustomer.contact_phone}</span>
            ) : null}
            {selectedCustomer.customer_code ? (
              <span className="muted">{selectedCustomer.customer_code}</span>
            ) : null}
          </div>
        </div>
        <div className="log-sale-customer-selected__aside">
          <StatusBadge status={selectedCustomer.status || 'Active'} />
          {!locked ? (
            <button className="button ghost" type="button" disabled={disabled} onClick={onClear}>
              Change
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="search-bar product-search-select log-sale-customer-search" ref={rootRef}>
      <input
        id="log-sale-customer"
        className="filter-input search"
        type="search"
        placeholder="Search active customers…"
        value={query}
        disabled={disabled || locked}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && results[activeIndex]) {
            e.preventDefault();
            onSelect(results[activeIndex]);
            setQuery('');
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() ? (
        <div className="product-search-select-menu log-sale-customer-menu" role="listbox">
          {searching ? <div className="product-search-select-empty">Searching…</div> : null}
          {!searching && !results.length ? (
            <div className="product-search-select-empty">No matches</div>
          ) : null}
          {results.map((customer, index) => (
            <button
              key={customer.customer_id}
              type="button"
              className={
                index === activeIndex
                  ? 'search-suggestion-item is-active log-sale-customer-option'
                  : 'search-suggestion-item log-sale-customer-option'
              }
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onSelect(customer);
                setQuery('');
                setOpen(false);
              }}
            >
              <span className="log-sale-customer-option__name">{customerLabel(customer)}</span>
              <span className="log-sale-customer-option__meta muted">
                {[customer.customer_code, customer.contact_phone].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { customerLabel };
