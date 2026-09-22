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
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
