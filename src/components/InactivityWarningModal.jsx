import { useEffect, useState } from 'react';
import {
  IDLE_WARNING_CLEARED_EVENT,
  IDLE_WARNING_EVENT,
  getWarningDeadline,
  logoutFromIdleWarning,
  staySignedIn,
} from '../api/sessionActivity.js';

function secondsLeft(deadline) {
  if (deadline == null) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * System-wide inactivity warning: "Are you still there?"
 * Stay button shows the live countdown: Stay (30s) … Stay (0s).
 */
export function InactivityWarningModal() {
  const [deadline, setDeadline] = useState(() => getWarningDeadline());
  const [seconds, setSeconds] = useState(() => secondsLeft(getWarningDeadline()));

  useEffect(() => {
    const onWarn = (event) => {
      const until = event?.detail?.until ?? getWarningDeadline();
      setDeadline(until);
      setSeconds(secondsLeft(until));
    };
    const onClear = () => {
      setDeadline(null);
      setSeconds(0);
    };
    window.addEventListener(IDLE_WARNING_EVENT, onWarn);
    window.addEventListener(IDLE_WARNING_CLEARED_EVENT, onClear);
    return () => {
      window.removeEventListener(IDLE_WARNING_EVENT, onWarn);
      window.removeEventListener(IDLE_WARNING_CLEARED_EVENT, onClear);
    };
  }, []);

  // Timestamp-based countdown so it stays accurate when the tab is backgrounded.
  useEffect(() => {
    if (deadline == null) return undefined;
    const tick = () => {
      const left = secondsLeft(deadline);
      setSeconds(left);
      if (left <= 0) {
        logoutFromIdleWarning();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  if (deadline == null) return null;

  return (
    <div
      className="modal-overlay modal-overlay--elevated"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      aria-describedby="idle-warning-copy"
    >
      <div
        className="modal-content modal-content--sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="idle-warning-title">Are you still there?</h3>
        </div>
        <p id="idle-warning-copy" className="muted modal-confirm-copy">
          Your session will end soon due to inactivity. Choose Stay to keep working, or Logout now.
        </p>
        <div className="modal-actions">
          <button
            className="button secondary"
            type="button"
            onClick={logoutFromIdleWarning}
          >
            Logout
          </button>
          <button
            className="button"
            type="button"
            onClick={staySignedIn}
            aria-live="polite"
            aria-atomic="true"
          >
            Stay ({seconds}s)
          </button>
        </div>
      </div>
    </div>
  );
}
