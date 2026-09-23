/** UI label: plain sequential customer_id (display only; does not change stored data). */
export function formatCustomerDisplayId(customer) {
  if (!customer) return '—';
  const id = customer.customer_id ?? customer.id;
  if (id === undefined || id === null || id === '') return '—';
  return String(id);
}

export function formatPurchaseVolumeUnits(value) {
  const units = Number(value);
  if (!Number.isFinite(units)) return '0 units';
  return `${units.toLocaleString('en-US')} ${units === 1 ? 'unit' : 'units'}`;
}

/** Account owner full name including optional middle name. */
export function formatCustomerFullName(customer) {
  if (!customer) return '—';
  const name = [customer.first_name, customer.middle_name, customer.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || '—';
}

/** Primary contact person full name including optional middle name. */
export function formatContactPersonName(customer) {
  if (!customer) return '—';
  const name = [customer.contact_person_fname, customer.contact_person_mname, customer.contact_person_lname]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || '—';
}

/** Secondary contact full name. */
export function formatSecondaryContactName(customer) {
  if (!customer) return '';
  return [customer.secondary_contact_fname, customer.secondary_contact_lname]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Allowed values for secondary_contact_relationship (UI select). */
export const CONTACT_RELATIONSHIP_OPTIONS = [
  'Relative',
  'Friend',
  'Cousin',
  'Sibling',
  'Spouse',
  'Parent',
  'Child',
  'Colleague',
  'Neighbor',
  'Other',
];
