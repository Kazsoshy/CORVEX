import apiClient from './apiClient.js';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const WARNING_COUNTDOWN_MS = 30 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

const ACTIVITY_KEY = 'corvex_last_activity';
const WARNING_UNTIL_KEY = 'corvex_idle_warning_until';

export const IDLE_WARNING_EVENT = 'corvex-idle-warning';
export const IDLE_WARNING_CLEARED_EVENT = 'corvex-idle-warning-cleared';

function readLastActivityFromToken(token) {
  if (!token) return null;
  try {
    const part = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    const lastActivity = Number(payload?.la);
    return Number.isFinite(lastActivity) ? lastActivity : null;
  } catch {
    return null;
  }
}

function readStoredActivity() {
  const raw = Number(localStorage.getItem(ACTIVITY_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function writeStoredActivity(ts) {
  localStorage.setItem(ACTIVITY_KEY, String(ts));
}

export function getWarningDeadline() {
  const raw = Number(localStorage.getItem(WARNING_UNTIL_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function setWarningDeadline(ts) {
  if (ts == null) localStorage.removeItem(WARNING_UNTIL_KEY);
  else localStorage.setItem(WARNING_UNTIL_KEY, String(ts));
}

export function consumeAuthNotice() {
  const message = sessionStorage.getItem('corvex_auth_notice');
  if (message) sessionStorage.removeItem('corvex_auth_notice');
  return message || '';
}

export function endSessionForInactivity() {
  if (!localStorage.getItem('corvex_token') && !localStorage.getItem('corvex_user')) return;
  localStorage.removeItem('corvex_user');
  localStorage.removeItem('corvex_token');
  localStorage.removeItem(ACTIVITY_KEY);
  localStorage.removeItem(WARNING_UNTIL_KEY);
  sessionStorage.setItem(
    'corvex_auth_notice',
    'Your session ended after 15 minutes of inactivity. Sign in again.'
  );
  window.dispatchEvent(new Event(IDLE_WARNING_CLEARED_EVENT));
  window.dispatchEvent(new Event('session-ended'));
}

/** Milliseconds left before the inactivity warning (or logout if already warning). */
export function getSessionIdleRemainingMs() {
  const warningUntil = getWarningDeadline();
  if (warningUntil != null) {
    return Math.max(0, warningUntil - Date.now());
  }
  const last = readStoredActivity() ?? readLastActivityFromToken(localStorage.getItem('corvex_token'));
  if (last == null) return null;
  return Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - last));
}

function broadcastWarningState() {
  const until = getWarningDeadline();
  if (until != null && until > Date.now()) {
    window.dispatchEvent(new CustomEvent(IDLE_WARNING_EVENT, { detail: { until } }));
  } else {
    window.dispatchEvent(new Event(IDLE_WARNING_CLEARED_EVENT));
  }
}

export function staySignedIn() {
  if (!localStorage.getItem('corvex_token')) return;
  const now = Date.now();
  writeStoredActivity(now);
  setWarningDeadline(null);
  broadcastWarningState();
  apiClient.post('/auth/touch').catch(() => {});
}

export function logoutFromIdleWarning() {
  endSessionForInactivity();
}

/**
 * Starts the shared inactivity watcher (one per tab; state synced via localStorage).
 * After 15 minutes without real user interaction, opens the warning modal with a 30s countdown.
 */
export function startIdleSessionWatch() {
  let lastTouchSent = 0;
  let warningActive = Boolean(getWarningDeadline());

  const syncActivityBaseline = () => {
    if (!localStorage.getItem('corvex_token')) return;
    if (readStoredActivity() == null) {
      const fromToken = readLastActivityFromToken(localStorage.getItem('corvex_token'));
      writeStoredActivity(fromToken || Date.now());
    }
  };

  syncActivityBaseline();

  if (localStorage.getItem('corvex_token') && !warningActive) {
    lastTouchSent = Date.now();
    apiClient.post('/auth/touch').catch(() => {});
    writeStoredActivity(Date.now());
  }

  if (warningActive) {
    broadcastWarningState();
  }

  const openWarning = () => {
    if (!localStorage.getItem('corvex_token')) return;
    const existing = getWarningDeadline();
    if (existing != null && existing > Date.now()) {
      warningActive = true;
      broadcastWarningState();
      return;
    }
    const until = Date.now() + WARNING_COUNTDOWN_MS;
    setWarningDeadline(until);
    warningActive = true;
    broadcastWarningState();
  };

  const clearWarningIfNeeded = () => {
    if (!warningActive && getWarningDeadline() == null) return;
    warningActive = false;
    setWarningDeadline(null);
    broadcastWarningState();
  };

  const tick = () => {
    if (!localStorage.getItem('corvex_token')) {
      clearWarningIfNeeded();
      return;
    }

    const warningUntil = getWarningDeadline();
    if (warningUntil != null) {
      warningActive = true;
      if (Date.now() >= warningUntil) {
        endSessionForInactivity();
        return;
      }
      broadcastWarningState();
      return;
    }

    warningActive = false;
    const last = readStoredActivity() ?? readLastActivityFromToken(localStorage.getItem('corvex_token'));
    if (last == null) return;
    if (Date.now() - last >= IDLE_TIMEOUT_MS) {
      openWarning();
    }
  };

  const onActivity = () => {
    if (!localStorage.getItem('corvex_token')) return;
    // While the warning is open, only Stay / Logout may resolve it.
    if (getWarningDeadline() != null) return;

    const now = Date.now();
    writeStoredActivity(now);
    if (now - lastTouchSent < TOUCH_INTERVAL_MS) return;
    lastTouchSent = now;
    apiClient.post('/auth/touch').catch(() => {});
  };

  const onStorage = (event) => {
    if (!event.key) return;
    if (event.key === WARNING_UNTIL_KEY || event.key === ACTIVITY_KEY) {
      warningActive = getWarningDeadline() != null;
      broadcastWarningState();
      if (warningActive && getWarningDeadline() <= Date.now()) {
        endSessionForInactivity();
      }
    }
    if (event.key === 'corvex_token' && !event.newValue) {
      clearWarningIfNeeded();
    }
  };

  const onSessionReady = () => {
    writeStoredActivity(Date.now());
    setWarningDeadline(null);
    warningActive = false;
    lastTouchSent = Date.now();
    broadcastWarningState();
  };

  const events = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'];
  events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
  window.addEventListener('storage', onStorage);
  window.addEventListener('corvex-session-ready', onSessionReady);
  const timer = window.setInterval(tick, CHECK_INTERVAL_MS);
  tick();

  return () => {
    events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('corvex-session-ready', onSessionReady);
    window.clearInterval(timer);
  };
}
