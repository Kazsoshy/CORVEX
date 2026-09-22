import { formatCustomerDisplayId, formatPurchaseVolumeUnits } from '../../utils/customerDisplay';
import { formatDisplayDateTime } from '../../utils/formatters';

const STATUS_CLASS = {
  Active: 'status-completed',
  Inactive: 'status-inactive',
};

function resolvePurchaseVolumeUnits(customer) {
  return Number(
    customer.purchaseVolumeUnits
    ?? customer.purchasevolumeunits
    ?? customer.purchaseVolume
    ?? 0,
  );
}

export function CustomerCard({ customer, onViewDetails, onLogVisit, onNavigate, showRank = false }) {
  const displayId = formatCustomerDisplayId(customer);
  const primaryContact = `${customer.contact_person_fname || ''} ${customer.contact_person_lname || ''}`.trim() || '—';
  const secondaryContact = `${customer.secondary_contact_fname || ''} ${customer.secondary_contact_lname || ''}`.trim();

  return (
    <article className="account-card customer-card">
      <div className="account-card-header">
        <div>
          {showRank && customer.rank ? <span className="customer-rank">#{customer.rank}</span> : null}
          <h4>{customer.first_name} {customer.last_name}</h4>
          <p className="muted account-meta">{displayId} · {customer.branch_name || customer.branch_id}</p>
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
            <span className="metric-label">Territory</span>
            <strong>{customer.territory_name || '—'}</strong>
          </div>
          <div>
            <span className="metric-label">Primary Contact</span>
            <strong>{primaryContact}</strong>
            {customer.contact_person_relationship ? (
              <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>{customer.contact_person_relationship}</span>
            ) : null}
          </div>
          {secondaryContact ? (
            <div>
              <span className="metric-label">Secondary Contact</span>
              <strong>{secondaryContact}</strong>
              {customer.secondary_contact_relationship ? (
                <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>{customer.secondary_contact_relationship}</span>
              ) : null}
            </div>
          ) : null}
          <div>
            <span className="metric-label">Last Visit</span>
            <strong>{customer.lastVisitDate || 'N/A'}</strong>
          </div>
          {customer.activityUpdatedAt ? (
            <div>
              <span className="metric-label">Activity Updated</span>
              <strong>{formatDisplayDateTime(customer.activityUpdatedAt)}</strong>
            </div>
          ) : null}
          <div>
            <span className="metric-label">{showRank ? 'Volume (units)' : 'Purchase Volume'}</span>
            <strong>{showRank ? customer.purchaseVolume : formatPurchaseVolumeUnits(resolvePurchaseVolumeUnits(customer))}</strong>
          </div>
          {!showRank ? (
            <div>
              <span className="metric-label">Account Manager</span>
              <strong>{customer.account_manager_name || '—'}</strong>
            </div>
          ) : (
            <div>
              <span className="metric-label">Distance</span>
              <strong>{customer.distanceKm} km</strong>
            </div>
          )}
        </div>
      </div>

      <div className="account-card-actions">
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" onClick={() => onViewDetails(customer)}>
          View Customer
        </button>
        {onLogVisit ? (
          <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => onLogVisit(customer)}>
            Log Visit
          </button>
        ) : null}
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={() => onNavigate(customer)}>
          Open Map
        </button>
      </div>
    </article>
  );
}
