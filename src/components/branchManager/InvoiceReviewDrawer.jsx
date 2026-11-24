import { useEffect, useMemo, useState } from 'react';
import { fetchPendingSalesInvoiceById } from '../../api/approvalsService';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { ProofLightbox } from '../shared/ProofLightbox';
import { ConfirmModal } from '../shared/ConfirmModal';

function money(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function earlySettlementOptions(termMonths) {
  const matrix = {
    4: [{ ratePercent: 20, timing: 'Within 1 month' }, { ratePercent: 15, timing: 'Within 2 months' }, { ratePercent: 10, timing: 'Within 3 months' }, { ratePercent: 5, timing: 'Original maturity date' }],
    5: [{ ratePercent: 25, timing: 'Within 1 month' }, { ratePercent: 20, timing: 'Within 2 months' }, { ratePercent: 15, timing: 'Within 3 months' }, { ratePercent: 10, timing: 'Within 4 months' }, { ratePercent: 5, timing: 'Original maturity date' }],
    6: [{ ratePercent: 25, timing: 'Within 1 month' }, { ratePercent: 20, timing: 'Within 2 months' }, { ratePercent: 15, timing: 'Within 3 months' }, { ratePercent: 10, timing: '4th or 5th month' }, { ratePercent: 5, timing: 'Original maturity date' }],
    7: [{ ratePercent: 25, timing: 'Within 1 month' }, { ratePercent: 20, timing: 'Within 2 months' }, { ratePercent: 15, timing: '3rd or 4th month' }, { ratePercent: 10, timing: '5th or 6th month' }, { ratePercent: 5, timing: 'Original maturity date' }],
  };
  return matrix[Number(termMonths)] || [];
}

function arrangementLabel(inv) {
  const payType = String(inv?.pay_type || '').toLowerCase();
  const method = inv?.payment_method || '';
  if (payType === 'full' || inv?.payment_arrangement === 'spot_cash') {
    return `Spot Cash${method ? ` · ${method}` : ''}`;
  }
  if (payType === 'installment') {
    return `Installment${inv?.term_months ? ` · ${inv.term_months} mo` : ''}`;
  }
  return method || '—';
}

export function InvoiceReviewDrawer({
  open,
  invoiceId,
  seed = null,
  busy = false,
  onClose,
  onAcknowledge,
  onReject,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!open || !invoiceId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(seed || null);
    (async () => {
      const result = await fetchPendingSalesInvoiceById(invoiceId);
      if (cancelled) return;
      setLoading(false);
      if (result.success && result.data) {
        setDetail(result.data);
      } else if (!seed) {
        setError(result.message || 'Failed to load invoice detail.');
      }
    })();
    return () => { cancelled = true; };
  }, [open, invoiceId, seed]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !rejectOpen && !ackOpen && !proofOpen) onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, rejectOpen, ackOpen, proofOpen]);

  const inv = detail || seed;
  const isSpot = String(inv?.pay_type || '').toLowerCase() === 'full'
    || inv?.payment_arrangement === 'spot_cash';
  const items = Array.isArray(inv?.items) ? inv.items : [];
  const schedule = Array.isArray(inv?.installment_schedule) ? inv.installment_schedule : [];
  const settlement = useMemo(
    () => (inv?.term_months ? earlySettlementOptions(inv.term_months) : []),
    [inv?.term_months]
  );

  const original = money(inv?.original_total_amount ?? inv?.total_amount);
  const finalAmt = money(inv?.final_obligation ?? inv?.total_amount);
  const paid = money(inv?.payment_amount);
  const method = String(inv?.payment_method || '').toLowerCase();
  const proofRequired = isSpot && (method.includes('gcash') || method.includes('bank'));
  const hasProof = Boolean(inv?.payment_proof_image || inv?.has_payment_proof);
  const creditLimit = money(inv?.credit_limit);
  const outstanding = money(inv?.outstanding_balance);
  const remainingAfter = Math.max(0, creditLimit - outstanding - (isSpot ? 0 : finalAmt));

  const warnings = [];
  if (proofRequired && !hasProof) warnings.push('No payment proof on this GCash/bank Spot Cash sale.');
  if (isSpot && paid > 0 && Math.abs(paid - finalAmt) > 0.009) {
    warnings.push(`Amount paid (${formatCurrency(paid)}) does not match final cash price (${formatCurrency(finalAmt)}).`);
  }
  if (!isSpot && creditLimit > 0 && outstanding + finalAmt > creditLimit) {
    warnings.push('This installment sale appears to exceed the customer credit limit.');
  }

  if (!open) return null;

  return (
    <div className="drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="invoice-review-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="invoice-review-drawer__header">
          <div>
            <h3 id="invoice-review-title">Invoice {inv?.invoice_number || invoiceId}</h3>
            <p className="muted" style={{ margin: 0 }}>{arrangementLabel(inv)}</p>
          </div>
          <button className="button ghost" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="invoice-review-drawer__body">
          {loading && !inv ? <LoadingState message="Loading invoice…" /> : null}
          {error ? <p className="form-error">{error}</p> : null}

          {warnings.map((w) => (
            <div key={w} className="invoice-review-warning" role="alert">{w}</div>
          ))}

          {inv ? (
            <>
              <section className="invoice-review-section">
                <h4>Sale summary</h4>
                <dl className="payment-detail-grid">
                  <div><dt className="muted">Customer</dt><dd>{inv.customer_name}{inv.customer_code ? ` · ${inv.customer_code}` : ''}</dd></div>
                  <div><dt className="muted">Phone</dt><dd>{inv.contact_phone || '—'}</dd></div>
                  <div><dt className="muted">Sales agent</dt><dd>{inv.sales_agent_name || '—'}</dd></div>
                  <div><dt className="muted">Invoice date</dt><dd>{formatDisplayDate(inv.invoices_date)}</dd></div>
                  <div><dt className="muted">Submitted</dt><dd>{formatDisplayDateTime(inv.created_at)}</dd></div>
                  <div><dt className="muted">Status</dt><dd><StatusBadge status={inv.status || 'Pending Review'} /></dd></div>
                  <div><dt className="muted">Notes</dt><dd>{inv.notes || '—'}</dd></div>
                </dl>
              </section>

              <section className="invoice-review-section">
                <h4>Line items</h4>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th className="is-money">Unit</th>
                        <th className="is-money">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={`${item.product_id || item.product_name}-${idx}`}>
                          <td>{item.product_name}</td>
                          <td>{item.sku || '—'}</td>
                          <td>{item.quantity}</td>
                          <td className="is-money tabular-nums">{formatCurrency(item.unit_price)}</td>
                          <td className="is-money tabular-nums">{formatCurrency(item.line_total)}</td>
                        </tr>
                      ))}
                      {!items.length ? (
                        <tr><td colSpan={5} className="muted">No line items.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              {isSpot ? (
                <section className="invoice-review-section">
                  <h4>Spot Cash</h4>
                  <dl className="payment-detail-grid">
                    <div><dt className="muted">Payment arrangement</dt><dd>Spot Cash</dd></div>
                    <div><dt className="muted">Payment method</dt><dd>{inv.payment_method || '—'}</dd></div>
                    <div><dt className="muted">Original total</dt><dd className="tabular-nums">{formatCurrency(original)}</dd></div>
                    <div>
                      <dt className="muted">Spot cash discount</dt>
                      <dd className="tabular-nums">
                        {Number(inv.discount_rate) > 0
                          ? `${Math.round(Number(inv.discount_rate) * 100)}% (−${formatCurrency(inv.discount_amount)})`
                          : '—'}
                      </dd>
                    </div>
                    <div><dt className="muted">Final cash price</dt><dd><strong className="tabular-nums">{formatCurrency(finalAmt)}</strong></dd></div>
                    <div><dt className="muted">Amount paid</dt><dd className="tabular-nums">{paid > 0 ? formatCurrency(paid) : '—'}</dd></div>
                    <div><dt className="muted">Settlement</dt><dd>{inv.spot_cash_settlement || '—'}</dd></div>
                    <div><dt className="muted">Reference</dt><dd>{inv.gcash_reference || '—'}</dd></div>
                    <div><dt className="muted">Receipt</dt><dd>{inv.payment_receipt_number || '—'}</dd></div>
                  </dl>
                  <div style={{ marginTop: 10 }}>
                    <strong>Proof of payment</strong>
                    {hasProof && inv.payment_proof_image ? (
                      <div className="payment-proof-block" style={{ marginTop: 8 }}>
                        <button type="button" className="payment-proof-thumb" onClick={() => setProofOpen(true)}>
                          <img src={inv.payment_proof_image} alt="Payment proof" />
                        </button>
                        <span className="muted">Click to enlarge</span>
                      </div>
                    ) : proofRequired ? (
                      <p className="muted">No proof uploaded.</p>
                    ) : (
                      <p className="muted">Not required for {inv.payment_method || 'Cash'}.</p>
                    )}
                  </div>
                </section>
              ) : (
                <section className="invoice-review-section">
                  <h4>Installment</h4>
                  <dl className="payment-detail-grid">
                    <div><dt className="muted">Payment arrangement</dt><dd>Installment (Monthly)</dd></div>
                    <div><dt className="muted">Payment method</dt><dd>{inv.payment_method || '—'}</dd></div>
                    <div><dt className="muted">Term</dt><dd>{inv.term_months ? `${inv.term_months} months` : '—'}</dd></div>
                    <div><dt className="muted">Purchase bracket</dt><dd>{inv.purchase_bracket || '—'}</dd></div>
                    <div><dt className="muted">Monthly amount</dt><dd className="tabular-nums">{formatCurrency(inv.monthly_amount)}</dd></div>
                    <div><dt className="muted">First due date</dt><dd>{formatDisplayDate(inv.first_due_date)}</dd></div>
                    <div><dt className="muted">Maturity date</dt><dd>{formatDisplayDate(inv.original_maturity_date)}</dd></div>
                    <div><dt className="muted">Invoice total</dt><dd className="tabular-nums">{formatCurrency(finalAmt)}</dd></div>
                  </dl>
                  <div className="payment-detail-grid" style={{ marginTop: 12 }}>
                    <div><dt className="muted">Credit limit</dt><dd className="tabular-nums">{formatCurrency(creditLimit)}</dd></div>
                    <div><dt className="muted">Outstanding</dt><dd className="tabular-nums">{formatCurrency(outstanding)}</dd></div>
                    <div><dt className="muted">Remaining after sale</dt><dd className="tabular-nums">{formatCurrency(remainingAfter)}</dd></div>
                  </div>
                  <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
                    <button className="button secondary" type="button" onClick={() => setScheduleOpen((v) => !v)}>
                      {scheduleOpen ? 'Hide' : 'Show'} monthly schedule
                    </button>
                    <button className="button ghost" type="button" onClick={() => setSettlementOpen((v) => !v)}>
                      {settlementOpen ? 'Hide' : 'Show'} early-settlement discounts
                    </button>
                  </div>
                  {scheduleOpen ? (
                    <div className="corvex-table-wrapper" style={{ marginTop: 10 }}>
                      <table className="corvex-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Due date</th>
                            <th className="is-money">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map((row) => (
                            <tr key={row.installment_number}>
                              <td>{row.installment_number}</td>
                              <td>{formatDisplayDate(row.due_date)}</td>
                              <td className="is-money tabular-nums">{formatCurrency(row.scheduled_amount)}</td>
                            </tr>
                          ))}
                          {!schedule.length ? (
                            <tr><td colSpan={3} className="muted">No schedule rows.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {settlementOpen ? (
                    <div className="corvex-table-wrapper" style={{ marginTop: 10 }}>
                      <table className="corvex-table">
                        <thead>
                          <tr>
                            <th>Timing</th>
                            <th>Discount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {settlement.map((row) => (
                            <tr key={`${row.timing}-${row.ratePercent}`}>
                              <td>{row.timing}</td>
                              <td>{row.ratePercent}%</td>
                            </tr>
                          ))}
                          {!settlement.length ? (
                            <tr><td colSpan={2} className="muted">No settlement options.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              )}
            </>
          ) : null}
        </div>

        <div className="invoice-review-drawer__footer">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setRejectReason('');
              setRejectOpen(true);
            }}
          >
            Reject
          </button>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => setAckOpen(true)}
          >
            Acknowledge
          </button>
        </div>
      </aside>

      <ConfirmModal
        open={ackOpen}
        title="Acknowledge invoice?"
        description={`Confirm sale ${inv?.invoice_number || ''} for ${formatCurrency(finalAmt)}. This cannot be undone from here.`}
        confirmLabel={busy ? 'Working…' : 'Acknowledge'}
        cancelLabel="Cancel"
        busy={busy}
        onCancel={() => setAckOpen(false)}
        onConfirm={async () => {
          await onAcknowledge?.(inv?.sales_invoices_id || invoiceId);
          setAckOpen(false);
        }}
      />

      {rejectOpen ? (
        <div className="modal-overlay modal-overlay--elevated" role="dialog" aria-modal="true" onClick={() => !busy && setRejectOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject invoice?</h3>
            </div>
            <p className="muted">Provide a reason (required). The sales agent will see this note.</p>
            <textarea
              className="filter-input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              style={{ width: '100%' }}
            />
            {rejectReason.trim().length > 0 && rejectReason.trim().length < 8 ? (
              <p className="form-error">Reason must be at least 8 characters.</p>
            ) : null}
            <div className="modal-actions">
              <button className="button secondary" type="button" disabled={busy} onClick={() => setRejectOpen(false)}>Cancel</button>
              <button
                className="button danger"
                type="button"
                disabled={busy || rejectReason.trim().length < 8}
                onClick={async () => {
                  if (rejectReason.trim().length < 8) return;
                  await onReject?.(inv?.sales_invoices_id || invoiceId, rejectReason.trim());
                  setRejectOpen(false);
                }}
              >
                {busy ? 'Working…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProofLightbox
        open={proofOpen}
        src={inv?.payment_proof_image}
        title="Proof of payment"
        onClose={() => setProofOpen(false)}
      />
    </div>
  );
}

export { arrangementLabel };
