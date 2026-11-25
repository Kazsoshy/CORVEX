import { useEffect } from 'react';
import { formatCurrency } from '../../../utils/formatters.js';
import { customerLabel } from './CustomerSearchSelect';

export function ConfirmSubmitModal({
  open,
  customer,
  itemCount,
  invoiceTotal,
  payType,
  pricing,
  busy,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const total = payType === 'full'
    ? (pricing?.finalObligation ?? invoiceTotal)
    : (pricing?.finalObligation ?? invoiceTotal);

  return (
    <div
      className="modal-overlay modal-overlay--elevated"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-sale-confirm-title"
      onClick={busy ? undefined : onCancel}
    >
      <div className="modal-content modal-content--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="log-sale-confirm-title">Confirm sale</h3>
        </div>
        <p className="muted modal-confirm-copy">
          Stock will be deducted and the invoice submitted for Branch Head review.
        </p>
        <dl className="confirm-modal-details">
          <div className="confirm-modal-details__row">
            <dt>Customer</dt>
            <dd>{customer ? customerLabel(customer) : '—'}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Items</dt>
            <dd>{itemCount}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Arrangement</dt>
            <dd>{payType === 'installment' ? 'Installment (Monthly)' : 'Spot Cash'}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Total</dt>
            <dd>{formatCurrency(total)}</dd>
          </div>
          {payType === 'installment' && pricing?.monthlyAmount != null ? (
            <div className="confirm-modal-details__row">
              <dt>Monthly</dt>
              <dd>
                {formatCurrency(pricing.monthlyAmount)} × {pricing.termMonths} months
              </dd>
            </div>
          ) : null}
          {payType === 'full' && pricing?.discountAmount != null ? (
            <div className="confirm-modal-details__row">
              <dt>Discount</dt>
              <dd>{formatCurrency(pricing.discountAmount)} (30%)</dd>
            </div>
          ) : null}
        </dl>
        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
            Back
          </button>
          <button className="button" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Submitting…' : 'Submit Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}
