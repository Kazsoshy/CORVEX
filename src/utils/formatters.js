const LONG_DATE_OPTIONS = { year: 'numeric', month: 'long', day: 'numeric' };
const LONG_DATETIME_OPTIONS = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function parseDisplayDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return new Date(`${value.trim()}T00:00:00`);
  }
  return new Date(value);
}

/**
 * Formats a given number into a Philippine Peso currency string.
 * @param {number|string} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., ₱1,234.56)
 */
export function formatCurrency(amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  return `₱${safe.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats Philippine mobile or landline numbers for display.
 * Preserves unrecognised values as trimmed text (does not invent digits).
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function formatPhone(value) {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value).trim();
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');

  // +63 / 63 → national format starting with 0
  let local = digits;
  if (local.startsWith('63') && local.length >= 11) local = `0${local.slice(2)}`;

  // Mobile: 09XXXXXXXXX → 09XX XXX XXXX
  if (/^09\d{9}$/.test(local)) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }

  // Landline: 0 + 1–3 digit area + 7 local digits → (0XX) XXX-XXXX
  if (/^0\d{8,10}$/.test(local)) {
    const localPart = local.slice(-7);
    const area = local.slice(0, local.length - 7);
    if (area.length >= 2 && area.length <= 4) {
      return `(${area}) ${localPart.slice(0, 3)}-${localPart.slice(3)}`;
    }
  }

  return raw;
}

/** @returns {string} e.g. January 19, 2026 */
export function formatDisplayDate(value) {
  if (value === null || value === undefined || value === '') return '—';
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', LONG_DATE_OPTIONS);
}

/** @returns {string} e.g. January 19, 2026, 3:45 PM */
export function formatDisplayDateTime(value) {
  if (value === null || value === undefined || value === '') return '—';
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', LONG_DATETIME_OPTIONS);
}

/** Combines collection_payment.payment_date + payment_time into one display timestamp. */
export function formatPaymentTimestamp(paymentDate, paymentTime) {
  if (paymentDate === null || paymentDate === undefined || paymentDate === '') return '—';
  const datePart = String(paymentDate).slice(0, 10);
  const timeRaw = paymentTime != null && paymentTime !== '' ? String(paymentTime) : '00:00:00';
  const timePart = timeRaw.length >= 8 ? timeRaw.slice(0, 8) : `${timeRaw}:00`.slice(0, 8);
  return formatDisplayDateTime(`${datePart}T${timePart}`);
}
