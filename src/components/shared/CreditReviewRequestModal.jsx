import { useEffect, useState } from 'react';
import { submitSalesCreditInvestigation } from '../../api/salesService';
import { CREDIT_REVIEW_REASONS } from '../../utils/creditReview';
import { formatCustomerFullName, formatCustomerDisplayId } from '../../utils/customerDisplay';

/**
 * Lightweight SA request — reason required; limit + remarks optional.
 * System attaches financial snapshot on the server.
 */
export function CreditReviewRequestModal({
  customer,
  open,
  onClose,
  onSubmitted,
  showToast,
  defaultReason = '',
  resubmitCiId = null,
  recommendationId = null,
}) {
  const [reason, setReason] = useState(defaultReason);
  const [requestedLimit, setRequestedLimit] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason(defaultReason || '');
    setRequestedLimit('');
    setRemarks('');
    setError('');
  }, [open, defaultReason, customer?.customer_id, customer?.customerId, recommendationId, resubmitCiId]);

  if (!open || !customer) return null;

  const customerId = customer.customer_id || customer.customerId;
  const name = formatCustomerFullName(customer);
  const code = formatCustomerDisplayId(customer);
  const isResubmit = Boolean(resubmitCiId);

  const handleSubmit = async () => {
    if (!reason) {
      setError('Select a reason for this credit review.');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await submitSalesCreditInvestigation({
      customer_id: customerId,
      request_reason: reason,
      requested_credit_limit: requestedLimit !== '' ? Number(requestedLimit) : null,
      request_remarks: remarks.trim() || null,
      resubmit_ci_id: resubmitCiId || undefined,
      recommendation_id: recommendationId || customer?._recommendationId || undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      const message = result.message || 'Failed to submit credit review.';
      setError(message);
      showToast?.(message, 'error');
      if (result.data?.ci_id) {
        onSubmitted?.(result.data.ci_id, { alreadyPending: true });
      }
      return;
    }

    showToast?.(
      result.message
        || (isResubmit
          ? 'Revised credit review resubmitted for Branch Manager decision.'
          : 'Credit review submitted for Branch Manager decision.'),
      'success'
    );
    onSubmitted?.(result.data?.ci_id, { resubmitted: Boolean(result.data?.resubmitted) });
    onClose?.();
    setReason(defaultReason);
    setRequestedLimit('');
    setRemarks('');
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="credit-review-request-title" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="credit-review-request-title">
            {isResubmit ? 'Resubmit Credit Review' : 'Request Credit Review'}
          </h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {name}{code !== '—' ? ` · ${code}` : ''}
            {isResubmit ? ` · CI #${resubmitCiId}` : ''}
          </p>
        </div>
        <p className="muted">
          {isResubmit
            ? 'Update the request using the Branch Manager revision instructions. The same investigation record will return to Pending with a refreshed financial snapshot.'
            : 'Branch Manager decides the credit limit. The system attaches payment history, balances, and risk indicators automatically.'}
        </p>

        <div className="form-group">
          <label htmlFor="cr-reason">Reason *</label>
          <select
            id="cr-reason"
            className="filter-select"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
          >
            <option value="">Select reason</option>
            {CREDIT_REVIEW_REASONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="cr-limit">Requested credit limit (₱) — optional</label>
          <input
            id="cr-limit"
            type="number"
            min="0"
            step="0.01"
            placeholder="Leave blank if BM should decide"
            value={requestedLimit}
            onChange={(e) => setRequestedLimit(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="cr-remarks">Short remarks — optional</label>
          <textarea
            id="cr-remarks"
            rows={3}
            placeholder="Anything BM should know from the field"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : (isResubmit ? 'Resubmit for BM' : 'Submit for BM')}
          </button>
        </div>
      </div>
    </div>
  );
}
