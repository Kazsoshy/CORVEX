import { formatCurrency, formatDisplayDate } from '../../../utils/formatters.js';
import { purchaseBracketLabel, scheduleSumsToObligation } from '../../../utils/calculateSale.js';

export function InstallmentSummary({
  pricing,
  firstDueDate,
  onOpenSchedule,
  onOpenSettlement,
}) {
  if (!pricing || pricing.error) {
    return (
      <p className="form-error" style={{ margin: 0 }}>
        {pricing?.error || 'Add products (at least ₱1,000) to see installment terms.'}
      </p>
    );
  }

  const scheduleOk = scheduleSumsToObligation(pricing.schedule, pricing.finalObligation);
  const teaser = pricing.settlementOptions?.[0];

  return (
    <div className="log-sale-price-card">
      <h4 className="subsection-title" style={{ marginTop: 0 }}>Installment summary</h4>
      <div className="log-sale-installment-grid">
        <div>
          <span className="muted">Monthly amount</span>
          <strong>{formatCurrency(pricing.monthlyAmount)}</strong>
        </div>
        <div>
          <span className="muted">Term</span>
          <strong>{pricing.termMonths} months</strong>
        </div>
        <div>
          <span className="muted">First due</span>
          <strong>{firstDueDate ? formatDisplayDate(firstDueDate) : '—'}</strong>
        </div>
        <div>
          <span className="muted">Maturity</span>
          <strong>{pricing.maturityDate ? formatDisplayDate(pricing.maturityDate) : '—'}</strong>
        </div>
      </div>
      <div className="log-sale-price-row" style={{ marginTop: 10 }}>
        <span className="muted">Obligation total</span>
        <strong>{formatCurrency(pricing.finalObligation)}</strong>
      </div>
      <div className="log-sale-price-row">
        <span className="muted">Purchase bracket</span>
        <strong>{purchaseBracketLabel(pricing.originalTotal, pricing.termMonths)}</strong>
      </div>
      {!scheduleOk ? (
        <p className="form-error">Schedule amounts do not sum to the obligation — refresh pricing.</p>
      ) : null}
      {teaser ? (
        <p className="log-sale-teaser">
          Pay within 1 month and save up to {formatCurrency(teaser.discountAmount)}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
        <button className="button secondary" type="button" onClick={onOpenSchedule}>
          View payment schedule
        </button>
        <button className="button ghost" type="button" onClick={onOpenSettlement}>
          View early settlement savings
        </button>
      </div>
    </div>
  );
}
