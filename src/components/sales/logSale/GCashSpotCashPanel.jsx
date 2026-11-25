import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../../../utils/formatters.js';
import { CameraCaptureModal } from './CameraCaptureModal';

const MAX_PROOF_BYTES = 1_800_000;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

export function GCashSpotCashPanel({
  settings,
  loading,
  amountDue,
  reference,
  paymentProof,
  error,
  proofError,
  onReferenceChange,
  onPaymentProofChange,
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    if (!qrOpen) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setQrOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrOpen]);

  async function handleProofFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      onPaymentProofChange?.('', 'Choose an image file (JPG, PNG, or WebP).');
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      onPaymentProofChange?.('', 'Payment proof must be under 1.8 MB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onPaymentProofChange?.(dataUrl, null);
    } catch {
      onPaymentProofChange?.('', 'Could not read that image.');
    }
  }

  if (loading) {
    return <p className="muted">Loading branch GCash details…</p>;
  }

  if (!settings?.configured || !settings?.gcash_qr_image) {
    return (
      <div className="log-sale-gcash-panel log-sale-gcash-panel--empty" role="alert">
        <strong>Branch GCash QR is not configured</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Ask your Branch Manager to upload the branch GCash QR under Settings before you can
          complete Spot Cash GCash sales.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="log-sale-gcash-panel">
        <div className="log-sale-gcash-panel__head">
          <div>
            <h4 className="subsection-title" style={{ marginTop: 0, marginBottom: 4 }}>
              Pay via GCash
            </h4>
            <p className="muted" style={{ margin: 0 }}>
              Open the QR for the customer to scan, then enter the reference and capture payment proof.
            </p>
          </div>
          <div className="log-sale-gcash-panel__due">
            <span className="muted">Amount due</span>
            <strong>{formatCurrency(amountDue)}</strong>
          </div>
        </div>

        <div className="log-sale-gcash-actions">
          <button className="button" type="button" onClick={() => setQrOpen(true)}>
            Show GCash QR
          </button>
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            {settings.gcash_account_name || 'Branch GCash'}
            {settings.gcash_mobile ? ` · ${settings.gcash_mobile}` : ''}
          </div>
        </div>

        <div className="log-sale-gcash-meta" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="log-sale-gcash-ref">GCash reference *</label>
            <input
              id="log-sale-gcash-ref"
              className="filter-input"
              type="text"
              autoComplete="off"
              placeholder="At least 6 characters"
              value={reference}
              onChange={(e) => onReferenceChange?.(e.target.value)}
            />
            {error ? <p className="form-error">{error}</p> : null}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <span className="muted" id="log-sale-gcash-proof-label">Payment proof (recommended)</span>
            <div className="log-sale-gcash-proof-actions" aria-labelledby="log-sale-gcash-proof-label">
              <button
                className="button secondary"
                type="button"
                onClick={() => setCameraOpen(true)}
              >
                Open camera
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => galleryInputRef.current?.click()}
              >
                Upload screenshot
              </button>
              {paymentProof ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => onPaymentProofChange?.('', null)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <input
              ref={galleryInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                handleProofFile(file);
              }}
            />
            {proofError ? <p className="form-error">{proofError}</p> : null}
            {paymentProof ? (
              <div className="log-sale-gcash-proof-preview">
                <img src={paymentProof} alt="GCash payment proof" />
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '0.78rem', margin: '6px 0 0' }}>
                Use the live camera to photograph the GCash success screen, or upload a screenshot.
              </p>
            )}
          </div>
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        title="Capture GCash payment proof"
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => onPaymentProofChange?.(dataUrl, null)}
      />

      {qrOpen ? (
        <div
          className="modal-overlay modal-overlay--elevated"
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-sale-gcash-qr-title"
          onClick={() => setQrOpen(false)}
        >
          <div className="modal-content log-sale-gcash-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="log-sale-gcash-qr-title">Scan branch GCash QR</h3>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Amount due: <strong>{formatCurrency(amountDue)}</strong>
            </p>
            <div className="log-sale-gcash-qr-modal__frame">
              <img
                src={settings.gcash_qr_image}
                alt="Branch GCash QR code"
                className="log-sale-gcash-qr-modal__img"
              />
            </div>
            <div className="log-sale-gcash-qr-modal__meta">
              <div>
                <span className="muted">Account name</span>
                <strong style={{ display: 'block' }}>{settings.gcash_account_name || '—'}</strong>
              </div>
              <div>
                <span className="muted">Mobile / number</span>
                <strong style={{ display: 'block' }}>{settings.gcash_mobile || '—'}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setQrOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
