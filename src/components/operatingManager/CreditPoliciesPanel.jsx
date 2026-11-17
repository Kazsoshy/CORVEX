import { useEffect, useState } from 'react';
import { fetchCreditSuggestionPolicies, saveCreditSuggestionPolicies } from '../../api/creditPoliciesService.js';

export function CreditPoliciesPanel({ showToast }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCreditSuggestionPolicies()
      .then((res) => {
        if (!cancelled && res.success) setPolicy(res.data);
        else if (!cancelled) showToast?.(res.message || 'Failed to load credit policies.', 'error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  const set = (patch) => setPolicy((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    const res = await saveCreditSuggestionPolicies(policy);
    setSaving(false);
    if (res.success) {
      setPolicy(res.data);
      showToast?.(res.message || 'Credit policies saved.', 'success');
    } else {
      showToast?.(res.message || 'Failed to save.', 'error');
    }
  };

  if (loading) return <p className="muted">Loading credit policies…</p>;
  if (!policy) return <p className="muted">Credit policies unavailable.</p>;

  return (
    <div>
      <h3>Credit Suggestion Policy</h3>
      <p className="muted">
        Org-wide knobs for first-credit suggestions. Branch Managers approve Credit Investigations for their own branch;
        Operating Managers configure the suggestion formula but do not replace BM as the day-to-day approver.
      </p>
      <div className="account-detail-grid two-up" style={{ marginTop: 12 }}>
        <div className="form-group">
          <label>Revenue fraction (0–1)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            className="filter-input"
            value={policy.revenue_fraction}
            onChange={(e) => set({ revenue_fraction: Number(e.target.value) })}
          />
          <p className="muted">Business Owner first-credit: fraction × monthly revenue − obligations.</p>
        </div>
        <div className="form-group">
          <label>Income fraction (0–1)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            className="filter-input"
            value={policy.income_fraction ?? policy.revenue_fraction}
            onChange={(e) => set({ income_fraction: Number(e.target.value) })}
          />
          <p className="muted">Employed Individual first-credit: fraction × monthly income − obligations.</p>
        </div>
        <div className="form-group">
          <label>Max first limit (₱)</label>
          <input
            type="number"
            min="1"
            className="filter-input"
            value={policy.max_first_limit}
            onChange={(e) => set({ max_first_limit: Number(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label>Min first limit (₱)</label>
          <input
            type="number"
            min="0"
            className="filter-input"
            value={policy.min_first_limit}
            onChange={(e) => set({ min_first_limit: Number(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label>Territory buffer (meters)</label>
          <input
            type="number"
            min="0"
            max="5000"
            className="filter-input"
            value={policy.territory_buffer_meters}
            onChange={(e) => set({ territory_buffer_meters: Number(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label>Offline credit cache max age (hours)</label>
          <input
            type="number"
            min="1"
            max="168"
            className="filter-input"
            value={policy.offline_credit_max_age_hours}
            onChange={(e) => set({ offline_credit_max_age_hours: Number(e.target.value) })}
          />
        </div>
        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={Boolean(policy.require_evidence_for_suggestion)}
            onChange={(e) => set({ require_evidence_for_suggestion: e.target.checked })}
          />
          Require supporting evidence before numeric suggestion
        </label>
      </div>
      <div className="flex justify-end mt-4">
        <button className="button" type="button" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save credit policies'}
        </button>
      </div>
    </div>
  );
}
