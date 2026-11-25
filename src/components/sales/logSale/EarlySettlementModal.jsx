import { useEffect } from 'react';
import { formatCurrency } from '../../../utils/formatters.js';

export function EarlySettlementModal({ open, options, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay modal-overlay--elevated" role="dialog" aria-modal="true" aria-labelledby="log-sale-settlement-title" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="log-sale-settlement-title">Early settlement savings</h3>
        </div>
        <p className="muted">Potential future savings only. Discounts are earned after full qualifying settlement.</p>
        <div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Timing</th>
                <th>Discount</th>
                <th>Savings</th>
                <th>Total after</th>
              </tr>
            </thead>
            <tbody>
              {(options || []).map((option) => (
                <tr key={`${option.ratePercent}-${option.timing}`}>
                  <td>{option.timing}</td>
                  <td>{option.ratePercent}%</td>
                  <td>{formatCurrency(option.discountAmount)}</td>
                  <td>{formatCurrency(option.discountedObligation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
