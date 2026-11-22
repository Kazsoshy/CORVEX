/** Temporary record/notification focus from notification navigation. */

export const HIGHLIGHT_DURATION_MS = 4200;
export const HIGHLIGHT_CLASS = 'corvex-record-highlight';

export function readHighlightId(search = '', state = null) {
  try {
    const params = new URLSearchParams(search || '');
    const fromQuery = params.get('highlight') || params.get('id') || params.get('verificationId');
    if (fromQuery != null && String(fromQuery).trim()) return String(fromQuery).trim();
  } catch {
    /* ignore */
  }
  const fromState = state?.corvexHighlight?.id;
  if (fromState != null && String(fromState).trim()) return String(fromState).trim();
  return null;
}

export function readHighlightNotificationId(state = null) {
  const id = state?.corvexHighlight?.notificationId;
  if (id == null || id === '') return null;
  return String(id);
}

/** Ensure deep-link paths carry a highlight query when an id is known. */
export function withHighlightParam(path, id) {
  if (!path || id == null || id === '') return path;
  const value = encodeURIComponent(String(id));
  try {
    const url = new URL(path, 'http://corvex.local');
    if (!url.searchParams.get('highlight')) url.searchParams.set('highlight', String(id));
    if (!url.searchParams.get('id') && !url.searchParams.get('verificationId')) {
      url.searchParams.set('id', String(id));
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const join = path.includes('?') ? '&' : '?';
    if (/[?&]highlight=/.test(path)) return path;
    return `${path}${join}highlight=${value}`;
  }
}

export function navigateWithHighlight(navigate, path, { id = null, notificationId = null } = {}) {
  if (!navigate || !path) return;
  const target = id != null && id !== '' ? withHighlightParam(path, id) : path;
  navigate(target, {
    state: {
      corvexHighlight: {
        id: id != null && id !== '' ? String(id) : null,
        notificationId: notificationId != null ? String(notificationId) : null,
        at: Date.now(),
      },
    },
  });
}

export function recordKey(entity, id) {
  if (entity == null || id == null || id === '') return null;
  return `${entity}:${id}`;
}

/** Best-effort related record id from a notification row (API or mapped). */
export function relatedIdFromNotification(item) {
  if (!item) return null;
  const raw = item.related_id ?? item.relatedId ?? item.highlightId;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  try {
    const params = new URLSearchParams(String(item.relatedTo || '').split('?')[1] || '');
    const fromPath = params.get('highlight') || params.get('id') || params.get('verificationId');
    if (fromPath) return String(fromPath).trim();
  } catch {
    /* ignore */
  }
  const path = String(item.relatedTo || '');
  const match = path.match(/\/(?:transfers|restock-history|stock-counts|credit-investigations|ci-approvals|invoices|receipts|customers|product|accounts|verification)\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);

  const message = `${item.title || ''} ${item.message || ''}`;
  const docRef = message.match(/\b((?:TRF|RST|SC|INV)-[A-Z0-9-]+)\b/i);
  if (docRef) return docRef[1].toUpperCase();
  const ci = message.match(/\bCI\s*#?(\d+)\b/i);
  if (ci) return ci[1];
  return null;
}

/** Case-insensitive equality for numeric ids and document refs. */
export function idsMatch(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function applyTemporaryHighlight(element, { durationMs = HIGHLIGHT_DURATION_MS } = {}) {
  if (!element) return () => {};
  element.classList.add(HIGHLIGHT_CLASS);
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  } catch {
    /* ignore */
  }
  const timer = window.setTimeout(() => {
    element.classList.remove(HIGHLIGHT_CLASS);
  }, durationMs);
  return () => {
    window.clearTimeout(timer);
    element.classList.remove(HIGHLIGHT_CLASS);
  };
}
