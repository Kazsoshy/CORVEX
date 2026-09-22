import { formatCurrency } from '../../data/collectorMockData';
import { StatusBadge } from '../StatusBadge';

export function AccountCard({ account, onViewDetails, onCall, onNavigate }) {
  return (
    <article className="account-card">
      <div className="account-card-header">
        <div>
          <h4>{account.customerName}</h4>
          <p className="muted account-meta">{account.accountNumber}</p>
        </div>
        <StatusBadge status={account.status} />
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
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" onClick={() => onViewDetails(account)}>
          View Details
        </button>
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => onCall(account)}>
          Call Customer
        </button>
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={() => onNavigate(account)}>
          Open Map
        </button>
      </div>
    </article>
  );
}
