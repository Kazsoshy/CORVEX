import { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';
import { formatDisplayDateTime } from '../../utils/formatters.js';

const MODE_OPTIONS = [
  {
    value: 'off',
    label: 'Off',
    detail: 'No inactivity checks. Branch Active/Inactive changes only through recorded operations or future manual admin tools.',
  },
  {
    value: 'notify',
    label: 'Notify only',
    detail: 'Daily check notifies Operating Managers of branches with no qualifying activity. Status is not changed automatically.',
  },
  {
    value: 'auto',
    label: 'Automatically set Inactive',
    detail: 'Daily check sets matching operating branches to Inactive and can reactivate them when activity resumes (if enabled).',
  },
];

export function BranchPoliciesPanel({ showToast }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/branches/policies')
      .then((res) => {
        if (!cancelled) setPolicy(res.data?.data?.inactivity || null);
      })
      .catch((err) => {
        if (!cancelled) showToast?.(err.response?.data?.message || 'Failed to load branch policies.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [showToast]);

  const months = Number(policy?.inactivityMonths);
  const monthsValid = Number.isInteger(months) && months >= 1 && months <= 36;

  useEffect(() => {
    if (!policy || !monthsValid) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      apiClient.get('/branches/policies/inactivity-preview', { params: { months } })
        .then((res) => {
          if (!cancelled) setPreview(res.data?.data?.candidates || []);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [policy, months, monthsValid]);

  async function handleSave() {
    if (!policy) return;
    if (policy.mode !== 'off' && !monthsValid) {
      showToast?.('Set an inactivity threshold between 1 and 36 months.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.put('/branches/policies', {
        inactivity: {
          ...policy,
          inactivityMonths: monthsValid ? months : null,
        },
      });
      setPolicy(res.data?.data?.inactivity || policy);
      showToast?.(res.data?.message || 'Branch policies saved.', 'success');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to save branch policies.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading branch policies…</p>;
  if (!policy) return <p className="muted">Branch policies unavailable.</p>;

  const set = (patch) => setPolicy((prev) => ({ ...prev, ...patch }));

  return (
    <div>
      <header style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Branch Inactivity</h4>
        <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
          Qualifying activity includes recorded sales invoices, collection payments, inventory restocks/transfers,
          and field activity reports by branch staff. Formal suspension or cessation is recorded separately on the
          Branch Details page and is never invented by this policy.
        </p>
      </header>

      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        <div className="form-group">
          <label htmlFor="bp-months">
            Months without qualifying activity {policy.mode !== 'off' ? <span className="required">*</span> : null}
          </label>
          <input
            id="bp-months"
            type="number"
            min={1}
            max={36}
            placeholder="e.g. 6"
            value={policy.inactivityMonths ?? ''}
            onChange={(e) => set({ inactivityMonths: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <small className="muted">Choose a threshold that matches company policy (1–36 months). No default is assumed.</small>
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
                    name="branch-policy-mode"
                    value={option.value}
                    checked={selected}
                    onChange={() => set({ mode: option.value })}
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

      <div className="account-detail-grid two-up" style={{ marginBottom: 12 }}>
        <label className="settings-switch settings-switch-inline">
          <span>
            <strong>Reactivate when activity resumes</strong>
            <small style={{ display: 'block' }}>
              Only for branches that were set Inactive by this inactivity policy (not for formal suspension/cessation).
            </small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(policy.reactivateOnActivity)}
            onChange={(e) => set({ reactivateOnActivity: e.target.checked })}
          />
        </label>
        <label className="settings-switch settings-switch-inline">
          <span>
            <strong>Notify Operating Managers</strong>
            <small style={{ display: 'block' }}>In-app notification after each daily check that finds matches.</small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(policy.notifyOperatingManagers)}
            onChange={(e) => set({ notifyOperatingManagers: e.target.checked })}
          />
        </label>
      </div>

      <h5 style={{ marginBottom: 8 }}>Branches matching this threshold today</h5>
      {!monthsValid ? (
        <p className="muted" style={{ fontSize: '0.88rem' }}>Enter a threshold to preview affected branches.</p>
      ) : previewLoading ? (
        <p className="muted">Checking branches…</p>
      ) : preview && preview.length ? (
        <div className="corvex-table-wrapper" style={{ marginBottom: 12 }}>
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Branch Code</th>
                <th>Name</th>
                <th>Last Activity</th>
                <th>Months</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontFamily: 'monospace' }}>{row.branchCode || '—'}</td>
                  <td>{row.name}</td>
                  <td>{formatDisplayDateTime(row.lastActivityAt)}</td>
                  <td>{row.monthsInactive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '0.88rem' }}>No operating branches currently exceed this threshold.</p>
      )}

      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Branch Policies'}
        </button>
      </div>
    </div>
  );
}
