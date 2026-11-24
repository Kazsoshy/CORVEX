import { useEffect } from 'react';
import { formatCurrency, formatDisplayDate } from '../../../utils/formatters.js';

export function ScheduleModal({ open, schedule, onClose }) {
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
    <div className="modal-overlay modal-overlay--elevated" role="dialog" aria-modal="true" aria-labelledby="log-sale-schedule-title" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="log-sale-schedule-title">Payment schedule</h3>
        </div>
        <div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(schedule || []).map((row) => (
                <tr key={row.installmentNumber}>
                  <td>{row.installmentNumber}</td>
                  <td>{row.dueDate ? formatDisplayDate(row.dueDate) : '—'}</td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td>Scheduled</td>
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
