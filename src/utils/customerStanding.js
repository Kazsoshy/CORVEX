/**
 * Shared customer payment-standing helpers for BM / Sales / Collector UI.
 * Overdue requires a past-due unpaid invoice flag — not merely balance > 0.
 */

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * @param {object} customer
 * @returns {'Current'|'Overdue'|'Has Balance'}
 */
export function paymentStanding(customer) {
  if (!customer) return 'Current';
  const outstanding = money(
    customer.activity?.outstanding_balance
      ?? customer.outstandingBalance
      ?? customer.outstanding_balance
      ?? customer.balance
      ?? 0
  );
  if (outstanding <= 0) return 'Current';
  const overdue = Boolean(
    customer.hasOverdueInvoice
      ?? customer.has_overdue_invoice
      ?? (customer.paymentStatus === 'Overdue')
  );
  // Prefer explicit invoice flag; fall back to server-computed paymentStatus only when no flag.
  if (customer.hasOverdueInvoice != null || customer.has_overdue_invoice != null) {
    return overdue ? 'Overdue' : 'Has Balance';
  }
  if (customer.paymentStatus === 'Overdue' || customer.paymentStatus === 'Has Balance' || customer.paymentStatus === 'Current') {
    return customer.paymentStatus;
  }
  return 'Has Balance';
}

export function standingFilterMatches(standing, filter) {
  if (!filter || filter === 'all' || filter === 'All') return true;
  return String(standing) === String(filter);
}

/**
 * Days past earliest unpaid due date when standing is Overdue; otherwise 0.
 */
export function daysOverdue(customer) {
  if (paymentStanding(customer) !== 'Overdue') return 0;
  const explicit = Number(customer?.daysOverdue);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const due = customer?.earliestDueDate || customer?.earliest_due_date;
  if (!due) return 0;
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const diff = Math.floor(
    (new Date(`${manilaToday}T12:00:00`) - new Date(`${String(due).slice(0, 10)}T12:00:00`)) / 86400000
  );
  return Math.max(0, diff);
}
