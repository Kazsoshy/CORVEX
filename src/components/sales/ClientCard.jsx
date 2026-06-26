import { formatCurrency } from '../../data/salesMockData';

const STATUS_CLASS = {
  Completed: 'status-completed',
  Pending: 'status-pending',
  Rescheduled: 'status-rescheduled',
  Inactive: 'status-inactive',
};

export function ClientCard({ client, onViewDetails, onLogVisit, onCall, onNavigate, showRank = false }) {
  return (
    <article className="account-card client-card">
      <div className="account-card-header">
        <div>
          {showRank && client.rank ? <span className="client-rank">#{client.rank}</span> : null}
          <h4>{client.clientName}</h4>
          <p className="muted account-meta">{client.businessName}</p>
        </div>
        {client.status !== 'Inactive' ? (
          <span className={`status-badge ${STATUS_CLASS[client.status] ?? ''}`}>{client.status}</span>
        ) : (
          <span className="status-badge status-inactive">Inactive</span>
        )}
      </div>

      <div className="account-card-body">
        <p className="account-address">{client.address}</p>
        <div className="account-metrics">
          <div>
            <span className="metric-label">Last Purchase</span>
            <strong>{client.lastPurchaseDate}</strong>
          </div>
          <div>
            <span className="metric-label">{showRank ? 'Volume (units)' : 'Total Volume'}</span>
            <strong>{showRank ? client.purchaseVolume : formatCurrency(client.totalPurchaseVolume)}</strong>
          </div>
          {showRank ? (
            <div>
              <span className="metric-label">Distance</span>
              <strong>{client.distanceKm} km</strong>
            </div>
          ) : (
            <div>
              <span className="metric-label">Contact</span>
              <strong className="client-phone">{client.phone}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="account-card-actions">
        <button className="button" type="button" onClick={() => onViewDetails(client)}>
          View Client
        </button>
        {onLogVisit ? (
          <button className="button secondary" type="button" onClick={() => onLogVisit(client)}>
            Log Visit
          </button>
        ) : null}
        <button className="button secondary" type="button" onClick={() => onCall(client)}>
          Call Client
        </button>
        <button className="button ghost" type="button" onClick={() => onNavigate(client)}>
          Open Map
        </button>
      </div>
    </article>
  );
}
