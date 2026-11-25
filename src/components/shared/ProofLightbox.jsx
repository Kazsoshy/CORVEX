import { useEffect } from 'react';

export function ProofLightbox({
  open,
  src,
  title = 'Proof of payment',
  meta = null,
  onClose,
  onRetry = null,
  onDownload = null,
  error = null,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isPdf = typeof src === 'string' && (
    src.startsWith('data:application/pdf') || /\.pdf($|\?)/i.test(src)
  );

  return (
    <div
      className="modal-overlay modal-overlay--elevated"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="modal-content proof-lightbox-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        {meta ? <p className="muted" style={{ marginTop: 0 }}>{meta}</p> : null}
        {error ? (
          <div className="proof-lightbox-error" role="alert">
            <p>{error}</p>
            {onRetry ? (
              <button className="button secondary" type="button" onClick={onRetry}>Retry</button>
            ) : null}
          </div>
        ) : src ? (
          <div className="proof-lightbox-frame">
            {isPdf ? (
              <iframe title={title} src={src} className="proof-lightbox-pdf" />
            ) : (
              <img src={src} alt={title} className="proof-lightbox-img" />
            )}
          </div>
        ) : (
          <p className="muted">No proof uploaded.</p>
        )}
        <div className="modal-actions">
          {src && !error ? (
            <a
              className="button secondary"
              href={src}
              download={`payment-proof-${Date.now()}`}
              onClick={() => { onDownload?.(); }}
            >
              Download
            </a>
          ) : null}
          <button className="button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
