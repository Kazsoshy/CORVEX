import { useEffect, useId } from 'react';

/**
 * Shared confirmation dialog using CORVEX modal-overlay patterns.
 */
export function ConfirmModal({
  open,
  title,
  description,
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  busy = false,
  busyLabel = 'Submitting…',
  onConfirm,
  onCancel,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === 'Escape' && !busy) onCancel?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClass = confirmTone === 'danger'
    ? 'button danger'
    : confirmTone === 'secondary'
      ? 'button secondary'
      : 'button';

  return (
    <div
      className="modal-overlay modal-overlay--elevated"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="modal-content modal-content--sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
        </div>
        {description ? (
          <p className="muted modal-confirm-copy">{description}</p>
        ) : null}
        {details.length ? (
          <dl className="confirm-modal-details">
            {details.map((row) => (
              <div
                key={row.label}
                className={row.fullWidth ? 'confirm-modal-details__row confirm-modal-details__row--full' : 'confirm-modal-details__row'}
              >
                <dt>{row.label}</dt>
                <dd>{row.value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={confirmClass} type="button" disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
