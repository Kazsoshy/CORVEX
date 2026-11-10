import apiClient from './apiClient.js';
import { logout } from './authService.js';

/**
 * Inactivity policy for every signed-in role.
 * Change these two values to retune the warning and the automatic sign-out.
 */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const IDLE_COUNTDOWN_MS = 60 * 1000;

export const IDLE_LOGOUT_NOTICE = 'Your session ended after a period of inactivity. Sign in again.';

export const LAST_ACTIVITY_KEY = 'corvex_last_activity';
export const IDLE_PROMPT_KEY = 'corvex_idle_prompt_at';

export const IDLE_PROMPT_EVENT = 'corvex-idle-prompt';
export const IDLE_CLEARED_EVENT = 'corvex-idle-cleared';

const TOUCH_INTERVAL_MS = 60 * 1000;
const ACTIVITY_WRITE_MS = 1000;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart', 'touchmove'];

let lastLocalActivity = 0;
let promptOpen = false;
let promptStartedAt = 0;
let loggingOut = false;

function hasSession() {
  try {
    return Boolean(localStorage.getItem('corvex_token'));
  } catch {
    return false;
  }
}

function readStoredActivity() {
  try {
    const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function writeStoredActivity(ts) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    /* private mode or blocked storage */
  }
}

export function clearIdleMarkers() {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(IDLE_PROMPT_KEY);
  } catch {
    /* ignore */
  }
}

/** Start a fresh idle window after a successful sign-in. */
export function stampSessionActivity(ts = Date.now()) {
  loggingOut = false;
  promptOpen = false;
  promptStartedAt = 0;
  lastLocalActivity = ts;
  writeStoredActivity(ts);
  try {
    localStorage.removeItem(IDLE_PROMPT_KEY);
  } catch {
    /* ignore */
  }
}

export function describeIdlePolicy() {
  const minutes = Math.round(IDLE_TIMEOUT_MS / 60000);
  const seconds = Math.round(IDLE_COUNTDOWN_MS / 1000);
  return `After ${minutes} minutes without activity, CORVEX asks if you are still there. You then have ${seconds} seconds to stay signed in before the session ends.`;
}

/**
 * Decide what the idle monitor should do.
 * The last real activity stamp is the source of truth, so a warning opened
 * in another tab cannot outrun a tab that is still in use. Background time counts.
 */
export function nextIdleAction({ now, lastActivity, hasSession: signedIn }) {
  if (!signedIn) return { type: 'signed-out' };
  const last = Number(lastActivity) || 0;
  if (!last) return { type: 'active', promptAt: now + IDLE_TIMEOUT_MS };
  const dueAt = last + IDLE_TIMEOUT_MS;
  if (now < dueAt) return { type: 'active', promptAt: dueAt };
  if (now >= dueAt + IDLE_COUNTDOWN_MS) return { type: 'logout', startedAt: dueAt };
  return {
    type: 'prompt',
    startedAt: dueAt,
    remainingMs: dueAt + IDLE_COUNTDOWN_MS - now,
  };
}

export function consumeAuthNotice() {
  const message = sessionStorage.getItem('corvex_auth_notice');
  if (message) sessionStorage.removeItem('corvex_auth_notice');
  return message || '';
}

/** Milliseconds left before the warning, or null when there is no sign-in. */
export function getSessionIdleRemainingMs() {
  if (!hasSession()) return null;
  if (promptOpen || readPromptStartedAt()) return 0;
  const last = Math.max(lastLocalActivity || 0, readStoredActivity());
  if (!last) return IDLE_TIMEOUT_MS;
  return Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - last));
}

export function getIdleCountdownRemainingMs() {
  const startedAt = promptStartedAt || readPromptStartedAt();
  if (!startedAt) return IDLE_COUNTDOWN_MS;
  return Math.max(0, IDLE_COUNTDOWN_MS - (Date.now() - startedAt));
}

function readPromptStartedAt() {
  try {
    const stored = Number(localStorage.getItem(IDLE_PROMPT_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function effectiveActivity() {
  return Math.max(lastLocalActivity || 0, readStoredActivity());
}

export function confirmStillHere() {
  if (!hasSession() || loggingOut) return;
  const now = Date.now();
  promptOpen = false;
  promptStartedAt = 0;
  lastLocalActivity = now;
  writeStoredActivity(now);
  try {
    localStorage.removeItem(IDLE_PROMPT_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(IDLE_CLEARED_EVENT));
  apiClient.post('/auth/touch').catch(() => {});
}

export function endIdleSession() {
  if (loggingOut) return;
  if (!hasSession()) return;
  loggingOut = true;
  promptOpen = false;
  promptStartedAt = 0;
  logout({ notice: IDLE_LOGOUT_NOTICE, broadcastEnd: true });
}

export function startIdleSessionWatch() {
  let stopped = false;
  let intervalId = 0;
  let deadlineId = 0;
  let lastTouch = 0;
  let lastWrite = 0;
  let sawSession = hasSession();

  const stopTimers = () => {
    window.clearInterval(intervalId);
    window.clearTimeout(deadlineId);
    intervalId = 0;
    deadlineId = 0;
  };

  const armDeadline = (at) => {
    window.clearTimeout(deadlineId);
    const delay = Math.max(0, at - Date.now());
    deadlineId = window.setTimeout(evaluate, delay);
  };

  const closePrompt = () => {
    if (!promptOpen && !readPromptStartedAt()) return;
    promptOpen = false;
    promptStartedAt = 0;
    try {
      localStorage.removeItem(IDLE_PROMPT_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(IDLE_CLEARED_EVENT));
  };

  const openPrompt = (startedAt) => {
    const current = readPromptStartedAt();
    if (current !== startedAt) {
      try {
        localStorage.setItem(IDLE_PROMPT_KEY, String(startedAt));
      } catch {
        /* ignore */
      }
    }
    const shouldNotify = !promptOpen;
    promptOpen = true;
    promptStartedAt = startedAt;
    if (shouldNotify) {
      window.dispatchEvent(new CustomEvent(IDLE_PROMPT_EVENT, { detail: { startedAt } }));
    }
  };

  const ensureActivityStamp = () => {
    if (!hasSession() || readStoredActivity()) return;
    const now = Date.now();
    lastLocalActivity = now;
    writeStoredActivity(now);
  };

  function evaluate() {
    if (stopped) return;
    if (!hasSession()) {
      if (promptOpen) {
        promptOpen = false;
        promptStartedAt = 0;
        window.dispatchEvent(new Event(IDLE_CLEARED_EVENT));
      }
      stopTimers();
      if (sawSession) {
        sawSession = false;
        clearIdleMarkers();
        window.dispatchEvent(new Event('session-ended'));
      }
      return;
    }
    sawSession = true;
    if (loggingOut) return;

    ensureActivityStamp();
    const now = Date.now();
    const decision = nextIdleAction({
      now,
      lastActivity: effectiveActivity(),
      hasSession: true,
    });

    if (decision.type === 'logout') {
      endIdleSession();
      stopTimers();
      return;
    }
    if (decision.type === 'prompt') {
      openPrompt(decision.startedAt);
      armDeadline(decision.startedAt + IDLE_COUNTDOWN_MS);
      return;
    }
    const last = effectiveActivity();
    if (last > readStoredActivity()) writeStoredActivity(last);
    if (promptOpen || readPromptStartedAt()) closePrompt();
    if (decision.promptAt) armDeadline(decision.promptAt);
  }

  const startTimers = () => {
    if (stopped || !hasSession()) return;
    if (!intervalId) intervalId = window.setInterval(evaluate, 1000);
    evaluate();
  };

  const onActivity = (event) => {
    if (stopped || loggingOut || !hasSession() || promptOpen) return;
    if (event && event.isTrusted === false) return;
    const now = Date.now();
    lastLocalActivity = now;
    const promptWasSet = Boolean(readPromptStartedAt());
    if (promptWasSet) {
      try {
        localStorage.removeItem(IDLE_PROMPT_KEY);
      } catch {
        /* ignore */
      }
    }
    if (promptWasSet || now - lastWrite >= ACTIVITY_WRITE_MS) {
      lastWrite = now;
      writeStoredActivity(now);
    }
    if (now - lastTouch >= TOUCH_INTERVAL_MS) {
      lastTouch = now;
      apiClient.post('/auth/touch').catch(() => {});
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') evaluate();
  };

  const onStorage = (event) => {
    if (stopped) return;
    if (event.key === 'corvex_token' && !event.newValue) {
      promptOpen = false;
      promptStartedAt = 0;
      loggingOut = false;
      sawSession = false;
      stopTimers();
      window.dispatchEvent(new Event(IDLE_CLEARED_EVENT));
      window.dispatchEvent(new Event('session-ended'));
      return;
    }
    if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
      const ts = Number(event.newValue);
      if (Number.isFinite(ts) && ts > lastLocalActivity) lastLocalActivity = ts;
    }
    if (event.key === LAST_ACTIVITY_KEY || event.key === IDLE_PROMPT_KEY || event.key === 'corvex_token') {
      if (hasSession()) startTimers();
      else evaluate();
    }
  };

  const onSignedOut = () => {
    promptOpen = false;
    promptStartedAt = 0;
    sawSession = false;
    stopTimers();
    window.dispatchEvent(new Event(IDLE_CLEARED_EVENT));
  };

  const onSignedIn = () => {
    loggingOut = false;
    promptOpen = false;
    promptStartedAt = 0;
    sawSession = true;
    const stored = readStoredActivity();
    lastLocalActivity = stored || Date.now();
    startTimers();
  };

  if (hasSession() && !readStoredActivity()) ensureActivityStamp();
  else if (readStoredActivity()) lastLocalActivity = readStoredActivity();

  if (hasSession() && readPromptStartedAt()) {
    promptOpen = false;
    promptStartedAt = 0;
  }

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, onActivity, { capture: true, passive: true });
  });
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', evaluate);
  window.addEventListener('corvex-signed-out', onSignedOut);
  window.addEventListener('corvex-session-ready', onSignedIn);

  if (hasSession()) startTimers();

  return () => {
    stopped = true;
    stopTimers();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, onActivity, { capture: true });
    });
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', evaluate);
    window.removeEventListener('corvex-signed-out', onSignedOut);
    window.removeEventListener('corvex-session-ready', onSignedIn);
  };
}
