/** UI label e.g. C-001-2026 (stored in customer_code). Numeric PK is customer_id. */
export function formatCustomerDisplayId(customer) {
  if (!customer) return '—';
  if (customer.customer_code) return customer.customer_code;
  const id = customer.customer_id ?? customer.id;
  if (id === undefined || id === null) return '—';
  const created = customer.created_at ? new Date(customer.created_at) : new Date();
  const year = Number.isNaN(created.getTime()) ? new Date().getFullYear() : created.getFullYear();
  return `C-${String(id).padStart(3, '0')}-${year}`;
}

export function formatPurchaseVolumeUnits(value) {
  const units = Number(value);
  if (!Number.isFinite(units)) return '0 units';
  return `${units.toLocaleString('en-US')} ${units === 1 ? 'unit' : 'units'}`;
}
