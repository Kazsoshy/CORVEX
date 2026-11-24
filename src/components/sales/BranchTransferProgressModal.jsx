import { useEffect, useState } from 'react';
import { fetchBranchTransferById } from '../../api/salesService';
import { formatDisplayDateTime } from '../../utils/formatters.js';
import { formatCustomerDisplayId } from '../../utils/customerDisplay.js';
import { StatusBadge } from '../StatusBadge';
import { LoadingState } from '../shared/LoadingState';

const STORAGE_KEY = 'corvex_open_branch_transfer_id';

export function persistOpenTransferId(transferId) {
  try {
    if (transferId) sessionStorage.setItem(STORAGE_KEY, String(transferId));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function readPersistedOpenTransferId() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Persistent SA progress modal for an in-flight customer branch transfer.
 */
export function BranchTransferProgressModal({
  open,
  transferId,
  onClose,
  onOpenProfile,
  onCorrectLocation,
  showToast,
}) {
  const [loading, setLoading] = useState(false);
  const [transfer, setTransfer] = useState(null);
  const [loadError, setLoadError] = useState('');

  const reload = async () => {
    if (!transferId) return;
    setLoading(true);
    setLoadError('');
    const res = await fetchBranchTransferById(transferId);
    setLoading(false);
    if (!res.success || !res.data) {
      const message = res.message || 'Could not load transfer status.';
      setLoadError(message);
      showToast?.(message, 'error');
      return;
    }
    setTransfer(res.data);
    if (['Approved', 'Rejected', 'Cancelled'].includes(res.data.status)) {
      // Keep persistence until SA dismisses completed/rejected view.
    } else {
      persistOpenTransferId(res.data.transfer_id);
    }
  };

  useEffect(() => {
    if (!open || !transferId) return undefined;
    reload();
    const timer = setInterval(reload, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transferId]);

  if (!open) return null;

  const progress = transfer?.progress;
  const locationLabel = transfer
    ? [transfer.address_street, transfer.address_barangay, transfer.address_city, transfer.address_province]
      .filter(Boolean)
      .join(', ') || transfer.address || '—'
    : '—';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose} style={{ zIndex: 1250 }}>
      <div
        className="modal-content"
        style={{ maxWidth: 720, maxHeight: '92vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Customer Branch Transfer in Progress</h3>
        {loading && !transfer ? (
          <LoadingState message="Loading transfer…" />
        ) : loadError && !transfer ? (
          <>
            <p className="form-error">{loadError}</p>
            <p className="muted">Reference: CBT-{transferId}</p>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button" type="button" onClick={() => { reload(); }}>
                Retry
              </button>
              <button className="button ghost" type="button" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap justify-between gap-2 items-start">
              <p className="muted" style={{ margin: 0 }}>
                You can close this and return later. The same transfer will reopen — a second request will not be created.
              </p>
              {transfer?.status ? <StatusBadge status={transfer.status} /> : null}
            </div>

            <dl className="account-detail-grid two-up" style={{ marginTop: 16 }}>
              <div>
                <dt className="muted">Existing Customer ID</dt>
                <dd style={{ margin: 0 }}>{formatCustomerDisplayId(transfer)}</dd>
              </div>
              <div>
                <dt className="muted">Transfer Request Reference</dt>
                <dd style={{ margin: 0 }}>{progress?.transfer_ref || (transfer ? `CBT-${transfer.transfer_id}` : '—')}</dd>
              </div>
              <div>
                <dt className="muted">Source Branch</dt>
                <dd style={{ margin: 0 }}>{transfer?.source_branch_name || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Proposed Receiving Branch</dt>
                <dd style={{ margin: 0 }}>{transfer?.target_branch_name || '—'}</dd>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <dt className="muted">Current Customer Location</dt>
                <dd style={{ margin: 0 }}>{locationLabel}</dd>
              </div>
              <div>
                <dt className="muted">Proposed Territory</dt>
                <dd style={{ margin: 0 }}>
                  {transfer
                    ? (transfer.target_territory_name
                      || transfer.proposed_territory_name
                      || transfer.proposed_territory_id
                      || 'Pending Receiving BM')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="muted">Submission</dt>
                <dd style={{ margin: 0 }}>{formatDisplayDateTime(transfer?.created_at) || '—'}</dd>
              </div>
            </dl>

            {(transfer?.revision_note || transfer?.rejection_note) ? (
              <p className="form-error" style={{ marginTop: 12 }}>
                {transfer.rejection_note
                  ? `Rejected: ${transfer.rejection_note}`
                  : `Returned: ${transfer.revision_note}`}
              </p>
            ) : null}

            <ol style={{ marginTop: 16, paddingLeft: 18 }}>
              {(progress?.steps || []).map((step) => (
                <li key={step.key} style={{ marginBottom: 8 }}>
                  <strong>{step.label}</strong>
                  <span className="muted"> — {step.state}</span>
                </li>
              ))}
            </ol>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button ghost" type="button" onClick={() => { reload(); }}>
                Refresh Status
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  persistOpenTransferId(null);
                  onClose?.();
                }}
              >
                Close
              </button>
              {['Returned to SA', 'Needs Revision'].includes(transfer?.status) ? (
                <button className="button" type="button" onClick={() => onCorrectLocation?.(transfer)}>
                  Correct Location
                </button>
              ) : null}
              {transfer?.status === 'Approved' ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    persistOpenTransferId(null);
                    onOpenProfile?.(transfer.customer_id);
                  }}
                >
                  Open Existing Customer Profile
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
