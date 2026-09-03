import { formatCurrency } from '../../data/salesMockData';

const STATUS_CLASS = {
  Active: 'status-completed',
  Inactive: 'status-inactive',
};

export function CustomerCard({ customer, onViewDetails, onLogVisit, onNavigate, showRank = false }) {
  return (
    <article className="account-card customer-card">
      <div className="account-card-header">
        <div>
          {showRank && customer.rank ? <span className="customer-rank">#{customer.rank}</span> : null}
          <h4>{customer.first_name} {customer.last_name}</h4>
          <p className="muted account-meta">Contact: {customer.contact_person_fname} {customer.contact_person_lname}</p>
        </div>
        {customer.status !== 'Inactive' ? (
          <span className={`status-badge ${STATUS_CLASS[customer.status] ?? ''}`}>{customer.status}</span>
        ) : (
          <span className="status-badge status-inactive">Inactive</span>
        )}
      </div>

      <div className="account-card-body">
        <p className="account-address">{customer.address}</p>
        <div className="account-metrics">
          <div>
            <span className="metric-label">Last Visit</span>
            <strong>{customer.lastVisitDate}</strong>
          </div>
          <div>
            <span className="metric-label">{showRank ? 'Volume (units)' : 'Total Volume'}</span>
            <strong>{showRank ? customer.purchaseVolume : formatCurrency(customer.totalPurchaseVolume || 0)}</strong>
          </div>
          {showRank ? (
            <div>
              <span className="metric-label">Distance</span>
              <strong>{customer.distanceKm} km</strong>
            </div>
          ) : (
            <div>
              <span className="metric-label">Contact</span>
              <strong className="customer-phone">{customer.phone}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="account-card-actions">
        <button className="button" type="button" onClick={() => onViewDetails(customer)}>
          View Customer
        </button>
        {onLogVisit ? (
          <button className="button secondary" type="button" onClick={() => onLogVisit(customer)}>
            Log Visit
          </button>
        ) : null}
        <button className="button ghost" type="button" onClick={() => onNavigate(customer)}>
          Open Map
        </button>
      </div>
    </article>
  );
}