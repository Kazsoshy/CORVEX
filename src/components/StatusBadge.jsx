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

export function getStatusTone(status) {
  const normalized = String(status ?? '').trim().toLowerCase();

  if (ERROR_TERMS.some(term => normalized.includes(term))) return 'danger';
  if (WARNING_TERMS.some(term => normalized.includes(term))) return 'warning';
  if (SUCCESS_TERMS.some(term => normalized.includes(term))) return 'success';
  if (normalized.includes('informational') || normalized.includes('info')) return 'info';
  return 'neutral';
}

export function getStatusTextClass(status) {
  const tone = getStatusTone(status);
  return `status-text-${tone}`;
}

export function StatusBadge({ status, className = '', variant = 'text' }) {
  if (status === null || status === undefined || status === '') return null;

  const tone = getStatusTone(status);
  const classes = variant === 'pill'
    ? (tone === 'neutral' ? 'badge' : `badge badge-${tone}`)
    : getStatusTextClass(status);

  return (
    <span className={`${classes} font-medium whitespace-nowrap ${className}`.trim()}>
      {status}
    </span>
  );
}
