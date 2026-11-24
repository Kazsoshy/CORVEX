import { formatCurrency } from '../../../utils/formatters.js';
import { money, paymentStanding } from '../../../utils/calculateSale.js';
import { StatusBadge } from '../../StatusBadge';
import { InfoHint } from '../../shared/InfoHint';
import { CustomerSearchSelect, customerLabel } from './CustomerSearchSelect';

export function CustomerCard({
  formCustomerId,
  selectedCustomer,
  customerDetail,
  creditContext,
  creditEval,
  locked,
  error,
  onSelect,
  onClear,
  onAddNew,
  onViewDetails,
}) {
  const outstanding = money(customerDetail?.activity?.outstanding_balance ?? customerDetail?.outstandingBalance ?? 0);
  const creditRemaining = creditEval?.hasUsableCredit
    ? Math.max(0, money(customerDetail?.creditInfo?.credit_limit || 0) - outstanding)
    : null;
  const risk = creditContext?.risk?.level || creditContext?.pending_review?.risk_level || null;

  return (
    <section className="panel content-panel log-sale-step" aria-labelledby="log-sale-step-customer">
      <div className="log-sale-step-header">
        <span className="log-sale-step-num" aria-hidden="true">1</span>
        <div>
          <h3 id="log-sale-step-customer">Customer</h3>
          <p className="muted" style={{ margin: 0 }}>Select who this invoice is for.</p>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: customerDetail ? 10 : undefined }}>
        <label htmlFor="log-sale-customer">Customer *</label>
        <div className="log-sale-customer-row">
          <CustomerSearchSelect
            value={formCustomerId}
            selectedCustomer={selectedCustomer || customerDetail}
            locked={locked}
            onSelect={onSelect}
            onClear={onClear}
          />
          <button className="button secondary log-sale-add-customer-btn" type="button" onClick={onAddNew}>
            Add New Customer
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </div>

      {customerDetail ? (
        <div className="log-sale-customer-facts">
          <div className="log-sale-fact">
            <span className="muted">
              Credit remaining
              <InfoHint label="About available credit">
                Available credit is limit minus outstanding. Spot cash ignores the credit limit; Installment applies this sale against remaining credit.
              </InfoHint>
            </span>
            <strong>
              {creditRemaining != null ? formatCurrency(creditRemaining) : 'No credit on file'}
            </strong>
          </div>
          <div className="log-sale-fact">
            <span className="muted">Outstanding</span>
            <strong>{formatCurrency(outstanding)}</strong>
          </div>
          <div className="log-sale-fact">
            <span className="muted">Risk</span>
            <strong><StatusBadge status={risk || paymentStanding(outstanding)} /></strong>
          </div>
          <button className="button ghost log-sale-view-details-btn" type="button" onClick={onViewDetails}>
            View details
          </button>
        </div>
      ) : null}

      {selectedCustomer && !customerDetail ? (
        <p className="muted">Loading {customerLabel(selectedCustomer)}…</p>
      ) : null}
    </section>
  );
}
