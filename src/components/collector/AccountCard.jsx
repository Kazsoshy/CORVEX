import { formatCurrency } from '../../data/collectorMockData';

const STATUS_CLASS = {
  Overdue: 'status-overdue',
  Pending: 'status-pending',
  Completed: 'status-completed',
};

export function AccountCard({ account, onViewDetails, onCall, onNavigate }) {
  return (
    <article className="account-card">
      <div className="account-card-header">
        <div>
          <h4>{account.clientName}</h4>
          <p className="muted account-meta">{account.accountNumber}</p>
        </div>
        <span className={`status-badge ${STATUS_CLASS[account.status] ?? ''}`}>{account.status}</span>
      </div>

      <div className="account-card-body">
        <p className="account-address">{account.address}</p>
        <div className="account-metrics">
          <div>
            <span className="metric-label">Outstanding</span>
            <strong>{formatCurrency(account.outstandingBalance)}</strong>
          </div>
          <div>
            <span className="metric-label">Days overdue</span>
            <strong>{account.daysOverdue}</strong>
          </div>
        </div>
      </div>

      <div className="account-card-actions">
        <button className="button" type="button" onClick={() => onViewDetails(account)}>
          View Details
        </button>
        <button className="button secondary" type="button" onClick={() => onCall(account)}>
          Call Client
        </button>
        <button className="button ghost" type="button" onClick={() => onNavigate(account)}>
          Open Map
        </button>
      </div>
    </article>
  );
}
