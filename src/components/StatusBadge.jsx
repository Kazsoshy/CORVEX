import { usePreferences } from '../settings/PreferencesProvider.jsx';

const NEUTRAL_EXACT = new Set(['draft', 'disabled', 'n/a', '—', '-', 'na', 'logout']);

const STATUS_MARKS = {
  success: '●',
  warning: '▲',
  danger: '■',
  info: '◆',
  neutral: '',
};

const ERROR_TERMS = [
  'inactive', 'cancelled', 'canceled', 'rejected', 'failed',
  'failure', 'critical', 'high', 'out of stock', 'out of balance', 'overdue', 'late',
  'offline', 'declined', 'denied', 'void', 'error', 'unpaid', 'unavailable',
  'returned', 'reversed', 'degraded', 'deleted', 'locked', 'unauthorized',
];

const WARNING_TERMS = [
  'pending', 'processing', 'in progress', 'low stock', 'low', 'medium', 'warning',
  'submitted', 'awaiting', 'scheduled', 'rescheduled', 'partial', 'unread',
<<<<<<< HEAD
  'due', 'open', 'needs alignment', 'misaligned', 'investigating', 'archived',
=======
  'due', 'open', 'needs alignment', 'misaligned', 'assigned',
>>>>>>> c35bff3831df8285b9be2ba8522d80fdaec138a6
];

const SUCCESS_TERMS = [
  'active', 'available', 'completed', 'approved', 'success', 'successful',
  'sufficient', 'paid', 'delivered', 'resolved', 'synced', 'read', 'online',
  'posted', 'confirmed', 'accepted', 'clear', 'verified', 'current', 'healthy',
<<<<<<< HEAD
  'received', 'aligned', 'created', 'restored', 'unlocked', 'allowed',
=======
  'received', 'aligned', 'done',
>>>>>>> c35bff3831df8285b9be2ba8522d80fdaec138a6
];

const INFO_TERMS = ['shipped', 'informational', 'info', 'updated', 'exported', 'imported', 'password'];

/**
 * Maps a status label to a semantic tone used for colored text.
 * Same status → same tone system-wide.
 */
export function getStatusTone(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) return 'neutral';

  if (NEUTRAL_EXACT.has(normalized)) return 'neutral';
<<<<<<< HEAD
  if (normalized.includes('draft') || normalized.includes('disabled')) {
=======
  if (normalized === 'never stocked') return 'info';
  if (normalized === 'out') return 'danger';
  if (normalized.includes('draft') || normalized.includes('archived') || normalized.includes('disabled')) {
>>>>>>> c35bff3831df8285b9be2ba8522d80fdaec138a6
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
  const { prefs } = usePreferences();
  if (status === null || status === undefined || status === '') return null;
  const tone = getStatusTone(status);
  const mark = (prefs.colorPalette === 'colorblind' || prefs.highContrast) ? STATUS_MARKS[tone] : '';

  return (
    <span className={`${getStatusTextClass(status)} ${className}`.trim()}>
      {mark ? <span aria-hidden="true">{mark} </span> : null}
      {status}
    </span>
  );
}
