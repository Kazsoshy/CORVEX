import { useEffect, useState } from 'react';
import {
  requestCustomerBranchTransfer,
  resubmitBranchTransfer,
  fetchCustomerById,
  fetchBranchTransferById,
  fetchOpenBranchTransferForCustomer,
} from '../../api/salesService';
import { lookupCustomersForDuplicate } from '../../api/customerPortalService';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import { EmptyState } from '../shared/EmptyState';
import { RowActionMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { formatDisplayDateTime, formatCurrency } from '../../utils/formatters.js';
import { getUserBranchId } from '../branchManager/approvalCenterHelpers.js';
import { BranchTransferRequestForm } from './BranchTransferRequestForm';
import {
  BranchTransferProgressModal,
  persistOpenTransferId,
  readPersistedOpenTransferId,
} from './BranchTransferProgressModal';

function customerDisplayName(match) {
  return match?.display_name
    || match?.business_name
    || [match?.first_name, match?.last_name].filter(Boolean).join(' ')
    || 'Customer';
}

function MatchCard({ match, onOpen, action }) {
  const name = customerDisplayName(match);
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

/** Read-only profile drawer — field layout mirrors Approval Center CustomerProfileDrawer. */
function PossibleMatchProfileDrawer({ open, loading, profile, onClose }) {
  if (!open) return null;
  const name = customerDisplayName(profile);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !profile ? (
          <p className="muted">Loading customer profile…</p>
        ) : (
          <>
            <div className="flex flex-wrap justify-between gap-2 items-start">
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>Customer Profile</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Read-only. Viewing does not clear the possible-match block or create a registration.
                </p>
              </div>
              <StatusBadge status={profile.status || 'Active'} />
            </div>
            <dl className="account-detail-grid two-up" style={{ marginTop: 16 }}>
              <div>
                <dt className="muted">Customer</dt>
                <dd style={{ margin: 0 }}><strong>{name}</strong></dd>
              </div>
              <div>
                <dt className="muted">Customer code</dt>
                <dd style={{ margin: 0 }}>{profile.customer_code || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Mobile</dt>
                <dd style={{ margin: 0 }}>{profile.contact_phone_masked || profile.contact_phone || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Home branch</dt>
                <dd style={{ margin: 0 }}>{profile.branch_name || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Territory</dt>
                <dd style={{ margin: 0 }}>{profile.territory_name || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Registered</dt>
                <dd style={{ margin: 0 }}>{formatDisplayDateTime(profile.created_at) || '—'}</dd>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <dt className="muted">Address</dt>
                <dd style={{ margin: 0 }}>
                  {profile.address
                    || [profile.address_street, profile.address_barangay, profile.address_city, profile.address_province]
                      .filter(Boolean)
                      .join(', ')
                    || '—'}
                </dd>
              </div>
              {(profile.match_reasons || [profile.match_reason]).filter(Boolean).length ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="muted">Match indicators</dt>
                  <dd style={{ margin: 0 }}>
                    {(profile.match_reasons || [profile.match_reason]).filter(Boolean).join(', ')}
                  </dd>
                </div>
              ) : null}
              {profile.activity?.outstanding_balance != null ? (
                <div>
                  <dt className="muted">Outstanding balance</dt>
                  <dd style={{ margin: 0 }}>
                    {formatCurrency(Number(profile.activity.outstanding_balance))}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button" type="button" onClick={onClose}>Back to Possible Matches</button>
            </div>
          </>
        )}
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
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferFormOpen, setTransferFormOpen] = useState(false);
  const [transferFormMatch, setTransferFormMatch] = useState(null);
  const [transferFormMode, setTransferFormMode] = useState('create');
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTransferId, setProgressTransferId] = useState(null);
  const [resubmitTransfer, setResubmitTransfer] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);

  useEffect(() => {
    if (!open) return;
    const persisted = readPersistedOpenTransferId();
    if (persisted) {
      setProgressTransferId(persisted);
      setProgressOpen(true);
    }
  }, [open]);

  if (!open) return null;

  const receivingBranchId = getUserBranchId(currentUser);
  const receivingBranchLabel = getUserAssignedLocation(currentUser)
    || currentUser?.branch?.name
    || currentUser?.branch_name
    || 'Assigned branch';

  const exactMatches = (findResult || []).filter((m) => m.match_tier === 'exact');
  const possibleMatches = (findResult || []).filter((m) => m.match_tier === 'possible');
  const exactSameBranch = exactMatches.find((m) => m.same_branch);
  const exactCrossBranch = transferTarget
    || exactMatches.find((m) => m.cross_branch || m.same_branch === false);
  const canContinue = lookupSummary === 'no_match';

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
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const continueToRegister = () => {
    try {
      sessionStorage.setItem('corvex_find_done', '1');
      sessionStorage.removeItem('corvex_identity_clearance');
      sessionStorage.removeItem('corvex_pending_identity_verification');
    } catch { /* ignore */ }
    onClose?.();
    navigate(buildRegisterUrl());
  };

  const openExistingProfile = (customerId) => {
    if (!customerId) return;
    onClose?.();
    navigate(`/sales/customer-detail/${customerId}?from=customers`);
  };

  const viewPossibleProfile = async (match) => {
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const res = await fetchCustomerById(match.customer_id);
      if (res.success && res.data) {
        setProfileData({
          ...res.data,
          match_reasons: match.match_reasons || [match.match_reason].filter(Boolean),
        });
      } else {
        // Cross-branch or restricted: fall back to masked lookup card from search.
        setProfileData(match);
        if (res.status && res.status !== 403) {
          showToast?.(res.message || 'Showing search card only — full profile unavailable.', 'info');
        }
      }
    } catch {
      setProfileData(match);
    } finally {
      setProfileLoading(false);
    }
  };

  const openTransferProgress = (transferId) => {
    if (!transferId) return;
    persistOpenTransferId(transferId);
    setProgressTransferId(Number(transferId));
    setProgressOpen(true);
    setTransferFormOpen(false);
  };

  const beginResubmitFromOpen = (match, openTransfer) => {
    setTransferFormMatch(match);
    setTransferFormMode('resubmit');
    setResubmitTransfer(openTransfer);
    setTransferFormOpen(true);
  };

  const beginTransferRequest = async (match) => {
    if (!match?.customer_id) return;
    if (!receivingBranchId) {
      showToast?.('Your account has no assigned branch.', 'error');
      return;
    }

    const openRes = await fetchOpenBranchTransferForCustomer(match.customer_id);
    if (openRes.success && openRes.data?.transfer_id) {
      const openTransfer = openRes.data;
      if (['Returned to SA', 'Needs Revision'].includes(String(openTransfer.status))) {
        showToast?.('Correct the location and resubmit this transfer.', 'info');
        beginResubmitFromOpen(match, openTransfer);
        return;
      }
      showToast?.('A branch transfer is already in progress — opening status.', 'info');
      openTransferProgress(openTransfer.transfer_id);
      return;
    }

    const persisted = readPersistedOpenTransferId();
    if (persisted) {
      const existing = await fetchBranchTransferById(persisted);
      if (existing.success && existing.data
        && Number(existing.data.customer_id) === Number(match.customer_id)
        && !['Approved', 'Rejected', 'Cancelled'].includes(existing.data.status)) {
        if (['Returned to SA', 'Needs Revision'].includes(String(existing.data.status))) {
          beginResubmitFromOpen(match, existing.data);
          return;
        }
        showToast?.('Opening existing transfer in progress.', 'info');
        openTransferProgress(persisted);
        return;
      }
    }
    setTransferFormMatch(match);
    setTransferFormMode('create');
    setResubmitTransfer(null);
    setTransferFormOpen(true);
  };

  const submitTransferForm = async (payload) => {
    setTransferBusy(true);
    try {
      if (transferFormMode === 'resubmit' && resubmitTransfer?.transfer_id) {
        const res = await resubmitBranchTransfer(resubmitTransfer.transfer_id, payload);
        if (res.success) {
          showToast?.(res.message || 'Transfer resubmitted.', 'success');
          openTransferProgress(res.data?.transfer_id || resubmitTransfer.transfer_id);
          return;
        }
        showToast?.(res.message || 'Could not resubmit transfer.', 'error');
        return;
      }
      const customerId = transferFormMatch?.customer_id;
      const res = await requestCustomerBranchTransfer(customerId, payload);
      if (res.success) {
        showToast?.(res.message || 'Branch transfer requested.', 'success');
        openTransferProgress(res.data?.transfer_id);
        return;
      }
      const conflict = res.status === 409
        || res.code === 'TRANSFER_IN_PROGRESS'
        || /already in progress|uq_customer_branch_transfers_open/i.test(String(res.message || ''));
      if (conflict) {
        let transferId = res.data?.transfer_id;
        if (!transferId && customerId) {
          const openRes = await fetchOpenBranchTransferForCustomer(customerId);
          transferId = openRes.data?.transfer_id;
          if (openRes.data && ['Returned to SA', 'Needs Revision'].includes(String(openRes.data.status))) {
            showToast?.('Correct the location and resubmit this transfer.', 'info');
            beginResubmitFromOpen(transferFormMatch, openRes.data);
            return;
          }
        }
        if (transferId) {
          showToast?.('A branch transfer is already in progress — opening status.', 'info');
          openTransferProgress(transferId);
          return;
        }
      }
      showToast?.(res.message || 'Could not request branch transfer.', 'error');
    } finally {
      setTransferBusy(false);
    }
  };

  const runFindLookup = async () => {
    const phone = findQuery.phone.trim();
    const firstName = findQuery.first_name.trim();
    const middleName = findQuery.middle_name.trim();
    const lastName = findQuery.last_name.trim();
    if (!phone && !firstName && !lastName && !middleName) {
      showToast?.('Enter a mobile number and/or customer name to search.', 'error');
      return;
    }
    setFindLoading(true);
    setTransferTarget(null);
    setProfileOpen(false);
    setProfileData(null);
    try {
      const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
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

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: lookupSummary === 'possible' ? 820 : 640 }}
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
                    onClick={() => beginTransferRequest(m)}
                  >
                    Request Branch Transfer
                  </button>
                )}
              />
            ))}
          </div>
        ) : null}

        {lookupSummary === 'possible' ? (
          <div style={{ marginTop: 16 }}>
            <p className="form-error">
              Possible matches found. Registration cannot continue. Review the profiles below —
              if one is the same person, open their existing account or request a branch transfer from Exact Match flow after refining your search.
            </p>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Mobile</th>
                    <th>Home Branch</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {possibleMatches.map((m) => (
                    <tr key={m.customer_id}>
                      <td>{customerDisplayName(m)}</td>
                      <td>{m.customer_code || '—'}</td>
                      <td>{m.contact_phone_masked || m.contact_phone || '—'}</td>
                      <td>{m.branch_name || '—'}{m.cross_branch ? ' (other)' : ''}</td>
                      <td><StatusBadge status={m.status || 'Active'} /></td>
                      <td>
                        <RowActionMenu
                          label={`Actions for ${customerDisplayName(m)}`}
                          items={[
                            {
                              key: 'view',
                              label: 'View Profile',
                              onSelect: () => viewPossibleProfile(m),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="button ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="button"
            type="button"
            disabled={!canContinue}
            onClick={continueToRegister}
            title={lookupSummary === 'possible' ? 'Clear possible matches before registering' : undefined}
          >
            Continue Registration
          </button>
        </div>
      </div>

      <PossibleMatchProfileDrawer
        open={profileOpen}
        loading={profileLoading}
        profile={profileData}
        onClose={() => {
          setProfileOpen(false);
          setProfileData(null);
        }}
      />

      <BranchTransferRequestForm
        open={transferFormOpen}
        match={transferFormMatch}
        receivingBranchId={receivingBranchId}
        receivingBranchLabel={receivingBranchLabel}
        mode={transferFormMode}
        busy={transferBusy}
        initialReason={resubmitTransfer?.reason || ''}
        initialLocation={resubmitTransfer ? {
          address_region: resubmitTransfer.address_region,
          address_province: resubmitTransfer.address_province,
          address_city: resubmitTransfer.address_city,
          address_barangay: resubmitTransfer.address_barangay,
          address_street: resubmitTransfer.address_street,
          latitude: resubmitTransfer.latitude,
          longitude: resubmitTransfer.longitude,
        } : null}
        showToast={showToast}
        onClose={() => setTransferFormOpen(false)}
        onSubmit={submitTransferForm}
      />

      <BranchTransferProgressModal
        open={progressOpen}
        transferId={progressTransferId}
        showToast={showToast}
        onClose={() => setProgressOpen(false)}
        onOpenProfile={(customerId) => {
          setProgressOpen(false);
          openExistingProfile(customerId);
        }}
        onCorrectLocation={(transfer) => {
          setResubmitTransfer(transfer);
          setTransferFormMatch({
            customer_id: transfer.customer_id,
            customer_code: transfer.customer_code,
            first_name: transfer.first_name,
            last_name: transfer.last_name,
            branch_name: transfer.source_branch_name,
          });
          setTransferFormMode('resubmit');
          setProgressOpen(false);
          setTransferFormOpen(true);
        }}
      />
    </div>
  );
}
