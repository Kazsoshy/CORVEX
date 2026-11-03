/** Display value for optional middle name fields (always show label in UI). */
export function formatMiddleNameDisplay(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || 'N/A';
}

/** UI label: customer_code when available; never invents a fake code from raw DB id alone. */
export function formatCustomerDisplayId(customer) {
  if (!customer) return '—';
  const code = String(customer.customer_code || '').trim();
  if (code) return code;
  return '—';
}

/** Build a single address line from structured PH address parts. */
export function composeCustomerAddress(parts = {}) {
  return [
    parts.address_street,
    parts.address_barangay,
    parts.address_city,
    parts.address_province,
    parts.address_region,
    parts.address_zip,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
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

/** Civil / marital status options for customer identity. */
export const CIVIL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Widowed',
  'Separated',
  'Annulled',
  'Divorced',
];
