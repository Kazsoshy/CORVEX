const NEUTRAL_EXACT = new Set(['draft', 'archived', 'disabled', 'n/a', '—', '-', 'na']);

const ERROR_TERMS = [
  'inactive', 'cancelled', 'canceled', 'rejected', 'failed',
  'failure', 'critical', 'out of stock', 'out of balance', 'overdue', 'late',
  'offline', 'declined', 'denied', 'void', 'error', 'unpaid', 'unavailable',
  'returned', 'reversed',
];

const WARNING_TERMS = [
  'pending', 'processing', 'in progress', 'low stock', 'low', 'warning',
  'submitted', 'awaiting', 'scheduled', 'rescheduled', 'partial', 'unread',
  'due', 'open', 'needs alignment', 'misaligned',
];

const SUCCESS_TERMS = [
  'active', 'available', 'completed', 'approved', 'success', 'successful',
  'sufficient', 'paid', 'delivered', 'resolved', 'synced', 'read', 'online',
  'posted', 'confirmed', 'accepted', 'clear', 'verified', 'current', 'healthy',
  'received', 'aligned',
];

const INFO_TERMS = ['shipped', 'informational', 'info'];

/**
 * Maps a status label to a semantic tone used for colored text.
 * Same status → same tone system-wide.
 */
export function getStatusTone(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) return 'neutral';

  if (NEUTRAL_EXACT.has(normalized)) return 'neutral';
  if (normalized.includes('draft') || normalized.includes('archived') || normalized.includes('disabled')) {
    return 'neutral';
  }
  if (ERROR_TERMS.some(term => normalized.includes(term))) return 'danger';
  if (WARNING_TERMS.some(term => normalized.includes(term))) return 'warning';
  if (SUCCESS_TERMS.some(term => normalized.includes(term))) return 'success';
  if (INFO_TERMS.some(term => normalized.includes(term))) return 'info';
  return 'neutral';
}

export function getStatusTextClass(status) {
  return `status-text status-text-${getStatusTone(status)}`;
}

/**
 * Renders a status as plain colored text (no badge/pill background).
 * `variant` is accepted for backward compatibility but always renders text.
 */
export function StatusBadge({ status, className = '', variant: _variant }) {
  if (status === null || status === undefined || status === '') return null;

  return (
    <span className={`${getStatusTextClass(status)} ${className}`.trim()}>
      {status}
    </span>
  );
}
