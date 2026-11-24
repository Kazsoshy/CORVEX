import { formatCurrency } from '../../../utils/formatters.js';
import { money } from '../../../utils/calculateSale.js';
import { customerLabel } from './CustomerSearchSelect';

export function SaleSummaryCard({
  customer,
  itemCount,
  invoiceTotal,
  payType,
  pricing,
  creditEval,
  creditLimit,
  canSubmit,
  submitting,
  submitBlockedReason,
  onSubmit,
  onCancel,
  stickyMobile = false,
}) {
  const arrangement = payType === 'installment' ? 'Installment' : 'Spot Cash';
  const amountDue = payType === 'full'
    ? (pricing?.finalObligation ?? invoiceTotal)
    : (pricing?.monthlyAmount ?? null);
  const benefit = payType === 'full'
    ? pricing?.discountAmount
    : pricing?.settlementOptions?.[0]?.discountAmount;
  const benefitLabel = payType === 'full'
    ? 'Spot cash savings'
    : 'Early-pay savings (up to)';
  const limit = money(creditLimit);
  const after = creditEval?.afterSaleOutstanding;
  const progress = limit > 0 && after != null ? Math.min(100, Math.round((after / limit) * 100)) : 0;
  const over = Boolean(creditEval?.exceeded);

  return (
    <aside className={`panel content-panel log-sale-summary-card${stickyMobile ? ' log-sale-summary-card--mobile' : ''}`}>
      <h3 style={{ marginTop: 0 }}>Sale summary</h3>
      <div className="log-sale-summary-rows">
        <div>
          <span className="muted">Customer</span>
          <strong>{customer ? customerLabel(customer) : '—'}</strong>
        </div>
        <div>
          <span className="muted">Items</span>
          <strong>{itemCount} · {formatCurrency(invoiceTotal)}</strong>
        </div>
        <div>
          <span className="muted">Arrangement</span>
          <strong>
            {arrangement}
            {amountDue != null ? ` · ${formatCurrency(amountDue)}${payType === 'installment' ? '/mo' : ' due'}` : ''}
          </strong>
        </div>
        {benefit != null && Number(benefit) > 0 ? (
          <div className="log-sale-summary-benefit">
            <span className="muted">{benefitLabel}</span>
            <strong>{formatCurrency(benefit)}</strong>
          </div>
        ) : null}
        {payType === 'installment' && limit > 0 ? (
          <div>
            <span className="muted">Credit after sale</span>
            <strong>
              {formatCurrency(after)} / {formatCurrency(limit)}
            </strong>
            <div
              className={`log-sale-credit-bar${over ? ' log-sale-credit-bar--over' : ''}`}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Credit utilization after sale"
            >
              <span style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {submitBlockedReason ? (
        <p className="form-error" style={{ marginTop: 12 }}>{submitBlockedReason}</p>
      ) : null}

      <div className="log-sale-summary-actions">
        <button
          className="button"
          type="button"
          disabled={!canSubmit || submitting}
          onClick={onSubmit}
          title={submitBlockedReason || undefined}
        >
          {submitting ? 'Submitting…' : 'Submit Sale'}
        </button>
        <button className="button secondary" type="button" disabled={submitting} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </aside>
  );
}
