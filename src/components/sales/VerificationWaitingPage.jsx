import { useEffect, useRef, useState } from 'react';
import { fetchIdentityVerificationById } from '../../api/salesService';
import { StatusBadge } from '../StatusBadge';
import { LoadingState } from '../shared/LoadingState';
import { EmptyState } from '../shared/EmptyState';

const POLL_MS = 5000;

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function primaryCandidate(row) {
  const candidates = row?.match_candidates_json || [];
  if (row?.primary_match_customer_id) {
    return candidates.find((c) => Number(c.customer_id) === Number(row.primary_match_customer_id))
      || candidates[0]
      || null;
  }
  return candidates[0] || null;
}

/**
 * Persistent waiting screen for SA while BM/OM decide identity / transfer.
 */
export function VerificationWaitingPage({
  navigate,
  showToast,
  verificationId: verificationIdProp,
}) {
  const verificationId = Number(verificationIdProp);
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState('');
  const handledRef = useRef(false);

  const applyOutcome = (payload) => {
    if (handledRef.current) return;
    const data = payload?.data || payload;
    const nextAction = payload?.next_action || data?.next_action;
    const customerId = data?.primary_match_customer_id;

    if (nextAction === 'open_profile' && customerId) {
      handledRef.current = true;
      try {
        sessionStorage.removeItem('corvex_pending_identity_verification');
        sessionStorage.setItem('corvex_find_done', '1');
      } catch { /* ignore */ }
      showToast?.('Identity confirmed. Opening existing customer profile.', 'success');
      navigate(`/sales/customer-detail/${customerId}?from=customers`);
      return;
    }

    if (nextAction === 'proceed_registration' && data?.clearance_token) {
      handledRef.current = true;
      try {
        sessionStorage.setItem('corvex_identity_clearance', data.clearance_token);
        sessionStorage.setItem('corvex_find_done', '1');
        sessionStorage.removeItem('corvex_pending_identity_verification');
      } catch { /* ignore */ }
      const search = data.search_payload_json || {};
      const proposed = data.proposed_registration_json || {};
      const params = new URLSearchParams({ fromFind: '1', clearance: data.clearance_token });
      const phone = proposed.contact_phone || search.contact_phone || '';
      if (phone) params.set('phone', phone);
      if (proposed.first_name) params.set('firstName', proposed.first_name);
      if (proposed.middle_name) params.set('middleName', proposed.middle_name);
      if (proposed.last_name) params.set('lastName', proposed.last_name);
      showToast?.('Branch Manager cleared the duplicate. Continue registration.', 'success');
      navigate(`/sales/customers/new?${params.toString()}`);
      return;
    }

    if (nextAction === 'transfer_rejected' || nextAction === 'cancelled') {
      handledRef.current = true;
      showToast?.(
        data?.transfer_rejection_note
          || data?.decision_note
          || 'Verification ended without registration clearance.',
        'error'
      );
    }
  };

  const refresh = async ({ silent = false } = {}) => {
    if (!Number.isInteger(verificationId) || verificationId <= 0) {
      setError('Invalid verification reference.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const res = await fetchIdentityVerificationById(verificationId);
    if (!res.success || !res.data) {
      setError(res.message || 'Could not load verification status.');
      setLoading(false);
      return;
    }
    setRow(res.data);
    setMeta({
      next_action: res.next_action,
      display_status: res.display_status || res.data.display_status,
      same_branch: res.same_branch,
      cross_branch: res.cross_branch,
    });
    setError('');
    setLoading(false);
    applyOutcome(res);
  };

  useEffect(() => {
    handledRef.current = false;
    refresh();
    const timer = setInterval(() => refresh({ silent: true }), POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationId]);

  if (loading && !row) return <LoadingState message="Loading verification status…" />;

  if (error && !row) {
    return (
      <div className="page">
        <section className="panel content-panel">
          <EmptyState title="Verification not found" description={error} />
          <button className="button" type="button" onClick={() => navigate('/sales/customers')}>
            Back to Customers
          </button>
        </section>
      </div>
    );
  }

  const candidate = primaryCandidate(row);
  const displayStatus = meta.display_status || row?.status || 'Pending BM Review';
  const waiting = ['wait', 'wait_transfer', null, undefined].includes(meta.next_action)
    || meta.next_action === 'wait'
    || meta.next_action === 'wait_transfer';

  return (
    <div className="page">
      <section className="panel content-panel" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Customer Identity Verification Pending</h2>
        <p>
          Your customer registration is temporarily on hold while the Branch Manager reviews
          the potential duplicate customer record.
        </p>

        <div className="panel" style={{ padding: 16, marginTop: 16 }}>
          <div className="flex flex-wrap justify-between gap-2" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>Verification Request Reference</div>
              <strong>#{row.verification_id}</strong>
            </div>
            <StatusBadge status={displayStatus} />
          </div>

          {waiting ? (
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }} aria-live="polite">
              <span className="loading-spinner" style={{ width: 18, height: 18, display: 'inline-block' }} />
              <span className="muted">Waiting for Branch Manager / transfer decision… (auto-refreshes)</span>
            </div>
          ) : null}

          <dl className="account-detail-grid two-up" style={{ margin: 0 }}>
            <div>
              <dt className="muted">Submitted</dt>
              <dd>{formatWhen(row.created_at)}</dd>
            </div>
            <div>
              <dt className="muted">Last updated</dt>
              <dd>{formatWhen(row.updated_at || row.decided_at)}</dd>
            </div>
            <div>
              <dt className="muted">Branch</dt>
              <dd>{row.branch_name || '—'}</dd>
            </div>
            <div>
              <dt className="muted">Reviewing BM</dt>
              <dd>{row.decided_by_name || 'Awaiting assignment / review'}</dd>
            </div>
          </dl>

          {candidate ? (
            <div style={{ marginTop: 16 }}>
              <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Customer being reviewed</div>
              <strong>
                {candidate.display_name
                  || [candidate.first_name, candidate.last_name].filter(Boolean).join(' ')
                  || 'Customer'}
              </strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {candidate.customer_code ? `${candidate.customer_code} · ` : ''}
                {candidate.contact_phone_masked || '—'}
                {' · '}
                {candidate.branch_name || '—'}
                {candidate.cross_branch ? ' (other branch)' : ''}
              </div>
            </div>
          ) : null}

          {row.decision_note ? (
            <p style={{ marginTop: 16 }}>
              <strong>Notes: </strong>
              {row.decision_note}
            </p>
          ) : null}

          {row.transfer_rejection_note ? (
            <p className="form-error" style={{ marginTop: 12 }}>
              Transfer rejected: {row.transfer_rejection_note}
            </p>
          ) : null}

          {row.transfer_revision_note ? (
            <p style={{ marginTop: 12 }}>
              Transfer returned for revision: {row.transfer_revision_note}
            </p>
          ) : null}
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="button ghost" type="button" onClick={() => navigate('/sales/customers')}>
            Back to Customers
          </button>
          <button className="button secondary" type="button" onClick={() => refresh()}>
            Refresh status
          </button>
        </div>
      </section>
    </div>
  );
}
