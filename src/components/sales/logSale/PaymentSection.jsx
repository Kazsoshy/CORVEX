import { formatDisplayDate } from '../../../utils/formatters.js';
import { formatCurrency } from '../../../utils/formatters.js';
import { SpotCashSummary } from './SpotCashSummary';
import { InstallmentSummary } from './InstallmentSummary';
import { GCashSpotCashPanel } from './GCashSpotCashPanel';

function methodIsGCash(methods, paymentMethodId) {
  const method = methods.find((m) => String(m.payment_method_id) === String(paymentMethodId));
  return String(method?.method_name || '').trim().toLowerCase() === 'gcash';
}

function methodIsCash(methods, paymentMethodId) {
  const method = methods.find((m) => String(m.payment_method_id) === String(paymentMethodId));
  return String(method?.method_name || '').trim().toLowerCase() === 'cash';
}

export function PaymentSection({
  payType,
  paymentMethodId,
  paymentMethods,
  invoicesDate,
  firstDueDate,
  pricing,
  errors = {},
  creditLimitExceeded,
  overBy,
  branchPaymentSettings,
  branchPaymentLoading,
  gcashReference,
  gcashPaymentProof,
  onGcashReferenceChange,
  onGcashPaymentProofChange,
  onPayTypeChange,
  onPaymentMethodChange,
  onFirstDueDateChange,
  onOpenSchedule,
  onOpenSettlement,
  onRequestCreditReview,
}) {
  const isGCash = payType === 'full' && methodIsGCash(paymentMethods, paymentMethodId);
  const isCashPickup = payType === 'full' && methodIsCash(paymentMethods, paymentMethodId);
  return (
    <section className="panel content-panel log-sale-step" aria-labelledby="log-sale-step-payment">
      <div className="log-sale-step-header">
        <span className="log-sale-step-num" aria-hidden="true">3</span>
        <div>
          <h3 id="log-sale-step-payment">Payment</h3>
          <p className="muted" style={{ margin: 0 }}>
            {payType === 'full' ? 'Spot Cash settles today — Cash pickup or GCash.' : 'Installment terms and first due date.'}
          </p>
        </div>
      </div>

      <div className="form-group">
        <span className="muted" id="log-sale-pay-type-label">Payment arrangement *</span>
        <div className="segmented-control" role="group" aria-labelledby="log-sale-pay-type-label" style={{ marginTop: 6 }}>
          <button
            type="button"
            className={payType === 'full' ? 'segment active' : 'segment'}
            onClick={() => onPayTypeChange('full')}
          >
            Spot Cash
          </button>
          <button
            type="button"
            className={payType === 'installment' ? 'segment active' : 'segment'}
            onClick={() => onPayTypeChange('installment')}
          >
            Installment (Monthly)
          </button>
        </div>
        {errors.payType ? <p className="form-error">{errors.payType}</p> : null}
      </div>

      <div className="log-sale-payment-fields">
        <div className="form-group">
          <label htmlFor="log-sale-payment">Payment method *</label>
          <select
            id="log-sale-payment"
            className="filter-select"
            value={paymentMethodId}
            onChange={(e) => onPaymentMethodChange(e.target.value)}
          >
            <option value="">Select payment method</option>
            {paymentMethods.map((method) => (
              <option key={method.payment_method_id} value={method.payment_method_id}>
                {method.method_name}
              </option>
            ))}
          </select>
          {errors.paymentMethodId ? <p className="form-error">{errors.paymentMethodId}</p> : null}
        </div>

        <div className="form-group">
          <span className="muted">Invoice date</span>
          <strong style={{ display: 'block', marginTop: 6 }}>{formatDisplayDate(invoicesDate)}</strong>
        </div>

        {payType === 'installment' ? (
          <div className="form-group">
            <label htmlFor="log-sale-first-due">First due date *</label>
            <input
              id="log-sale-first-due"
              className="filter-input"
              type="date"
              min={invoicesDate}
              value={firstDueDate}
              onChange={(e) => onFirstDueDateChange(e.target.value)}
            />
            {errors.firstDueDate ? <p className="form-error">{errors.firstDueDate}</p> : null}
            {errors.termMonths ? <p className="form-error">{errors.termMonths}</p> : null}
          </div>
        ) : null}
      </div>

      {payType === 'full' ? (
        <>
          <SpotCashSummary pricing={pricing} />
          {isGCash ? (
            <GCashSpotCashPanel
              settings={branchPaymentSettings}
              loading={branchPaymentLoading}
              amountDue={pricing?.finalObligation}
              reference={gcashReference}
              paymentProof={gcashPaymentProof}
              error={errors.gcashReference}
              proofError={errors.gcashPaymentProof}
              onReferenceChange={onGcashReferenceChange}
              onPaymentProofChange={onGcashPaymentProofChange}
            />
          ) : null}
          {isCashPickup ? (
            <div className="log-sale-cash-pickup-note">
              <strong>Same-day collector pickup</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                After submit, Branch Manager assigns a collector to collect the full cash price today.
                The invoice stays under Branch Head review as a sale document.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <InstallmentSummary
            pricing={pricing}
            firstDueDate={firstDueDate}
            onOpenSchedule={onOpenSchedule}
            onOpenSettlement={onOpenSettlement}
          />
          {creditLimitExceeded ? (
            <div className="log-sale-credit-alert" role="alert">
              <div>
                <strong>Exceeds credit limit by {formatCurrency(overBy)}</strong>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  Reduce the cart or request a credit review before submitting this installment sale.
                </p>
              </div>
              <button className="button secondary" type="button" onClick={onRequestCreditReview}>
                Request Credit Review
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
