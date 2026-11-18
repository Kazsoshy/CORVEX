import { useState } from 'react';
import {
  requestIdentityVerification,
  requestCustomerBranchTransfer,
} from '../../api/salesService';
import { lookupCustomersForDuplicate } from '../../api/customerPortalService';
import { getCurrentUser } from '../../api/authService.js';
import { EmptyState } from '../shared/EmptyState';
import { StatusBadge } from '../StatusBadge';

function MatchCard({ match, onOpen, action }) {
  const name = match.display_name
    || match.business_name
    || [match.first_name, match.last_name].filter(Boolean).join(' ')
    || 'Customer';
  return (
    <div className="panel" style={{ padding: 12, marginBottom: 8 }}>
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <strong>{name}</strong>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {match.customer_code ? `${match.customer_code} · ` : ''}
            {match.contact_phone_masked || match.contact_phone || '—'}
            {' · '}
            {match.branch_name || '—'}
            {match.cross_branch ? ' (other branch)' : ''}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {match.status ? `Status: ${match.status} · ` : ''}
            {(match.match_reasons || [match.match_reason]).filter(Boolean).join(', ')}
            {' · '}
            <StatusBadge status={match.match_tier === 'exact' ? 'Exact Match' : 'Possible Match'} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpen ? (
            <button className="button secondary" type="button" onClick={onOpen}>Open Profile</button>
          ) : null}
          {action || null}
        </div>
      </div>
    </div>
  );
}

/**
 * Gate before registration: search for duplicates in a modal, then continue to the form.
 */
export function FindExistingCustomerModal({
  open,
  onClose,
  navigate,
  showToast,
  registerPath = '/sales/customers/new',
}) {
  const currentUser = getCurrentUser();
  const [findQuery, setFindQuery] = useState({
    phone: '',
    first_name: '',
    middle_name: '',
    last_name: '',
  });
  const [findLoading, setFindLoading] = useState(false);
  const [findResult, setFindResult] = useState(null);
  const [lookupSummary, setLookupSummary] = useState(null);
  const [identityClearanceToken, setIdentityClearanceToken] = useState('');
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [attemptKey] = useState(() => {
    try {
      const existing = sessionStorage.getItem('corvex_registration_attempt_key');
      if (existing) return existing;
      const key = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `attempt-${Date.now()}`;
      sessionStorage.setItem('corvex_registration_attempt_key', key);
      return key;
    } catch {
      return `attempt-${Date.now()}`;
    }
  });

  if (!open) return null;

  const exactMatches = (findResult || []).filter((m) => m.match_tier === 'exact');
  const possibleMatches = (findResult || []).filter((m) => m.match_tier === 'possible');
  const exactSameBranch = exactMatches.find((m) => m.same_branch);
  const exactCrossBranch = transferTarget
    || exactMatches.find((m) => m.cross_branch || m.same_branch === false);
  const canContinue = lookupSummary === 'no_match'
    || (lookupSummary === 'possible' && Boolean(identityClearanceToken));

  const buildRegisterUrl = () => {
    const params = new URLSearchParams();
    const base = registerPath.includes('?') ? registerPath.split('?')[0] : registerPath;
    const existing = registerPath.includes('?')
      ? new URLSearchParams(registerPath.slice(registerPath.indexOf('?') + 1))
      : new URLSearchParams();
    existing.forEach((value, key) => params.set(key, value));
    if (findQuery.phone.trim()) params.set('phone', findQuery.phone.trim());
    if (findQuery.first_name.trim()) params.set('firstName', findQuery.first_name.trim());
    if (findQuery.middle_name.trim()) params.set('middleName', findQuery.middle_name.trim());
    if (findQuery.last_name.trim()) params.set('lastName', findQuery.last_name.trim());
    params.set('fromFind', '1');
    if (identityClearanceToken) params.set('clearance', identityClearanceToken);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const continueToRegister = () => {
    try {
      sessionStorage.setItem('corvex_find_done', '1');
      if (identityClearanceToken) {
        sessionStorage.setItem('corvex_identity_clearance', identityClearanceToken);
      }
    } catch { /* ignore */ }
    onClose?.();
    navigate(buildRegisterUrl());
  };

  const openExistingProfile = (customerId) => {
    if (!customerId) return;
    onClose?.();
    navigate(`/sales/customer-detail/${customerId}?from=customers`);
  };

  const goToWaiting = (verificationId) => {
    try {
      sessionStorage.setItem('corvex_pending_identity_verification', String(verificationId));
    } catch { /* ignore */ }
    setVerificationSubmitted(true);
    onClose?.();
    navigate(`/sales/customers/verification/${verificationId}`);
  };

  const requestTransfer = async (match) => {
    if (!match?.customer_id) return false;
    const targetBranchId = currentUser?.branchId || currentUser?.branch_id;
    if (!targetBranchId) {
      showToast?.('Your account has no assigned branch.', 'error');
      return false;
    }
    setTransferBusy(true);
    try {
      const res = await requestCustomerBranchTransfer(match.customer_id, {
        target_branch_id: Number(targetBranchId),
        reason: 'Sales Agent found existing customer in another branch during registration.',
      });
      if (res.success) {
        showToast?.(res.message || 'Branch transfer requested for Source BM → OM approval.', 'success');
        return true;
      }
      if (res.status === 409) {
        showToast?.(res.message || 'A branch transfer is already in progress for this customer.', 'error');
        return false;
      }
      showToast?.(res.message || 'Could not request branch transfer.', 'error');
      return false;
    } finally {
      setTransferBusy(false);
    }
  };

  const runFindLookup = async () => {
    const phone = findQuery.phone.trim();
    const firstName = findQuery.first_name.trim();
    const middleName = findQuery.middle_name.trim();
    const lastName = findQuery.last_name.trim();
    const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
    if (!phone && !firstName && !lastName && !middleName) {
      showToast?.('Enter a mobile number and/or customer name to search.', 'error');
      return;
    }
    setFindLoading(true);
    setIdentityClearanceToken('');
    setVerificationSubmitted(false);
    setTransferTarget(null);
    try {
      const res = await lookupCustomersForDuplicate({
        contact_phone: phone || undefined,
        name: name || undefined,
      });
      const matches = res.success ? (res.data || []) : [];
      const summary = res.summary || (matches.some((m) => m.match_tier === 'exact')
        ? 'exact'
        : matches.length ? 'possible' : 'no_match');
      setFindResult(matches);
      setLookupSummary(summary);

      const exactSame = matches.find((m) => m.match_tier === 'exact' && m.same_branch);
      if (summary === 'exact' && exactSame?.customer_id) {
        showToast?.('Existing customer found — opening profile.', 'success');
        openExistingProfile(exactSame.customer_id);
      }
    } finally {
      setFindLoading(false);
    }
  };

  const requestBmVerification = async () => {
    if (verificationBusy || verificationSubmitted) return;
    setVerificationBusy(true);
    setVerificationSubmitted(true);
    try {
      const searchName = [
        findQuery.first_name.trim(),
        findQuery.middle_name.trim(),
        findQuery.last_name.trim(),
      ].filter(Boolean).join(' ');
      const res = await requestIdentityVerification({
        registration_attempt_key: attemptKey,
        search: {
          contact_phone: findQuery.phone.trim(),
          name: searchName,
          registration_attempt_key: attemptKey,
        },
        proposed_registration: {
          first_name: findQuery.first_name.trim(),
          middle_name: findQuery.middle_name.trim(),
          last_name: findQuery.last_name.trim(),
          contact_phone: findQuery.phone.trim(),
        },
        matches: possibleMatches.length ? possibleMatches : findResult,
      });
      const verificationId = res.data?.verification_id;
      if ((res.success || res.idempotent) && verificationId) {
        showToast?.(
          res.idempotent
            ? 'Existing verification restored — opening waiting screen.'
            : (res.message || 'Sent to Branch Manager for identity verification.'),
          'success'
        );
        goToWaiting(verificationId);
        return;
      }
      // Allow retry only if the server truly failed without an existing ticket.
      setVerificationSubmitted(false);
      showToast?.(res.message || 'Could not request verification.', 'error');
    } finally {
      setVerificationBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Find Existing Customer</h3>
        <p className="muted">
          Search before registering. This prevents duplicate accounts across branches.
        </p>

        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label>Mobile number</label>
            <input
              value={findQuery.phone}
              onChange={(e) => setFindQuery((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="09XXXXXXXXX"
            />
          </div>
          <div className="form-group">
            <label>First name</label>
            <input
              value={findQuery.first_name}
              onChange={(e) => setFindQuery((prev) => ({ ...prev, first_name: e.target.value }))}
              placeholder="Juan"
            />
          </div>
          <div className="form-group">
            <label>Middle name</label>
            <input
              value={findQuery.middle_name}
              onChange={(e) => setFindQuery((prev) => ({ ...prev, middle_name: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="form-group">
            <label>Last name</label>
            <input
              value={findQuery.last_name}
              onChange={(e) => setFindQuery((prev) => ({ ...prev, last_name: e.target.value }))}
              placeholder="Dela Cruz"
            />
          </div>
        </div>

        <button className="button" type="button" disabled={findLoading} onClick={runFindLookup}>
          {findLoading ? 'Searching…' : 'Search'}
        </button>

        {lookupSummary === 'no_match' ? (
          <div style={{ marginTop: 16 }}>
            <EmptyState
              title="No existing customer found"
              description="Registration can proceed with your assigned branch and territory."
            />
          </div>
        ) : null}

        {lookupSummary === 'exact' && exactSameBranch ? (
          <div style={{ marginTop: 16 }}>
            <p className="form-error">
              Exact match in your branch. Opening the existing customer profile — do not create a duplicate.
            </p>
            {exactMatches.filter((m) => m.same_branch).map((m) => (
              <MatchCard
                key={m.customer_id}
                match={m}
                onOpen={() => openExistingProfile(m.customer_id)}
              />
            ))}
          </div>
        ) : null}

        {lookupSummary === 'exact' && !exactSameBranch && exactCrossBranch ? (
          <div style={{ marginTop: 16 }}>
            <p className="form-error">
              This customer already has an account under another branch.
              Request a branch transfer — do not create another customer record.
            </p>
            {(transferTarget ? [transferTarget] : exactMatches.filter((m) => m.cross_branch || m.same_branch === false)).map((m) => (
              <MatchCard
                key={m.customer_id}
                match={m}
                action={(
                  <button
                    className="button"
                    type="button"
                    disabled={transferBusy}
                    onClick={() => requestTransfer(m)}
                  >
                    {transferBusy ? 'Requesting…' : 'Request Branch Transfer'}
                  </button>
                )}
              />
            ))}
          </div>
        ) : null}

        {lookupSummary === 'possible' ? (
          <div style={{ marginTop: 16 }}>
            {identityClearanceToken ? (
              <p className="muted">
                Branch Manager confirmed a different person. Duplicate flag cleared — you may continue registration.
              </p>
            ) : (
              <p className="form-error">
                Potential duplicate found. Registration is on hold until the Branch Manager reviews this possible match.
              </p>
            )}
            {possibleMatches.map((m) => (
              <MatchCard key={m.customer_id} match={m} />
            ))}
            {!identityClearanceToken ? (
              <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                <button
                  className="button"
                  type="button"
                  disabled={verificationBusy || verificationSubmitted}
                  onClick={requestBmVerification}
                >
                  {verificationBusy || verificationSubmitted
                    ? 'Submitting…'
                    : 'Request BM Verification'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="button ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="button"
            type="button"
            disabled={!canContinue}
            onClick={continueToRegister}
          >
            {lookupSummary === 'no_match' ? 'Continue Registration' : 'Continue to Registration'}
          </button>
        </div>
      </div>
    </div>
  );
}
