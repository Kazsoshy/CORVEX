import { useEffect, useId, useRef, useState } from 'react';

const listeners = new Set();
const queue = [];
let active = null;

function publish() {
  listeners.forEach((listener) => listener(active));
}

function openNext() {
  active = queue.shift() || null;
  publish();
}

/**
 * Ask before a create, update, delete, or status change.
 * Resolves true only when the user presses the confirm button.
 */
export function confirmAction({
  title = 'Confirm',
  message = 'Do you want to continue?',
  detail = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  warning = '',
} = {}) {
  return new Promise((resolve) => {
    const request = {
      title,
      message,
      detail: detail ? String(detail) : '',
      confirmLabel,
      cancelLabel,
      tone,
      warning,
      settled: false,
      resolve,
    };
    queue.push(request);
    if (!active) openNext();
  });
}

function finish(result) {
  if (!active || active.settled) return;
  active.settled = true;
  const { resolve } = active;
  openNext();
  resolve(result);
}

export function ConfirmHost() {
  const [request, setRequest] = useState(null);
  const cancelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    listeners.add(setRequest);
    setRequest(active);
    return () => listeners.delete(setRequest);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request]);

  if (!request) return null;

  const warning = request.warning
    || (request.tone === 'danger' ? 'This cannot be undone.' : '');

  return (
    <div
      className="modal-overlay modal-overlay--confirm"
      role="presentation"
      onClick={() => finish(false)}
    >
      <div
        className="modal-content modal-content--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={titleId}>{request.title}</h3>
        </div>
        <p className="muted modal-confirm-copy">{request.message}</p>
        {request.detail ? <p className="confirm-record">{request.detail}</p> : null}
        {warning ? <p className="confirm-warning">{warning}</p> : null}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="button secondary"
            type="button"
            onClick={() => finish(false)}
          >
            {request.cancelLabel}
          </button>
          <button
            className={request.tone === 'danger' ? 'button danger' : 'button'}
            type="button"
            onClick={() => finish(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
