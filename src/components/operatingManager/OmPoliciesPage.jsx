import { useState } from 'react';
import { TerritoryPoliciesPanel } from '../territories/TerritoryPoliciesPanel';
import { UserPoliciesPanel } from './UserPoliciesPanel';
import { BranchPoliciesPanel } from './BranchPoliciesPanel';
import { CreditPoliciesPanel } from './CreditPoliciesPanel';

const TABS = [
  { id: 'territories', label: 'Territories' },
  { id: 'users', label: 'User Accounts' },
  { id: 'branches', label: 'Branches' },
  { id: 'credit', label: 'Credit Suggestions' },
];

/**
 * OM System Configuration — org policies hub.
 */
export function OmPoliciesPage({ showToast }) {
  const [activeTab, setActiveTab] = useState('territories');

  return (
    <div className="page settings-system">
      <header className="settings-hero" style={{ marginBottom: 16 }}>
        <div>
          <p className="settings-kicker">System Configuration</p>
          <h2>Policies</h2>
          <p className="muted">
            Org-wide rules authored by Operating Manager. Branch Managers do not edit these policies.
          </p>
        </div>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Policy domains">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={activeTab === tab.id ? 'settings-tab active' : 'settings-tab'}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'territories' ? (
        <section className="panel form-panel content-panel relative overflow-hidden">
          <TerritoryPoliciesPanel showToast={showToast} />
        </section>
      ) : null}

      {activeTab === 'users' ? (
        <section className="panel form-panel content-panel relative overflow-hidden">
          <UserPoliciesPanel showToast={showToast} />
        </section>
      ) : null}

      {activeTab === 'branches' ? (
        <section className="panel form-panel content-panel relative overflow-hidden">
          <BranchPoliciesPanel showToast={showToast} />
        </section>
      ) : null}

      {activeTab === 'credit' ? (
        <section className="panel form-panel content-panel relative overflow-hidden">
          <CreditPoliciesPanel showToast={showToast} />
        </section>
      ) : null}
    </div>
  );
}
