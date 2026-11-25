import { useEffect } from 'react';
import { formatCurrency, formatDisplayDate } from '../../../utils/formatters.js';
import { money, paymentStanding } from '../../../utils/calculateSale.js';
import { displayCreditReviewStatus } from '../../../utils/creditReview.js';
import { StatusBadge } from '../../StatusBadge';
import { customerLabel } from './CustomerSearchSelect';

export function CustomerDetailsModal({
  open,
  customerDetail,
  creditContext,
  creditEval,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !customerDetail) return null;

  const outstanding = money(customerDetail.activity?.outstanding_balance ?? 0);
  const creditLimit = money(customerDetail.creditInfo?.credit_limit || 0);
  const creditUsed = creditLimit > 0 ? Math.min(outstanding, creditLimit) : outstanding;
  const pending = creditContext?.pending_review;

  return (
    <div className="modal-overlay modal-overlay--elevated" role="dialog" aria-modal="true" aria-labelledby="log-sale-customer-details-title" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="log-sale-customer-details-title">{customerLabel(customerDetail)}</h3>
        </div>
        <dl className="confirm-modal-details">
          <div className="confirm-modal-details__row">
            <dt>Status</dt>
            <dd><StatusBadge status={customerDetail.status || 'Active'} /></dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Phone</dt>
            <dd>{customerDetail.contact_phone || '—'}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Credit Limit</dt>
            <dd>{creditLimit > 0 ? formatCurrency(creditLimit) : 'No credit on file'}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Credit Used</dt>
            <dd>{formatCurrency(creditUsed)}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Credit Remaining</dt>
            <dd>
              {creditEval?.hasUsableCredit
                ? formatCurrency(Math.max(0, creditLimit - outstanding))
                : '—'}
            </dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Outstanding</dt>
            <dd>{formatCurrency(outstanding)}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Payment Standing</dt>
            <dd>{paymentStanding(outstanding)}</dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Credit Review</dt>
            <dd>
              {pending
                ? displayCreditReviewStatus(pending.status)
                : (creditLimit > 0 ? 'Has approved limit' : 'None')}
            </dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Last Collection</dt>
            <dd>
              {customerDetail.activity?.last_collection_date
                ? formatDisplayDate(customerDetail.activity.last_collection_date)
                : '—'}
            </dd>
          </div>
          <div className="confirm-modal-details__row">
            <dt>Last Sale</dt>
            <dd>
              {customerDetail.activity?.last_sales_visit
                ? formatDisplayDate(customerDetail.activity.last_sales_visit)
                : '—'}
            </dd>
          </div>
        </dl>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
