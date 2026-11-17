import { useEffect, useState } from 'react';
import { fetchTerritoryPolicies, saveTerritoryPolicies } from '../../api/territoriesService';

const MODE_OPTIONS = [
  { value: 'off', label: 'Off', detail: 'No automatic flagging or deactivation (recommended).' },
  { value: 'flag_for_review', label: 'Flag for review', detail: 'Eligible territories are listed for BM/OM review only.' },
  { value: 'auto_deactivate', label: 'Auto-deactivate', detail: 'Reserved for a future scheduled job — not run in this release.' },
];

export function TerritoryPoliciesPanel({ showToast }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchTerritoryPolicies();
        if (!cancelled && res.success) setPolicy(res.data);
        else if (!cancelled) showToast?.(res.message || 'Failed to load territory policies.', 'error');
      } catch (err) {
        if (!cancelled) showToast?.(err.response?.data?.message || 'Failed to load territory policies.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [showToast]);

  async function handleSave() {
    if (!policy) return;
    setSaving(true);
    try {
      const res = await saveTerritoryPolicies(policy);
      if (!res.success) {
        showToast?.(res.message || 'Failed to save territory policies.', 'error');
        return;
      }
      setPolicy(res.data);
      showToast?.(res.message || 'Territory policy saved.', 'success');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to save territory policies.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading territory policies…</p>;
  if (!policy) return <p className="muted">Territory policies unavailable.</p>;

  return (
    <div>
      <header style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Territory Policies</h4>
        <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
          Only Operating Manager sets when territories may be flagged or deactivated.
          Branch Managers soft-deactivate manually from Territories until mode leaves Off and a scheduled runner is approved.
          Mode ships as Off — no silent auto-deactivate. Historical records are always preserved.
        </p>
      </header>

      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        <div className="form-group">
          <label htmlFor="tp-inactivity">Inactivity threshold (days)</label>
          <input
            id="tp-inactivity"
            type="number"
            min={1}
            max={3650}
            value={policy.inactivityDays}
            onChange={(e) => setPolicy((prev) => ({ ...prev, inactivityDays: Number(e.target.value) }))}
          />
        </div>
        <div className="form-group">
          <label>Policy mode</label>
          <div className="settings-choice settings-choice-segment" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MODE_OPTIONS.map((option) => {
              const selected = policy.mode === option.value;
              return (
                <label
                  key={option.value}
                  className={selected ? 'settings-choice-btn active' : 'settings-choice-btn'}
                  style={{ flex: '1 1 140px' }}
                >
                  <input
                    type="radio"
                    name="territory-policy-mode"
                    value={option.value}
                    checked={selected}
                    onChange={() => setPolicy((prev) => ({ ...prev, mode: option.value }))}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small style={{ display: 'block' }}>{option.detail}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <h5 style={{ marginBottom: 8 }}>What counts as usage</h5>
      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        {[
          ['assignments', 'Field assignments'],
          ['sales', 'Sales activity'],
          ['collections', 'Collections'],
          ['customerActivity', 'Customer activity'],
        ].map(([key, label]) => (
          <label key={key} className="settings-switch settings-switch-inline">
            <span><strong>{label}</strong></span>
            <input
              type="checkbox"
              checked={Boolean(policy.usageSignals?.[key])}
              onChange={(e) => setPolicy((prev) => ({
                ...prev,
                usageSignals: { ...prev.usageSignals, [key]: e.target.checked },
              }))}
            />
          </label>
        ))}
      </div>

      <h5 style={{ marginBottom: 8 }}>Deactivate blockers</h5>
      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        {[
          ['activeCustomers', 'Active customers linked'],
          ['overdueBalances', 'Overdue balances'],
          ['openAssignments', 'Open assignments'],
        ].map(([key, label]) => (
          <label key={key} className="settings-switch settings-switch-inline">
            <span><strong>{label}</strong></span>
            <input
              type="checkbox"
              checked={Boolean(policy.blockers?.[key])}
              onChange={(e) => setPolicy((prev) => ({
                ...prev,
                blockers: { ...prev.blockers, [key]: e.target.checked },
              }))}
            />
          </label>
        ))}
      </div>

      <label className="settings-switch settings-switch-inline" style={{ marginBottom: 12 }}>
        <span>
          <strong>Notify Branch Manager</strong>
          <small style={{ display: 'block' }}>When mode leaves Off, BMs can be notified of eligible territories.</small>
        </span>
        <input
          type="checkbox"
          checked={Boolean(policy.notifyBranchManager)}
          onChange={(e) => setPolicy((prev) => ({ ...prev, notifyBranchManager: e.target.checked }))}
        />
      </label>

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Historical territory records are always preserved. Auto-deactivate is configuration-only until a scheduled runner is approved.
      </p>

      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button className="button" type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save territory policies'}
        </button>
      </div>
    </div>
  );
}
