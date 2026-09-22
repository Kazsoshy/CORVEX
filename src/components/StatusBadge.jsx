const ERROR_TERMS = [
  'inactive', 'archived', 'cancelled', 'canceled', 'rejected', 'failed',
  'failure', 'critical', 'out of stock', 'overdue', 'late', 'offline',
  'declined', 'denied', 'void', 'error', 'unpaid', 'unavailable', 'returned',
  'reversed',
];

const WARNING_TERMS = [
  'pending', 'processing', 'in progress', 'low stock', 'low', 'warning',
  'submitted', 'awaiting', 'scheduled', 'rescheduled', 'partial', 'unread',
  'due', 'open',
];

const SUCCESS_TERMS = [
  'active', 'available', 'completed', 'approved', 'success', 'successful',
  'sufficient', 'paid', 'delivered', 'resolved', 'synced', 'read', 'online',
  'posted', 'confirmed', 'accepted', 'clear', 'verified', 'current', 'healthy',
  'received',
];

export function getStatusTextClass(status) {
  const normalized = String(status ?? '').trim().toLowerCase();

  // Check negative states before "active" so "inactive" is never green.
  if (ERROR_TERMS.some(term => normalized.includes(term))) return 'text-red-700';
  if (WARNING_TERMS.some(term => normalized.includes(term))) return 'text-amber-700';
  if (SUCCESS_TERMS.some(term => normalized.includes(term))) return 'text-emerald-700';
  if (normalized.includes('informational') || normalized.includes('info')) return 'text-blue-700';
  return 'text-slate-600';
}

export function StatusBadge({ status, className = '' }) {
  if (status === null || status === undefined || status === '') return null;

  return (
    <span className={`${getStatusTextClass(status)} font-medium whitespace-nowrap ${className}`.trim()}>
      {status}
    </span>
  );
}
