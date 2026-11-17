import { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';
import { formatDisplayDate } from '../../utils/formatters.js';

const MODE_OPTIONS = [
  { value: 'off', label: 'Off', detail: 'No inactivity checks. Accounts are disabled manually only.' },
  { value: 'notify', label: 'Notify only', detail: 'Daily check notifies Operating Managers of inactive accounts. Nothing is disabled.' },
  { value: 'auto', label: 'Automatically disable', detail: 'Daily check disables inactive accounts that hold no open work, then notifies Operating Managers.' },
];

export function UserPoliciesPanel({ showToast }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/users/policies')
      .then((res) => { if (!cancelled) setPolicy(res.data?.data?.inactivity || null); })
      .catch((err) => { if (!cancelled) showToast?.(err.response?.data?.message || 'Failed to load user policies.', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  const days = Number(policy?.inactivityDays);
  const daysValid = Number.isInteger(days) && days >= 14 && days <= 730;

  useEffect(() => {
    if (!policy || !daysValid) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      apiClient.get('/users/policies/inactivity-preview', {
        params: { days, include_never_signed_in: Boolean(policy.includeNeverSignedIn) },
      })
        .then((res) => { if (!cancelled) setPreview(res.data?.data?.candidates || []); })
        .catch(() => { if (!cancelled) setPreview(null); })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [policy, days, daysValid]);

  async function handleSave() {
    if (!policy) return;
    if (policy.mode !== 'off' && !daysValid) {
      showToast?.('Set an inactivity threshold between 14 and 730 days.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.put('/users/policies', {
        inactivity: { ...policy, inactivityDays: daysValid ? days : null },
      });
      setPolicy(res.data?.data?.inactivity || policy);
      showToast?.(res.data?.message || 'User policies saved.', 'success');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to save user policies.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading user policies…</p>;
  if (!policy) return <p className="muted">User policies unavailable.</p>;

  const set = (patch) => setPolicy((prev) => ({ ...prev, ...patch }));

  return (
    <div>
      <header style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Account Inactivity</h4>
        <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
          Inactivity means no successful sign-in for the number of days below, based on each employee's last sign-in.
          Applies to branch staff only (Branch Managers, Warehouse, Sales Agents, Collectors). Accounts that still hold open
          work are never disabled automatically; they are reported for manual handover instead.
        </p>
      </header>

      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        <div className="form-group">
          <label htmlFor="up-days">Days without sign-in {policy.mode !== 'off' ? <span className="required">*</span> : null}</label>
          <input
            id="up-days"
            type="number"
            min={14}
            max={730}
            placeholder="e.g. 90"
            value={policy.inactivityDays ?? ''}
            onChange={(e) => set({ inactivityDays: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <small className="muted">No default — choose a threshold that matches company policy (14–730 days).</small>
        </div>
        <div className="form-group">
          <label>Policy mode</label>
          <div className="settings-choice settings-choice-segment" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MODE_OPTIONS.map((option) => {
              const selected = policy.mode === option.value;
              return (
                <label key={option.value} className={selected ? 'settings-choice-btn active' : 'settings-choice-btn'} style={{ flex: '1 1 140px' }}>
                  <input type="radio" name="user-policy-mode" value={option.value} checked={selected} onChange={() => set({ mode: option.value })} />
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

      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        <label className="settings-switch settings-switch-inline">
          <span>
            <strong>Include accounts that never signed in</strong>
            <small style={{ display: 'block' }}>Counts days from account creation when there is no sign-in yet.</small>
          </span>
          <input type="checkbox" checked={Boolean(policy.includeNeverSignedIn)} onChange={(e) => set({ includeNeverSignedIn: e.target.checked })} />
        </label>
        <label className="settings-switch settings-switch-inline">
          <span>
            <strong>Notify Operating Managers</strong>
            <small style={{ display: 'block' }}>In-app notification after each daily check that finds inactive accounts.</small>
          </span>
          <input type="checkbox" checked={Boolean(policy.notifyOperatingManagers)} onChange={(e) => set({ notifyOperatingManagers: e.target.checked })} />
        </label>
      </div>

      <h5 style={{ marginBottom: 8 }}>Accounts matching this threshold today</h5>
      {!daysValid ? (
        <p className="muted" style={{ fontSize: '0.88rem' }}>Enter a threshold to preview affected accounts.</p>
      ) : previewLoading ? (
        <p className="muted">Checking accounts…</p>
      ) : preview && preview.length ? (
        <div className="corvex-table-wrapper" style={{ marginBottom: 12 }}>
          <table className="corvex-table">
            <thead>
              <tr><th>Employee ID</th><th>Name</th><th>Role</th><th>Branch</th><th>Last Sign-in</th><th>Days</th><th>Open Work</th></tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.id}>
                  <td>{row.employeeId || '—'}</td>
                  <td>{row.name}</td>
                  <td>{row.role}</td>
                  <td>{row.branch || '—'}</td>
                  <td>{row.lastLogin ? formatDisplayDate(row.lastLogin) : 'Never'}</td>
                  <td>{row.daysInactive}</td>
                  <td>{row.openWork ? `${row.openWork} item(s) — will not be auto-disabled` : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '0.88rem' }}>No branch staff account has been inactive that long.</p>
      )}

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        The check runs on the CORVEX API server once a day (it does not depend on anyone having this page open). If the
        server is stopped or asleep, the check runs after it starts again. Disabled accounts keep their records and can be
        re-enabled from User Management. Every automatic change is written to the audit log.
      </p>

      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button className="button" type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save user policies'}
        </button>
      </div>
    </div>
  );
}
