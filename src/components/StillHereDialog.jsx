import { useEffect, useRef, useState } from 'react';
import { getIdleCountdownRemainingMs, IDLE_COUNTDOWN_MS } from '../api/sessionActivity.js';

export function StillHereDialog({ isOpen, onStay, onLogout, onExpire }) {
  const dialogRef = useRef(null);
  const stayRef = useRef(null);
  const onExpireRef = useRef(onExpire);
  const expiredRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState(IDLE_COUNTDOWN_MS);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!isOpen) {
      expiredRef.current = false;
      return undefined;
    }

    const tick = () => {
      const ms = getIdleCountdownRemainingMs();
      setRemainingMs(ms);
      if (ms <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    stayRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const items = [...node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const progress = Math.max(0, Math.min(1, remainingMs / IDLE_COUNTDOWN_MS));

  return (
    <div
      className="modal-overlay modal-overlay--still-here"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="still-here-title"
      aria-describedby="still-here-copy"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div className="modal-content still-here-dialog" ref={dialogRef}>
        <div className="modal-header">
          <h3 id="still-here-title">Are you still there?</h3>
        </div>
        <p id="still-here-copy" className="muted modal-confirm-copy">
          You've been inactive for a while. For your security, your session will expire soon. Would you like to continue your session?
        </p>
        <div
          className="still-here-timer"
          style={{ '--still-here-progress': String(progress) }}
          role="timer"
          aria-live="off"
          aria-label={`${seconds} ${seconds === 1 ? 'second' : 'seconds'} remaining`}
        >
          <div className="still-here-timer-face">
            <span className="still-here-countdown-value">{seconds}</span>
            <span className="still-here-countdown-unit">{seconds === 1 ? 'second' : 'seconds'}</span>
          </div>
        </div>
        <p className="still-here-countdown-note">Signing out when the timer reaches zero.</p>
        <div className="modal-actions still-here-actions">
          <button ref={stayRef} className="button" type="button" onClick={onStay}>
            Stay Logged In
          </button>
          <button className="button danger" type="button" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
