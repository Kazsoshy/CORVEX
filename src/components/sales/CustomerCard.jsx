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
          <p className="muted account-meta">ID: {customer.customer_id} · Branch: {customer.branch_name || customer.branch_id}</p>
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
            <span className="metric-label">Contact Person</span>
            <strong>{customer.contact_person_fname} {customer.contact_person_lname}</strong>
          </div>
          <div>
            <span className="metric-label">Contact Phone</span>
            <strong className="customer-phone">{customer.contact_person_phone || customer.contact_phone || customer.phone}</strong>
          </div>
          <div>
            <span className="metric-label">Last Visit</span>
            <strong>{customer.lastVisitDate || 'N/A'}</strong>
          </div>
          <div>
            <span className="metric-label">{showRank ? 'Volume (units)' : 'Purchase Volume'}</span>
            <strong>{showRank ? customer.purchaseVolume : formatCurrency(customer.totalPurchaseVolume || 0)}</strong>
          </div>
          {showRank ? (
            <div>
              <span className="metric-label">Distance</span>
              <strong>{customer.distanceKm} km</strong>
            </div>
          ) : (
            <div>
              <span className="metric-label">Account Manager</span>
              <strong>{customer.account_manager_name || '—'}</strong>
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