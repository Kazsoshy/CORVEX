import apiClient from './apiClient.js';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

function readLastActivity(token) {
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

export function consumeAuthNotice() {
  const message = sessionStorage.getItem('corvex_auth_notice');
  if (message) sessionStorage.removeItem('corvex_auth_notice');
  return message || '';
}

export function endSessionForInactivity() {
  if (!localStorage.getItem('corvex_token') && !localStorage.getItem('corvex_user')) return;
  localStorage.removeItem('corvex_user');
  localStorage.removeItem('corvex_token');
  sessionStorage.setItem(
    'corvex_auth_notice',
    'Your session ended after 15 minutes of inactivity. Sign in again.'
  );
  window.dispatchEvent(new Event('session-ended'));
}

export function startIdleSessionWatch() {
  let lastActivity = Date.now();
  let lastTouch = 0;

  const expireIfIdleOnServer = () => {
    const last = readLastActivity(localStorage.getItem('corvex_token'));
    if (last != null && Date.now() - last >= IDLE_TIMEOUT_MS) {
      endSessionForInactivity();
      return true;
    }
    return false;
  };

  if (!expireIfIdleOnServer()) {
    lastActivity = Date.now();
    lastTouch = lastActivity;
    apiClient.post('/auth/touch').catch(() => {});
  }

  const onActivity = () => {
    if (!localStorage.getItem('corvex_token')) return;
    lastActivity = Date.now();
    if (lastActivity - lastTouch < TOUCH_INTERVAL_MS) return;
    lastTouch = lastActivity;
    apiClient.post('/auth/touch').catch(() => {});
  };

  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
  const timer = window.setInterval(() => {
    expireIfIdleOnServer();
  }, 5000);

  return () => {
    events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    window.clearInterval(timer);
  };
}
