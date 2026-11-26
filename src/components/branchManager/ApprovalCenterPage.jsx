import { useEffect, useMemo, useState } from 'react';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useNotificationHighlight } from '../../hooks/useNotificationHighlight.js';
import { idsMatch, recordKey } from '../../utils/notificationHighlight.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { RowActionMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import {
  fetchPendingSalesInvoices,
  patchSalesInvoiceReview,
  fetchCollectionsForReview,
  patchCollectionReview,
  fetchApprovalCenterSummary,
  fetchPendingRestocks,
  fetchRestockApprovalById,
  patchRestockApproval,
  fetchPendingStockCounts,
  fetchStockCountApprovalById,
  patchStockCountApproval,
  fetchCustomerChangeRequests,
  patchCustomerChangeRequest,
} from '../../api/approvalsService.js';
import {
  fetchInventoryTransfers,
  fetchInventoryTransferById,
  patchInventoryTransfer,
  mapInventoryTransferRow,
} from '../../api/inventoryService.js';
import {
  fetchBranchTransfers,
  fetchCustomerById,
  fetchCustomers,
  decideCustomerIdentityReview,
  sourceSubmitBranchTransfer,
  receivingSubmitBranchTransfer,
  omDecideBranchTransfer,
  fetchBranchTransferTargetTerritories,
} from '../../api/salesService.js';
import { getBranchStaff } from '../../api/branchManagerService.js';
import { getCurrentUser } from '../../api/authService.js';
import { agingDaysManila, formatMoneyOrNA, waitingLabelManila } from '../../utils/creditReview';
import { formatCustomerDisplayId, formatCustomerFullName } from '../../utils/customerDisplay';
import {
  getUserBranchId,
  customerDisplayName,
} from './approvalCenterHelpers.js';
import { InvoiceReviewDrawer } from './InvoiceReviewDrawer.jsx';

function staffDisplayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.email
    || (user?.id != null ? `#${user.id}` : '—');
}

function tabFromSearch() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('tab') || '';
    const allowed = new Set([
      'collections', 'invoices', 'transfers', 'restocks', 'stock-counts',
      'customer-changes', 'branch-transfers', 'identity',
    ]);
    // Legacy ?tab=ci → Credit Investigations desk (sidebar entry)
    if (raw === 'ci') return 'ci-redirect';
    return allowed.has(raw) ? raw : null;
  } catch {
    return null;
  }
}

function transferLocationLabel(transfer) {
  return [
    transfer.address_street,
    transfer.address_barangay,
    transfer.address_city,
    transfer.address_province,
  ].filter(Boolean).join(', ') || transfer.address || '—';
}

function transferCustomerLabel(transfer) {
  return [transfer.first_name, transfer.last_name].filter(Boolean).join(' ')
    || transfer.customer_name
    || transfer.customer_code
    || `#${transfer.customer_id}`;
}

function transferRefLabel(transfer) {
  return transfer.transfer_ref || transfer.progress?.transfer_ref || `CBT-${transfer.transfer_id}`;
}

function transferConfirmDetails(transfer, extras = []) {
  return [
    { label: 'Customer', value: transferCustomerLabel(transfer) },
    { label: 'Customer ID', value: formatCustomerDisplayId(transfer) },
    { label: 'Transfer ref', value: transferRefLabel(transfer) },
    {
      label: 'From → Receiving',
      value: `${transfer.source_branch_name || transfer.source_branch_id} → ${transfer.target_branch_name || transfer.target_branch_id}`,
      fullWidth: true,
    },
    ...extras,
  ];
}

/** Limited card for Receiving BM — no financials / full phone / ID. */
function limitedReceivingTransferProfile(transfer) {
  const location = transferLocationLabel(transfer);
  return {
    first_name: transfer.first_name,
    last_name: transfer.last_name,
    customer_id: transfer.customer_id,
    customer_code: transfer.customer_code,
    status: transfer.customer_status || 'Active',
    branch_name: transfer.source_branch_name || '—',
    contact_phone_masked: 'Hidden until ownership transfer completes',
    address: location,
    address_street: transfer.address_street,
    address_barangay: transfer.address_barangay,
    address_city: transfer.address_city,
    address_province: transfer.address_province,
    limited: true,
    transfer_ref: transferRefLabel(transfer),
    transfer_reason: transfer.reason || null,
    revision_note: transfer.revision_note || null,
    proposed_territory_name: transfer.target_territory_name
      || transfer.proposed_territory_name
      || null,
    receiving_branch_name: transfer.target_branch_name || null,
  };
}

/** OM review card — transfer context plus optional full customer payload. */
function omTransferReviewProfile(transfer, customer = null) {
  const location = transferLocationLabel(transfer);
  const base = customer && typeof customer === 'object' ? customer : {};
  return {
    ...base,
    first_name: base.first_name || transfer.first_name,
    last_name: base.last_name || transfer.last_name,
    customer_id: transfer.customer_id,
    customer_code: base.customer_code || transfer.customer_code,
    status: base.status || transfer.customer_status || 'Active',
    branch_name: base.branch_name || transfer.source_branch_name || '—',
    territory_name: base.territory_name || null,
    contact_phone: base.contact_phone || transfer.contact_phone || null,
    address: location,
    address_street: transfer.address_street || base.address_street,
    address_barangay: transfer.address_barangay || base.address_barangay,
    address_city: transfer.address_city || base.address_city,
    address_province: transfer.address_province || base.address_province,
    limited: false,
    omReview: true,
    transfer_ref: transferRefLabel(transfer),
    transfer_reason: transfer.reason || null,
    revision_note: transfer.revision_note || null,
    source_release_note: transfer.source_release_note || null,
    proposed_territory_name: transfer.target_territory_name
      || transfer.proposed_territory_name
      || null,
    receiving_branch_name: transfer.target_branch_name || null,
    source_branch_name: transfer.source_branch_name || null,
    proposed_sales_agent_name: transfer.proposed_sales_agent_name || null,
    proposed_account_manager_name: transfer.proposed_account_manager_name || null,
    transfer_status: transfer.status,
    activity: base.activity || null,
    credit: base.credit || null,
    id_verification_status: base.id_verification_status || null,
    phone_verification_status: base.phone_verification_status || null,
    created_at: base.created_at || null,
  };
}

function sortOldestFirst(rows, dateKey) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a[dateKey] || 0).getTime();
    const bTime = new Date(b[dateKey] || 0).getTime();
    return aTime - bTime;
  });
}

function waitingLabel(dateValue) {
  return waitingLabelManila(dateValue);
}

function waitingToneClass(dateValue) {
  const days = agingDaysManila(dateValue);
  if (days >= 7) return 'waiting-age waiting-age--critical';
  if (days >= 3) return 'waiting-age waiting-age--warn';
  return 'waiting-age waiting-age--ok';
}

function invoiceTermsLabel(inv) {
  const payType = String(inv?.pay_type || '').toLowerCase();
  const method = inv?.payment_method || '';
  if (payType === 'full' || inv?.payment_arrangement === 'spot_cash') {
    return `Spot Cash${method ? ` · ${method}` : ''}`;
  }
  if (payType === 'installment') {
    return `Installment${inv?.term_months ? ` · ${inv.term_months} mo` : ''}`;
  }
  return method || '—';
}

function invoiceAmountDisplay(inv) {
  const finalAmt = Number(inv?.final_obligation ?? inv?.total_amount ?? 0);
  const original = Number(inv?.original_total_amount);
  const discounted = Number.isFinite(original)
    && original > 0
    && Math.abs(original - finalAmt) > 0.009;
  return { finalAmt, original, discounted };
}

function QueueSummaryModal({ open, title, rows = [], onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title || 'Details'}</h3>
        <dl className="account-detail-grid two-up" style={{ margin: 0 }}>
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="muted">{row.label}</dt>
              <dd style={{ margin: 0 }}>{row.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function CustomerProfileDrawer({
  open,
  loading,
  profile,
  onClose,
  title = 'Customer Profile',
  limited = false,
  actions = [],
  busy = false,
}) {
  if (!open) return null;
  const name = customerDisplayName(profile);
  const isLimited = limited || Boolean(profile?.limited);
  const isOmReview = Boolean(profile?.omReview);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !profile ? (
          <LoadingState message="Loading customer profile…" />
        ) : (
          <>
            <div className="flex flex-wrap justify-between gap-2 items-start">
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>{title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {isLimited
                    ? 'Limited cross-branch preview for Receiving BM. Sensitive account data stays hidden until ownership transfers.'
                    : isOmReview
                      ? 'Review transfer details, then approve or reject ownership change.'
                      : 'Read-only — viewing does not approve or change the record.'}
                </p>
              </div>
              <StatusBadge status={profile.transfer_status || profile.status || 'Active'} />
            </div>
            <dl className="account-detail-grid two-up" style={{ marginTop: 16 }}>
              <div>
                <dt className="muted">Customer</dt>
                <dd style={{ margin: 0 }}><strong>{name}</strong></dd>
              </div>
              <div>
                <dt className="muted">Customer ID</dt>
                <dd style={{ margin: 0 }}>{formatCustomerDisplayId(profile)}</dd>
              </div>
              <div>
                <dt className="muted">Mobile</dt>
                <dd style={{ margin: 0 }}>{profile.contact_phone_masked || (isLimited ? 'Hidden' : (profile.contact_phone || '—'))}</dd>
              </div>
              <div>
                <dt className="muted">Home branch</dt>
                <dd style={{ margin: 0 }}>{profile.branch_name || profile.source_branch_name || '—'}</dd>
              </div>
              {(isLimited || isOmReview) ? (
                <>
                  <div>
                    <dt className="muted">Transfer ref</dt>
                    <dd style={{ margin: 0 }}>{profile.transfer_ref || '—'}</dd>
                  </div>
                  <div>
                    <dt className="muted">Receiving branch</dt>
                    <dd style={{ margin: 0 }}>{profile.receiving_branch_name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="muted">{isOmReview ? 'Confirmed territory' : 'Proposed territory'}</dt>
                    <dd style={{ margin: 0 }}>{profile.proposed_territory_name || 'Pending confirmation'}</dd>
                  </div>
                  {isOmReview ? (
                    <>
                      <div>
                        <dt className="muted">Receiving Sales Agent</dt>
                        <dd style={{ margin: 0 }}>{profile.proposed_sales_agent_name || '—'}</dd>
                      </div>
                      <div>
                        <dt className="muted">Receiving Collector</dt>
                        <dd style={{ margin: 0 }}>{profile.proposed_account_manager_name || '—'}</dd>
                      </div>
                      <div>
                        <dt className="muted">Source release note</dt>
                        <dd style={{ margin: 0 }}>{profile.source_release_note || '—'}</dd>
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    <dt className="muted">Territory</dt>
                    <dd style={{ margin: 0 }}>{profile.territory_name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="muted">Registered</dt>
                    <dd style={{ margin: 0 }}>{formatDisplayDateTime(profile.created_at)}</dd>
                  </div>
                </>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <dt className="muted">{(isLimited || isOmReview) ? 'Current location (from transfer)' : 'Address'}</dt>
                <dd style={{ margin: 0 }}>
                  {profile.address
                    || [profile.address_street, profile.address_barangay, profile.address_city, profile.address_province]
                      .filter(Boolean)
                      .join(', ')
                    || '—'}
                </dd>
              </div>
              {(isLimited || isOmReview) && profile.transfer_reason ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="muted">Transfer reason</dt>
                  <dd style={{ margin: 0 }}>{profile.transfer_reason}</dd>
                </div>
              ) : null}
              {profile.revision_note ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="muted">Return note</dt>
                  <dd style={{ margin: 0 }} className="form-error">{profile.revision_note}</dd>
                </div>
              ) : null}
              {!isLimited && (profile.match_reasons || []).length ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="muted">Match indicators</dt>
                  <dd style={{ margin: 0 }}>{(profile.match_reasons || []).join(', ')}</dd>
                </div>
              ) : null}
              {!isLimited && (profile.activity || profile.credit) ? (
                <>
                  <div>
                    <dt className="muted">Outstanding balance</dt>
                    <dd style={{ margin: 0 }}>
                      {profile.activity?.outstanding_balance != null
                        ? formatCurrency(Number(profile.activity.outstanding_balance))
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted">Credit</dt>
                    <dd style={{ margin: 0 }}>
                      {profile.credit
                        ? `${profile.credit.credit_status || '—'} · limit ${formatMoneyOrNA(profile.credit.credit_limit)}`
                        : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
              {!isLimited ? (
                <>
                  <div>
                    <dt className="muted">ID verification</dt>
                    <dd style={{ margin: 0 }}>{profile.id_verification_status || '—'}</dd>
                  </div>
                  <div>
                    <dt className="muted">Phone verification</dt>
                    <dd style={{ margin: 0 }}>{profile.phone_verification_status || '—'}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <div className="modal-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <button className="button ghost" type="button" disabled={busy} onClick={onClose}>Close</button>
              {(actions || []).map((action) => (
                <button
                  key={action.key}
                  className={action.variant === 'ghost' ? 'button ghost' : 'button'}
                  type="button"
                  disabled={busy || action.disabled}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  value,
  onChange,
  onCancel,
  onConfirm,
  busy = false,
}) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-reason-title"
      onClick={onCancel}
    >
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3 id="approval-reason-title" style={{ marginTop: 0 }}>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
        <div className="form-group">
          <label htmlFor="approval-reason-input">Reason *</label>
          <textarea
            id="approval-reason-input"
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter a clear reason"
            disabled={busy}
          />
        </div>
        <div className="modal-actions">
          <button className="button ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className="button" type="button" disabled={busy || !value.trim()} onClick={onConfirm}>
            {busy ? 'Submitting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
  busy = false,
}) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-confirm-title"
      onClick={busy ? undefined : onCancel}
    >
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h3 id="approval-confirm-title" style={{ marginTop: 0 }}>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
        {details.length ? (
          <dl className="account-detail-grid two-up" style={{ margin: '12px 0 0' }}>
            {details.map((row) => (
              <div key={row.label} style={row.fullWidth ? { gridColumn: '1 / -1' } : undefined}>
                <dt className="muted">{row.label}</dt>
                <dd style={{ margin: 0 }}>{row.value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button ghost" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="button" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Submitting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferDetailModal({
  detail,
  loading,
  onClose,
  onApprove,
  onReject,
  busy,
}) {
  if (!loading && !detail) return null;
  const detailId = detail?.transfer_id || detail?.id;
  const detailRef = detail?.transfer_ref || detail?.ref;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-detail-title"
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{ maxWidth: 720 }}
        data-record-key={detailId ? recordKey('transfer', detailId) : undefined}
        data-highlight-alt={detailRef || undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !detail ? (
          <LoadingState message="Loading transfer lines…" />
        ) : (
          <>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3 id="transfer-detail-title" style={{ margin: 0 }}>{detail.transfer_ref}</h3>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {detail.source_branch} → {detail.destination_branch}
                  {' · '}{detail.submitted_by_name || '—'}
                  {' · '}{formatDisplayDate(detail.submitted_date || detail.created_at)}
                </p>
              </div>
              <StatusBadge status={detail.status} />
            </div>
            {detail.notes ? <p className="muted">Notes: {detail.notes}</p> : null}
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.lines || []).map((line) => (
                    <tr key={line.line_id || line.product_id}>
                      <td><span className="mono-cell">{line.sku || '—'}</span></td>
                      <td><strong>{line.product_name}</strong></td>
                      <td>{line.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button ghost" type="button" disabled={busy} onClick={onClose}>Close</button>
              {['Pending Approval', 'Submitted'].includes(detail.status) ? (
                <>
                  <button className="button secondary" type="button" disabled={busy} onClick={() => onReject(detail.transfer_id)}>
                    Reject
                  </button>
                  <button className="button" type="button" disabled={busy} onClick={() => onApprove(detail.transfer_id)}>
                    Approve
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InventoryDocModal({
  titleId,
  heading,
  subtitle,
  status,
  notes,
  columns,
  lines,
  lineKey,
  loading,
  onClose,
  onApprove,
  onReject,
  busy,
  loadingMessage,
  recordEntity = null,
  recordId = null,
  recordAlt = null,
}) {
  if (!loading && !heading) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 720 }}
        data-record-key={recordEntity && recordId ? recordKey(recordEntity, recordId) : undefined}
        data-highlight-alt={recordAlt || heading || undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !heading ? (
          <LoadingState message={loadingMessage || 'Loading…'} />
        ) : (
          <>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3 id={titleId} style={{ margin: 0 }}>{heading}</h3>
                {subtitle ? <p className="muted" style={{ margin: '4px 0 0' }}>{subtitle}</p> : null}
              </div>
              {status ? <StatusBadge status={status} /> : null}
            </div>
            {notes ? <p className="muted">Notes: {notes}</p> : null}
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    {columns.map((col) => <th key={col.key}>{col.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(lines || []).map((line) => (
                    <tr key={lineKey(line)}>
                      {columns.map((col) => (
                        <td key={col.key}>{col.render(line)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button ghost" type="button" disabled={busy} onClick={onClose}>Close</button>
              <button className="button secondary" type="button" disabled={busy} onClick={onReject}>Reject</button>
              <button className="button" type="button" disabled={busy} onClick={onApprove}>Approve & Post</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ApprovalCenterPage({
  navigate,
  showToast,
  opsBase,
}) {
  const [tab, setTab] = useState(() => {
    const fromSearch = tabFromSearch();
    return fromSearch && fromSearch !== 'ci-redirect' ? fromSearch : 'collections';
  });
  const [transferList, setTransferList] = useState([]);
  const [restockList, setRestockList] = useState([]);
  const [stockCountList, setStockCountList] = useState([]);
  const [invoiceList, setInvoiceList] = useState([]);
  const [collectionList, setCollectionList] = useState([]);
  const [customerChangeList, setCustomerChangeList] = useState([]);
  const [identityReviewList, setIdentityReviewList] = useState([]);
  const [branchTransferList, setBranchTransferList] = useState([]);
  const [targetTerritoryOptionsByTransfer, setTargetTerritoryOptionsByTransfer] = useState({});
  const [transferDrafts, setTransferDrafts] = useState({});
  const [receivingSalesAgents, setReceivingSalesAgents] = useState([]);
  const [receivingCollectors, setReceivingCollectors] = useState([]);
  const [staffOptionsLoaded, setStaffOptionsLoaded] = useState(false);
  const [summary, setSummary] = useState(null);
  const [queueSummary, setQueueSummary] = useState(null);
  const [invoiceReview, setInvoiceReview] = useState({ open: false, id: null, seed: null });
  const [profileDrawer, setProfileDrawer] = useState({
    open: false,
    loading: false,
    profile: null,
    limited: false,
    title: undefined,
    actions: [],
    transfer: null,
  });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const currentUser = getCurrentUser();
  const isOm = ['operating_manager', 'super_admin'].includes(
    String(currentUser?.roleSlug || currentUser?.role?.slug || '')
  );

  const [transferDetail, setTransferDetail] = useState(null);
  const [transferDetailLoading, setTransferDetailLoading] = useState(false);
  const [restockDetail, setRestockDetail] = useState(null);
  const [restockDetailLoading, setRestockDetailLoading] = useState(false);
  const [stockCountDetail, setStockCountDetail] = useState(null);
  const [stockCountDetailLoading, setStockCountDetailLoading] = useState(false);

  const [reasonDialog, setReasonDialog] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [pendingFocus, setPendingFocus] = useState(null);
  const [highlightReady, setHighlightReady] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [trRes, restockRes, countRes, invRes, pendingPayRes, summaryRes, changesRes, xferRes, identityRes] = await Promise.all([
      fetchInventoryTransfers({ status: 'pending', limit: 100 }),
      fetchPendingRestocks(),
      fetchPendingStockCounts(),
      fetchPendingSalesInvoices(),
      fetchCollectionsForReview('Pending'),
      fetchApprovalCenterSummary(),
      fetchCustomerChangeRequests({ status: 'Pending' }),
      fetchBranchTransfers({ limit: 100 }),
      fetchCustomers({ status: 'Pending Identity Review', limit: 100, sort_by: 'created_at', sort_dir: 'asc' }),
    ]);

    let nextTransfers = [];
    if (trRes.success) {
      nextTransfers = sortOldestFirst(
        (trRes.data || [])
          .filter((t) => ['Pending Approval', 'Submitted'].includes(t.status))
          .map(mapInventoryTransferRow),
        'date'
      );
    }
    const nextRestocks = restockRes.success
      ? sortOldestFirst(restockRes.data || [], 'submitted_at')
      : [];
    const nextCounts = countRes.success
      ? sortOldestFirst(countRes.data || [], 'created_at')
      : [];
    const nextInvoices = invRes.success
      ? sortOldestFirst(invRes.data || [], 'created_at')
      : [];
    const nextCollections = pendingPayRes.success
      ? sortOldestFirst(pendingPayRes.data || [], 'payment_date')
      : [];

    setTransferList(nextTransfers);
    setRestockList(nextRestocks);
    setStockCountList(nextCounts);
    setInvoiceList(nextInvoices);
    setCollectionList(nextCollections);
    setCustomerChangeList(changesRes.success ? (changesRes.data || []) : []);
    const nextIdentity = identityRes.success
      ? sortOldestFirst(identityRes.data || [], 'created_at')
      : [];
    setIdentityReviewList(nextIdentity);
    try {
      const params = new URLSearchParams(window.location.search);
      const focusId = String(params.get('highlight') || params.get('id') || params.get('verificationId') || '').trim();
      const focusTab = tabFromSearch();
      if (focusId && ['transfers', 'restocks', 'stock-counts', 'identity'].includes(focusTab)) {
        setPendingFocus({ tab: focusTab, id: focusId });
      }
    } catch { /* ignore */ }
    const rawXfers = xferRes.success ? (xferRes.data || []) : [];
    // BM action queue: hide SA-return noise. OM keeps oversight of all open stages.
    const nextXfers = sortOldestFirst(
      isOm
        ? rawXfers
        : rawXfers.filter((row) => !['Returned to SA', 'Needs Revision'].includes(String(row.status || ''))),
      'created_at'
    );
    setBranchTransferList(nextXfers);
    if (summaryRes.success) setSummary(summaryRes.data || null);
    else setSummary(null);

    const preferred = tabFromSearch();
    const counts = {
      collections: nextCollections.length,
      invoices: nextInvoices.length,
      transfers: nextTransfers.length,
      restocks: nextRestocks.length,
      'stock-counts': nextCounts.length,
      'customer-changes': changesRes.success ? (changesRes.data || []).length : 0,
      identity: nextIdentity.length,
      'branch-transfers': nextXfers.length,
    };
    setTab((current) => {
      if (preferred && preferred !== 'ci-redirect' && counts[preferred] != null) return preferred;
      if (counts[current] > 0) return current;
      if (counts.identity > 0) return 'identity';
      if (counts.collections > 0) return 'collections';
      if (counts.invoices > 0) return 'invoices';
      if (counts.transfers > 0) return 'transfers';
      if (counts.restocks > 0) return 'restocks';
      if (counts['stock-counts'] > 0) return 'stock-counts';
      if (counts['customer-changes'] > 0) return 'customer-changes';
      if (counts['branch-transfers'] > 0) return 'branch-transfers';
      return 'collections';
    });

    setLoading(false);
  };

  useEffect(() => {
    // Legacy Approval Center ?tab=ci → dedicated Credit Investigations desk
    if (tabFromSearch() === 'ci-redirect') {
      navigate(`${opsBase}/ci-approvals`, { replace: true });
      return;
    }
    reload();
  }, []);

  const counts = useMemo(() => ({
    collections: collectionList.length,
    invoices: invoiceList.length,
    transfers: transferList.length,
    restocks: restockList.length,
    'stock-counts': stockCountList.length,
    'customer-changes': customerChangeList.length,
    identity: identityReviewList.length,
    'branch-transfers': branchTransferList.length,
  }), [collectionList, invoiceList, transferList, restockList, stockCountList, customerChangeList, identityReviewList, branchTransferList]);

  const tabs = [
    { key: 'identity', label: `Territory / Identity (${counts.identity})` },
    { key: 'collections', label: `Collections (${counts.collections})` },
    { key: 'invoices', label: `Sales Invoices (${counts.invoices})` },
    { key: 'transfers', label: `Inventory Transfers (${counts.transfers})` },
    { key: 'restocks', label: `Restocks (${counts.restocks})` },
    { key: 'stock-counts', label: `Stock Counts (${counts['stock-counts']})` },
    { key: 'customer-changes', label: `Customer Changes (${counts['customer-changes']})` },
    { key: 'branch-transfers', label: `Branch Transfers (${counts['branch-transfers']})` },
  ];

  const paginationCollections = usePagination(collectionList);
  const paginationInvoices = usePagination(invoiceList);
  const paginationTransfers = usePagination(transferList);
  const paginationRestocks = usePagination(restockList);
  const paginationStockCounts = usePagination(stockCountList);

  const highlightEntityByTab = {
    collections: 'collection',
    invoices: 'invoice',
    transfers: 'transfer',
    restocks: 'restock',
    'stock-counts': 'stock_count',
    'customer-changes': 'customer_change',
    identity: 'customer',
    'branch-transfers': 'branch_transfer',
  };
  const highlightEntity = highlightEntityByTab[tab] || null;

  useEffect(() => {
    setHighlightReady(false);
    if (loading) return undefined;

    let focusId = '';
    try {
      const params = new URLSearchParams(window.location.search);
      focusId = String(params.get('highlight') || params.get('id') || params.get('verificationId') || '').trim();
    } catch {
      focusId = '';
    }
    if (!focusId || !highlightEntity) {
      setHighlightReady(true);
      return undefined;
    }

    const pageSize = 10;
    const goToMatch = (rows, matchFn, goToPage) => {
      const index = rows.findIndex(matchFn);
      if (index < 0) return false;
      goToPage(Math.floor(index / pageSize) + 1);
      return true;
    };

    if (tab === 'collections') {
      goToMatch(
        collectionList,
        (row) => idsMatch(row.collectionpayment_id, focusId) || idsMatch(row.receipt_number, focusId),
        paginationCollections.goToPage
      );
    } else if (tab === 'invoices') {
      goToMatch(
        invoiceList,
        (row) => idsMatch(row.sales_invoices_id, focusId) || idsMatch(row.invoice_number, focusId),
        paginationInvoices.goToPage
      );
    } else if (tab === 'transfers') {
      goToMatch(
        transferList,
        (row) => idsMatch(row.id, focusId) || idsMatch(row.transfer_id, focusId) || idsMatch(row.ref, focusId) || idsMatch(row.transfer_ref, focusId),
        paginationTransfers.goToPage
      );
    } else if (tab === 'restocks') {
      goToMatch(
        restockList,
        (row) => idsMatch(row.restock_id, focusId) || idsMatch(row.restock_ref, focusId) || idsMatch(row.delivery_ref, focusId),
        paginationRestocks.goToPage
      );
    } else if (tab === 'stock-counts') {
      goToMatch(
        stockCountList,
        (row) => idsMatch(row.count_id, focusId) || idsMatch(row.count_ref, focusId),
        paginationStockCounts.goToPage
      );
    }

    const timer = window.setTimeout(() => setHighlightReady(true), 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tab, collectionList, invoiceList, transferList, restockList, stockCountList]);

  useNotificationHighlight(highlightEntity, {
    enabled: !loading && Boolean(highlightEntity),
    ready: highlightReady,
  });

  const openReasonDialog = (config) => {
    setReasonText('');
    setReasonDialog(config);
  };

  const closeReasonDialog = () => {
    if (busyKey) return;
    setReasonDialog(null);
    setReasonText('');
  };

  const submitReasonDialog = async () => {
    if (!reasonDialog) return;
    const reason = reasonText.trim();
    if (!reason) {
      showToast?.('Reason required.', 'error');
      return;
    }
    setBusyKey(reasonDialog.key);
    try {
      await reasonDialog.onSubmit(reason);
      setReasonDialog(null);
      setReasonText('');
    } catch {
      // Toast already shown by action handler.
    } finally {
      setBusyKey(null);
    }
  };

  const openTransferDetail = async (transferId) => {
    setTransferDetailLoading(true);
    setTransferDetail(null);
    const result = await fetchInventoryTransferById(transferId);
    if (result.success) setTransferDetail(result.data);
    else showToast?.(result.message || 'Could not load transfer lines.', 'error');
    setTransferDetailLoading(false);
  };

  const approveTransfer = async (transferId) => {
    setBusyKey(`transfer-approve-${transferId}`);
    const result = await patchInventoryTransfer(transferId, { status: 'Approved' });
    setBusyKey(null);
    if (result.success) {
      showToast?.('Transfer approved. Source warehouse can confirm shipment.', 'success');
      setTransferDetail(null);
      reload();
    } else showToast?.(result.message || 'Approve failed.', 'error');
  };

  const rejectTransfer = (transferId) => {
    openReasonDialog({
      key: `transfer-reject-${transferId}`,
      title: 'Reject inventory transfer',
      description: 'Provide a reason for rejecting this transfer document.',
      confirmLabel: 'Reject Transfer',
      onSubmit: async (reason) => {
        const result = await patchInventoryTransfer(transferId, {
          status: 'Rejected',
          approval_info: reason,
        });
        if (result.success) {
          showToast?.('Transfer rejected.', 'success');
          setTransferDetail(null);
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const openRestockDetail = async (restockId) => {
    setRestockDetailLoading(true);
    setRestockDetail(null);
    const result = await fetchRestockApprovalById(restockId);
    if (result.success) setRestockDetail(result.data);
    else showToast?.(result.message || 'Could not load restock.', 'error');
    setRestockDetailLoading(false);
  };

  const approveRestock = async (restockId) => {
    setBusyKey(`restock-approve-${restockId}`);
    const result = await patchRestockApproval(restockId, { status: 'Approved' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Restock approved and posted.', 'success');
      setRestockDetail(null);
      reload();
    } else showToast?.(result.message || 'Approve failed.', 'error');
  };

  const rejectRestock = (restockId) => {
    openReasonDialog({
      key: `restock-reject-${restockId}`,
      title: 'Reject restock',
      description: 'Stock will not increase. Provide a reason for the warehouse team.',
      confirmLabel: 'Reject Restock',
      onSubmit: async (reason) => {
        const result = await patchRestockApproval(restockId, {
          status: 'Rejected',
          decision_remarks: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Restock rejected.', 'success');
          setRestockDetail(null);
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const openStockCountDetail = async (countId) => {
    setStockCountDetailLoading(true);
    setStockCountDetail(null);
    const result = await fetchStockCountApprovalById(countId);
    if (result.success) setStockCountDetail(result.data);
    else showToast?.(result.message || 'Could not load stock count.', 'error');
    setStockCountDetailLoading(false);
  };

  useEffect(() => {
    if (!pendingFocus?.id || !pendingFocus?.tab || loading) return undefined;
    const { tab: focusTab, id } = pendingFocus;
    setPendingFocus(null);

    if (focusTab === 'transfers') {
      const match = transferList.find((row) => (
        idsMatch(row.id, id) || idsMatch(row.transfer_id, id) || idsMatch(row.ref, id) || idsMatch(row.transfer_ref, id)
      ));
      const numericId = match?.id || match?.transfer_id || ( /^\d+$/.test(String(id)) ? id : null);
      if (numericId) openTransferDetail(numericId);
      else showToast?.('Transfer record is not in the current approval queue.', 'info');
    } else if (focusTab === 'restocks') {
      const match = restockList.find((row) => (
        idsMatch(row.restock_id, id) || idsMatch(row.restock_ref, id) || idsMatch(row.delivery_ref, id)
      ));
      const numericId = match?.restock_id || (/^\d+$/.test(String(id)) ? id : null);
      if (numericId) openRestockDetail(numericId);
      else showToast?.('Restock record is not in the current approval queue.', 'info');
    } else if (focusTab === 'stock-counts') {
      const match = stockCountList.find((row) => (
        idsMatch(row.count_id, id) || idsMatch(row.count_ref, id)
      ));
      const numericId = match?.count_id || (/^\d+$/.test(String(id)) ? id : null);
      if (numericId) openStockCountDetail(numericId);
      else showToast?.('Stock count record is not in the current approval queue.', 'info');
    }
    return undefined;
    // Intentionally run when load completes with a deep-link focus target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus, loading, transferList, restockList, stockCountList]);

  const approveStockCount = async (countId) => {
    setBusyKey(`count-approve-${countId}`);
    const result = await patchStockCountApproval(countId, { status: 'Approved' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Stock count approved and posted.', 'success');
      setStockCountDetail(null);
      reload();
    } else showToast?.(result.message || 'Approve failed.', 'error');
  };

  const rejectStockCount = (countId) => {
    openReasonDialog({
      key: `count-reject-${countId}`,
      title: 'Reject stock count',
      description: 'Inventory balances will stay unchanged. Provide a reason.',
      confirmLabel: 'Reject Stock Count',
      onSubmit: async (reason) => {
        const result = await patchStockCountApproval(countId, {
          status: 'Rejected',
          decision_remarks: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Stock count rejected.', 'success');
          setStockCountDetail(null);
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const removeInvoiceFromQueue = (invoiceId) => {
    setInvoiceList((prev) => prev.filter((row) => Number(row.sales_invoices_id) !== Number(invoiceId)));
    setInvoiceReview((prev) => (
      Number(prev.id) === Number(invoiceId) ? { open: false, id: null, seed: null } : prev
    ));
  };

  const confirmInvoice = async (invoiceId) => {
    setBusyKey(`invoice-confirm-${invoiceId}`);
    const result = await patchSalesInvoiceReview(invoiceId, { status: 'Confirmed' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Invoice acknowledged.', 'success');
      removeInvoiceFromQueue(invoiceId);
      fetchApprovalCenterSummary().then((summaryRes) => {
        if (summaryRes.success) setSummary(summaryRes.data || null);
      });
    } else {
      showToast?.(result.message || 'Acknowledge failed.', 'error');
      throw new Error(result.message || 'Acknowledge failed.');
    }
  };

  const rejectInvoice = async (invoiceId, reasonFromDrawer) => {
    if (reasonFromDrawer != null) {
      setBusyKey(`invoice-reject-${invoiceId}`);
      const result = await patchSalesInvoiceReview(invoiceId, {
        status: 'Cancelled',
        review_note: reasonFromDrawer,
      });
      setBusyKey(null);
      if (result.success) {
        showToast?.(result.message || 'Invoice rejected.', 'success');
        removeInvoiceFromQueue(invoiceId);
        fetchApprovalCenterSummary().then((summaryRes) => {
          if (summaryRes.success) setSummary(summaryRes.data || null);
        });
      } else {
        showToast?.(result.message || 'Reject failed.', 'error');
        throw new Error(result.message || 'Reject failed.');
      }
      return;
    }
    openReasonDialog({
      key: `invoice-reject-${invoiceId}`,
      title: 'Reject sales invoice',
      description: 'Rejection returns stock and reopens the related purchase request when applicable.',
      confirmLabel: 'Reject Invoice',
      onSubmit: async (reason) => {
        const result = await patchSalesInvoiceReview(invoiceId, {
          status: 'Cancelled',
          review_note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Invoice rejected.', 'success');
          removeInvoiceFromQueue(invoiceId);
          fetchApprovalCenterSummary().then((summaryRes) => {
            if (summaryRes.success) setSummary(summaryRes.data || null);
          });
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const confirmCollection = async (paymentId) => {
    setBusyKey(`collection-confirm-${paymentId}`);
    const result = await patchCollectionReview(paymentId, { action: 'confirm' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Collection confirmed.', 'success');
      reload();
    } else showToast?.(result.message || 'Confirm failed.', 'error');
  };

  const rejectCollection = (paymentId) => {
    openReasonDialog({
      key: `collection-reject-${paymentId}`,
      title: 'Reject collection',
      description: 'The customer balance will remain unchanged.',
      confirmLabel: 'Reject Collection',
      onSubmit: async (reason) => {
        const result = await patchCollectionReview(paymentId, {
          action: 'reject',
          review_note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Collection rejected.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const approveCustomerChange = async (requestId) => {
    setBusyKey(`customer-change-approve-${requestId}`);
    const result = await patchCustomerChangeRequest(requestId, { status: 'Approved' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Customer change approved.', 'success');
      reload();
    } else showToast?.(result.message || 'Approve failed.', 'error');
  };

  const rejectCustomerChange = (requestId) => {
    openReasonDialog({
      key: `customer-change-reject-${requestId}`,
      title: 'Reject customer change',
      description: 'The original customer record will remain unchanged.',
      confirmLabel: 'Reject Change',
      onSubmit: async (reason) => {
        const result = await patchCustomerChangeRequest(requestId, {
          status: 'Rejected',
          decision_remarks: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Customer change rejected.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const identityHoldLabel = (customer) => {
    const profile = customer?.registration_profile_json || {};
    if (
      String(profile.hold_reason || '') === 'territory_exception'
      || Boolean(profile.territory_outside_review)
      || Boolean(customer?.territory_override_note)
    ) {
      return 'Territory exception';
    }
    return 'Identity review';
  };

  const approveIdentityReview = async (customer) => {
    const customerId = customer.customer_id;
    setBusyKey(`identity-approve-${customerId}`);
    const result = await decideCustomerIdentityReview(customerId, {
      decision: 'approve',
      note: null,
    });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Customer activated.', 'success');
      reload();
    } else {
      showToast?.(result.message || 'Approve failed.', 'error');
    }
  };

  const rejectIdentityReview = (customer) => {
    const customerId = customer.customer_id;
    openReasonDialog({
      key: `identity-reject-${customerId}`,
      title: 'Reject registration',
      description: 'The registration will be marked Rejected (declined). The Sales Agent can fix address/territory and resubmit the same customer — a new account should not be created.',
      confirmLabel: 'Reject registration',
      onSubmit: async (reason) => {
        const result = await decideCustomerIdentityReview(customerId, {
          decision: 'reject',
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Registration rejected.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

  const loadTerritoriesForTransfer = async (transferId) => {
    const res = await fetchBranchTransferTargetTerritories(transferId);
    const rows = res.success ? (res.data || []) : [];
    setTargetTerritoryOptionsByTransfer((prev) => ({ ...prev, [transferId]: rows }));
  };

  const loadReceivingStaffOptions = async () => {
    if (staffOptionsLoaded || isOm) return;
    const res = await getBranchStaff();
    if (res.success) {
      setReceivingSalesAgents(
        (res.data?.salesAgents || []).filter((u) => String(u.status || 'Active') === 'Active')
      );
      setReceivingCollectors(
        (res.data?.collectors || []).filter((u) => String(u.status || 'Active') === 'Active')
      );
    } else {
      setReceivingSalesAgents([]);
      setReceivingCollectors([]);
    }
    setStaffOptionsLoaded(true);
  };

  const closeProfileDrawer = () => {
    if (busyKey) return;
    setProfileDrawer({
      open: false,
      loading: false,
      profile: null,
      limited: false,
      title: undefined,
      actions: [],
      transfer: null,
    });
  };

  const submitReceivingTransfer = (transfer) => {
    const draft = transferDrafts[transfer.transfer_id] || {};
    const territoryId = Number(
      draft.target_territory_id
      || transfer.target_territory_id
      || transfer.proposed_territory_id
    );
    const salesAgentId = Number(
      draft.assigned_sales_agent_id
      || transfer.proposed_assigned_sales_agent_id
      || transfer.requested_by
    );
    const collectorId = Number(
      draft.account_manager_id
      || transfer.proposed_account_manager_id
    );
    if (!territoryId) {
      showToast?.('Select or confirm a receiving territory.', 'error');
      return;
    }
    if (!salesAgentId) {
      showToast?.('Select the receiving Sales Agent.', 'error');
      return;
    }
    if (!collectorId) {
      showToast?.('Select the receiving Collector.', 'error');
      return;
    }
    const territoryOptions = targetTerritoryOptionsByTransfer[transfer.transfer_id] || [];
    const territoryName = territoryOptions.find((t) => Number(t.territory_id) === territoryId)?.territory_name
      || transfer.target_territory_name
      || transfer.proposed_territory_name
      || `#${territoryId}`;
    const saName = staffDisplayName(
      receivingSalesAgents.find((u) => Number(u.id) === salesAgentId)
    ) || transfer.proposed_sales_agent_name || transfer.requester_name || `#${salesAgentId}`;
    const collectorName = staffDisplayName(
      receivingCollectors.find((u) => Number(u.id) === collectorId)
    ) || transfer.proposed_account_manager_name || `#${collectorId}`;
    setConfirmDialog({
      key: `xfer-recv-confirm-${transfer.transfer_id}`,
      title: 'Confirm territory and staffing?',
      description: 'This validates location for your branch, assigns receiving SA + Collector, and sends the request to Source BM for ownership release.',
      confirmLabel: 'Confirm Territory & Staffing',
      details: transferConfirmDetails(transfer, [
        { label: 'Territory', value: territoryName, fullWidth: true },
        { label: 'Sales Agent', value: saName },
        { label: 'Collector', value: collectorName },
        { label: 'Location', value: transferLocationLabel(transfer), fullWidth: true },
      ]),
      onConfirm: async () => {
        setBusyKey(`xfer-recv-${transfer.transfer_id}`);
        const result = await receivingSubmitBranchTransfer(transfer.transfer_id, {
          decision: 'confirm',
          target_territory_id: territoryId,
          assigned_sales_agent_id: salesAgentId,
          account_manager_id: collectorId,
          note: draft.note || null,
        });
        setBusyKey(null);
        if (result.success) {
          showToast?.(result.message || 'Territory and staffing confirmed.', 'success');
          setConfirmDialog(null);
          closeProfileDrawer();
          reload();
        } else {
          showToast?.(result.message || 'Submit failed.', 'error');
          throw new Error(result.message || 'Submit failed.');
        }
      },
    });
  };

  const returnReceivingTransfer = (transfer) => {
    openReasonDialog({
      key: `xfer-recv-return-${transfer.transfer_id}`,
      title: 'Return location to Sales Agent',
      description: 'Ask the SA to correct the customer\'s current address or landmark. Source BM will not see this until location is re-confirmed.',
      confirmLabel: 'Return to SA',
      onSubmit: async (reason) => {
        const result = await receivingSubmitBranchTransfer(transfer.transfer_id, {
          decision: 'return',
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Returned to SA.', 'success');
          closeProfileDrawer();
          reload();
        } else {
          showToast?.(result.message || 'Failed.', 'error');
          throw new Error(result.message || 'Failed.');
        }
      },
    });
  };

  const openReceivingTransferReview = (transfer) => {
    loadTerritoriesForTransfer(transfer.transfer_id);
    loadReceivingStaffOptions();
    setProfileDrawer({
      open: true,
      loading: false,
      limited: true,
      title: 'Review incoming transfer',
      transfer,
      profile: limitedReceivingTransferProfile(transfer),
      actions: [
        {
          key: 'confirm-territory',
          label: 'Confirm Territory & Staffing',
          onClick: () => submitReceivingTransfer(transfer),
        },
        {
          key: 'return-sa',
          label: 'Return to SA',
          variant: 'ghost',
          onClick: () => returnReceivingTransfer(transfer),
        },
      ],
    });
  };

  const submitSourceTransfer = (transfer) => {
    const receivingBranch = transfer.receiving_branch_name
      || transfer.target_branch_name
      || 'receiving branch';
    setConfirmDialog({
      key: `xfer-source-release-${transfer.transfer_id}`,
      title: 'Release ownership?',
      description: `Confirm releasing this customer to ${receivingBranch}. Ownership moves to Operating Manager for final approval.`,
      confirmLabel: 'Release Ownership',
      details: transferConfirmDetails(transfer, [
        {
          label: 'Territory',
          value: transfer.target_territory_name || transfer.proposed_territory_name || '—',
          fullWidth: true,
        },
      ]),
      onConfirm: async () => {
        setBusyKey(`xfer-source-${transfer.transfer_id}`);
        const result = await sourceSubmitBranchTransfer(transfer.transfer_id, {
          decision: 'release',
          note: transferDrafts[transfer.transfer_id]?.note || null,
        });
        setBusyKey(null);
        if (result.success) {
          showToast?.(result.message || 'Ownership released to OM.', 'success');
          setConfirmDialog(null);
          closeProfileDrawer();
          reload();
        } else {
          showToast?.(result.message || 'Submit failed.', 'error');
          throw new Error(result.message || 'Submit failed.');
        }
      },
    });
  };

  const decideSourceTransfer = (transfer) => {
    // Location returns are Receiving-BM only; Source BM may release or hard-reject.
    openReasonDialog({
      key: `xfer-source-reject-${transfer.transfer_id}`,
      title: 'Reject ownership release',
      description: 'Customer remains in the source branch. This permanently stops the transfer.',
      confirmLabel: 'Reject Transfer',
      onSubmit: async (reason) => {
        const result = await sourceSubmitBranchTransfer(transfer.transfer_id, {
          decision: 'reject',
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Updated.', 'success');
          closeProfileDrawer();
          reload();
        } else {
          showToast?.(result.message || 'Failed.', 'error');
          throw new Error(result.message || 'Failed.');
        }
      },
    });
  };

  const decideOmTransfer = (transfer, decision = 'reject') => {
    if (decision === 'approve') {
      setConfirmDialog({
        key: `xfer-om-approve-${transfer.transfer_id}`,
        title: 'Approve branch transfer?',
        description: 'This moves the customer into the receiving branch, applies territory, address, receiving Sales Agent and Collector, and preserves outstanding balances on the same customer ID.',
        confirmLabel: 'Approve Transfer',
        details: transferConfirmDetails(transfer, [
          {
            label: 'Territory',
            value: transfer.target_territory_name || transfer.proposed_territory_name || '—',
            fullWidth: true,
          },
          { label: 'Sales Agent', value: transfer.proposed_sales_agent_name || '—' },
          { label: 'Collector', value: transfer.proposed_account_manager_name || '—' },
          {
            label: 'Location',
            value: transferLocationLabel(transfer),
            fullWidth: true,
          },
        ]),
        onConfirm: async () => {
          setBusyKey(`xfer-om-${transfer.transfer_id}`);
          const result = await omDecideBranchTransfer(transfer.transfer_id, { decision: 'approve' });
          setBusyKey(null);
          if (result.success) {
            showToast?.(result.message || 'Transfer approved.', 'success');
            setConfirmDialog(null);
            closeProfileDrawer();
            reload();
          } else {
            showToast?.(result.message || 'Approve failed.', 'error');
            throw new Error(result.message || 'Approve failed.');
          }
        },
      });
      return;
    }
    openReasonDialog({
      key: `xfer-om-reject-${transfer.transfer_id}`,
      title: 'Reject branch transfer',
      description: 'Customer remains in the source branch. Location returns stay with Receiving BM; OM reject ends the transfer.',
      confirmLabel: 'Reject Transfer',
      onSubmit: async (reason) => {
        const result = await omDecideBranchTransfer(transfer.transfer_id, {
          decision: 'reject',
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Updated.', 'success');
          closeProfileDrawer();
          reload();
        } else {
          showToast?.(result.message || 'Failed.', 'error');
          throw new Error(result.message || 'Failed.');
        }
      },
    });
  };

  const openOmTransferReview = async (transfer) => {
    setProfileDrawer({
      open: true,
      loading: true,
      limited: false,
      title: 'Review branch transfer',
      transfer,
      profile: omTransferReviewProfile(transfer),
      actions: [
        {
          key: 'approve',
          label: 'Approve Transfer',
          onClick: () => decideOmTransfer(transfer, 'approve'),
        },
        {
          key: 'reject',
          label: 'Reject',
          variant: 'ghost',
          onClick: () => decideOmTransfer(transfer, 'reject'),
        },
      ],
    });
    const res = await fetchCustomerById(transfer.customer_id);
    const customer = res.success ? (res.data || null) : null;
    setProfileDrawer((prev) => {
      if (!prev.open || Number(prev.transfer?.transfer_id) !== Number(transfer.transfer_id)) return prev;
      return {
        ...prev,
        loading: false,
        profile: omTransferReviewProfile(transfer, customer),
      };
    });
  };

  const focusCustomerId = (() => {
    try {
      return Number(new URLSearchParams(window.location.search).get('customerId')) || null;
    } catch {
      return null;
    }
  })();

  if (
    loading
    && !collectionList.length
    && !invoiceList.length
    && !transferList.length
    && !restockList.length
    && !stockCountList.length
  ) {
    return <LoadingState message="Loading approval center…" />;
  }

  return (
    <div className="page">
     

      <div className="segmented-control">
        {tabs.map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? 'segment active' : 'segment'}
            type="button"
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'collections' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Collections</h3>
            <p className="list-section-subtitle">
              Confirm a collection to update the customer balance, or reject it to leave the balance unchanged.
            </p>
          </div>
          {collectionList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Customer</th>
                      <th>Collector</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Amount</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationCollections.paginatedData.map((payment) => (
                      <tr
                        key={payment.collectionpayment_id}
                        data-record-key={recordKey('collection', payment.collectionpayment_id)}
                        data-highlight-alt={payment.receipt_number || undefined}
                      >
                        <td><strong>{payment.receipt_number}</strong></td>
                        <td>{payment.customer_name}</td>
                        <td>{payment.collector_name}</td>
                        <td>{payment.payment_method || '—'}</td>
                        <td>{payment.reference_number || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(Number(payment.amount))}</td>
                        <td>
                          {formatDisplayDateTime(payment.payment_date || payment.created_at)}
                          {waitingLabel(payment.payment_date || payment.created_at) ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {waitingLabel(payment.payment_date || payment.created_at)}
                            </div>
                          ) : null}
                        </td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for collection ${payment.receipt_number || payment.collectionpayment_id}`}
                            items={[
                              {
                                key: 'view',
                                label: 'View',
                                disabled: Boolean(busyKey),
                                onSelect: () => setQueueSummary({
                                  title: `Collection ${payment.receipt_number || ''}`.trim(),
                                  rows: [
                                    { label: 'Receipt', value: payment.receipt_number || '—' },
                                    { label: 'Customer', value: payment.customer_name || '—' },
                                    { label: 'Collector', value: payment.collector_name || '—' },
                                    { label: 'Method', value: payment.payment_method || '—' },
                                    { label: 'Reference', value: payment.reference_number || '—' },
                                    { label: 'Amount', value: formatCurrency(Number(payment.amount)) },
                                    { label: 'Submitted', value: formatDisplayDateTime(payment.payment_date || payment.created_at) },
                                  ],
                                }),
                              },
                              {
                                key: 'confirm',
                                label: 'Confirm',
                                disabled: Boolean(busyKey),
                                onSelect: () => confirmCollection(payment.collectionpayment_id),
                              },
                              {
                                key: 'reject',
                                label: 'Reject',
                                disabled: Boolean(busyKey),
                                onSelect: () => rejectCollection(payment.collectionpayment_id),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationCollections} />
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No collections are awaiting confirmation."
            />
          )}
        </section>
      ) : null}

      {tab === 'invoices' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Sales Invoices</h3>
            <p className="list-section-subtitle">
              Acknowledge a sale logged by a sales agent, or reject it with a reason.
            </p>
          </div>
          {loading && !invoiceList.length ? (
            <LoadingState message="Loading sales invoices…" />
          ) : invoiceList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Sales Agent</th>
                      <th className="is-money">Amount</th>
                      <th>Terms</th>
                      <th>Submitted</th>
                      <th aria-label="Row actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginationInvoices.paginatedData.map((inv) => {
                      const amount = invoiceAmountDisplay(inv);
                      const submittedAt = inv.created_at || inv.invoices_date;
                      return (
                        <tr
                          key={inv.sales_invoices_id}
                          className="clickable-row"
                          data-record-key={recordKey('invoice', inv.sales_invoices_id || inv.invoice_number)}
                          data-highlight-alt={inv.invoice_number || undefined}
                          onClick={() => setInvoiceReview({
                            open: true,
                            id: inv.sales_invoices_id,
                            seed: inv,
                          })}
                        >
                          <td><strong>{inv.invoice_number}</strong></td>
                          <td>
                            {inv.customer_name}
                            {inv.customer_code ? (
                              <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                                {inv.customer_code}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <span className="received-by-cell">
                              <span>{inv.sales_agent_name}</span>
                              <span className="role-inline-badge">Sales Agent</span>
                            </span>
                          </td>
                          <td className="is-money tabular-nums">
                            <strong>{formatCurrency(amount.finalAmt)}</strong>
                            {amount.discounted ? (
                              <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                                was {formatCurrency(amount.original)}
                              </span>
                            ) : null}
                          </td>
                          <td>{invoiceTermsLabel(inv)}</td>
                          <td>
                            {formatDisplayDateTime(submittedAt)}
                            {waitingLabel(submittedAt) ? (
                              <div className={waitingToneClass(submittedAt)} style={{ fontSize: '0.75rem' }}>
                                {waitingLabel(submittedAt)}
                              </div>
                            ) : null}
                          </td>
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu
                              label="Row actions"
                              items={[
                                {
                                  key: 'view',
                                  label: 'View details',
                                  disabled: Boolean(busyKey),
                                  onSelect: () => setInvoiceReview({
                                    open: true,
                                    id: inv.sales_invoices_id,
                                    seed: inv,
                                  }),
                                },
                                {
                                  key: 'ack',
                                  label: 'Acknowledge',
                                  disabled: Boolean(busyKey),
                                  onSelect: () => confirmInvoice(inv.sales_invoices_id),
                                },
                                {
                                  key: 'reject',
                                  label: 'Reject',
                                  disabled: Boolean(busyKey),
                                  onSelect: () => rejectInvoice(inv.sales_invoices_id),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationInvoices} />
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No sales invoices are awaiting acknowledgment."
            />
          )}
        </section>
      ) : null}

      {tab === 'transfers' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Inventory Transfers</h3>
            <p className="list-section-subtitle">
              Approve or reject only. Source warehouse ships and destination warehouse receives after approval.
            </p>
          </div>
          {transferList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Requested By</th>
                      <th>Lines</th>
                      <th>Total Qty</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationTransfers.paginatedData.map((t) => (
                      <tr
                        key={t.id}
                        data-record-key={recordKey('transfer', t.id || t.transfer_id)}
                        data-highlight-alt={t.ref || t.transfer_ref || undefined}
                      >
                        <td><strong>{t.ref || t.id}</strong></td>
                        <td>{String(t.from || '').replace(' Branch', '')}</td>
                        <td>{String(t.to || '').replace(' Branch', '')}</td>
                        <td>{t.requestedBy}</td>
                        <td>{t.lineCount || 1}</td>
                        <td>{t.qty} units</td>
                        <td>
                          {formatDisplayDate(t.date)}
                          {waitingLabel(t.date) ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>{waitingLabel(t.date)}</div>
                          ) : null}
                        </td>
                        <td><StatusBadge status={t.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for transfer ${t.transfer_ref || t.id}`}
                            items={[
                              { key: 'view', label: 'View', disabled: Boolean(busyKey), onSelect: () => openTransferDetail(t.id) },
                              { key: 'approve', label: 'Approve', disabled: Boolean(busyKey), onSelect: () => approveTransfer(t.id) },
                              { key: 'reject', label: 'Reject', disabled: Boolean(busyKey), onSelect: () => rejectTransfer(t.id) },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationTransfers} />
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No inventory transfers are awaiting approval."
            />
          )}
        </section>
      ) : null}

      {tab === 'restocks' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Restock Approvals</h3>
            <p className="list-section-subtitle">
              Approve to post supplier receipts into on-hand stock, or reject with a reason (no stock change).
            </p>
          </div>
          {restockList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Supplier</th>
                      <th>Submitted By</th>
                      <th>Lines</th>
                      <th>Total Qty</th>
                      <th>Received</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationRestocks.paginatedData.map((row) => (
                      <tr
                        key={row.restock_id}
                        data-record-key={recordKey('restock', row.restock_id)}
                        data-highlight-alt={row.restock_ref || row.delivery_ref || undefined}
                      >
                        <td><strong>{row.restock_ref}</strong></td>
                        <td>{row.supplier_name}</td>
                        <td>{row.submitted_by_name || row.recorded_by_name || '—'}</td>
                        <td>{row.line_count || 1}</td>
                        <td>+{row.total_quantity || row.quantity || 0}</td>
                        <td>
                          {formatDisplayDate(row.received_date || row.submitted_at)}
                          {waitingLabel(row.submitted_at || row.created_at) ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {waitingLabel(row.submitted_at || row.created_at)}
                            </div>
                          ) : null}
                        </td>
                        <td><StatusBadge status={row.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for restock ${row.restock_id}`}
                            items={[
                              { key: 'view', label: 'View', disabled: Boolean(busyKey), onSelect: () => openRestockDetail(row.restock_id) },
                              { key: 'approve', label: 'Approve', disabled: Boolean(busyKey), onSelect: () => approveRestock(row.restock_id) },
                              { key: 'reject', label: 'Reject', disabled: Boolean(busyKey), onSelect: () => rejectRestock(row.restock_id) },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationRestocks} />
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No restocks are awaiting approval."
            />
          )}
        </section>
      ) : null}

      {tab === 'stock-counts' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Stock Count Approvals</h3>
            <p className="list-section-subtitle">
              Variance counts require approval before inventory balances change.
            </p>
          </div>
          {stockCountList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Counted By</th>
                      <th>Lines</th>
                      <th>Variances</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationStockCounts.paginatedData.map((row) => (
                      <tr
                        key={row.count_id}
                        data-record-key={recordKey('stock_count', row.count_id)}
                        data-highlight-alt={row.count_ref || undefined}
                      >
                        <td><strong>{row.count_ref}</strong></td>
                        <td>{row.counted_by_name || '—'}</td>
                        <td>{row.line_count || 0}</td>
                        <td>{row.discrepancy_count || 0}</td>
                        <td>
                          {formatDisplayDateTime(row.created_at)}
                          {waitingLabel(row.created_at) ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {waitingLabel(row.created_at)}
                            </div>
                          ) : null}
                        </td>
                        <td><StatusBadge status={row.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for stock count ${row.count_id}`}
                            items={[
                              { key: 'view', label: 'View', disabled: Boolean(busyKey), onSelect: () => openStockCountDetail(row.count_id) },
                              { key: 'approve', label: 'Approve', disabled: Boolean(busyKey), onSelect: () => approveStockCount(row.count_id) },
                              { key: 'reject', label: 'Reject', disabled: Boolean(busyKey), onSelect: () => rejectStockCount(row.count_id) },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationStockCounts} />
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No variance stock counts are awaiting approval."
            />
          )}
        </section>
      ) : null}

      {tab === 'identity' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Territory / Identity Reviews</h3>
            <p className="list-section-subtitle">
              Approve territory-exception registrations (and other Pending Identity Review holds) so the account can sell, or reject to mark Inactive.
            </p>
          </div>
          {identityReviewList.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Code</th>
                    <th>Territory</th>
                    <th>Hold</th>
                    <th>Exception note</th>
                    <th>Sales Agent</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {identityReviewList.map((customer) => {
                    const name = formatCustomerFullName(customer) || customerDisplayName(customer) || '—';
                    const code = formatCustomerDisplayId(customer);
                    return (
                      <tr
                        key={customer.customer_id}
                        data-record-key={recordKey('customer', customer.customer_id)}
                      >
                        <td>
                          <strong>{name}</strong>
                          <div style={{ marginTop: 4 }}>
                            <StatusBadge status={customer.status || 'Pending Identity Review'} />
                          </div>
                        </td>
                        <td>{code}</td>
                        <td>{customer.territory_name || '—'}</td>
                        <td>{identityHoldLabel(customer)}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>
                          {customer.territory_override_note || '—'}
                        </td>
                        <td>{customer.assigned_sales_agent_name || '—'}</td>
                        <td>{formatDisplayDateTime(customer.created_at)}</td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for ${name}`}
                            items={[
                              {
                                key: 'view',
                                label: 'View customer',
                                disabled: Boolean(busyKey),
                                onSelect: () => navigate(`${opsBase}/customers/${customer.customer_id}`),
                              },
                              {
                                key: 'details',
                                label: 'Review details',
                                disabled: Boolean(busyKey),
                                onSelect: () => setQueueSummary({
                                  title: `${identityHoldLabel(customer)} · ${name}`,
                                  rows: [
                                    { label: 'Customer', value: name },
                                    { label: 'Code', value: code },
                                    { label: 'Territory', value: customer.territory_name || '—' },
                                    { label: 'Address', value: customer.address || '—' },
                                    { label: 'Exception note', value: customer.territory_override_note || '—' },
                                    { label: 'Sales Agent', value: customer.assigned_sales_agent_name || '—' },
                                    { label: 'Submitted', value: formatDisplayDateTime(customer.created_at) },
                                  ],
                                }),
                              },
                              {
                                key: 'approve',
                                label: 'Approve & activate',
                                disabled: Boolean(busyKey),
                                onSelect: () => approveIdentityReview(customer),
                              },
                              {
                                key: 'reject',
                                label: 'Reject registration',
                                disabled: Boolean(busyKey),
                                onSelect: () => rejectIdentityReview(customer),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No territory exception or identity reviews are pending."
            />
          )}
        </section>
      ) : null}

      {tab === 'customer-changes' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Customer Change Approvals</h3>
            <p className="list-section-subtitle">Review Sales Agent proposals before the master customer record changes.</p>
          </div>
          {customerChangeList.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Requested By</th>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customerChangeList.map((request) => (
                    <tr
                      key={request.request_id}
                      data-record-key={recordKey('customer_change', request.request_id)}
                    >
                      <td><strong>{request.customer_name || request.customer_code || `#${request.customer_id}`}</strong></td>
                      <td>{request.requester_name || '—'}</td>
                      <td>{request.change_type}</td>
                      <td>{request.reason || '—'}</td>
                      <td>{formatDisplayDateTime(request.created_at)}</td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu
                          label={`Actions for customer change ${request.request_id}`}
                          items={[
                            {
                              key: 'view',
                              label: 'View',
                              disabled: Boolean(busyKey),
                              onSelect: () => setQueueSummary({
                                title: `Customer change #${request.request_id}`,
                                rows: [
                                  { label: 'Customer', value: request.customer_name || request.customer_code || request.customer_id || '—' },
                                  { label: 'Requested by', value: request.requester_name || '—' },
                                  { label: 'Change type', value: request.change_type || request.request_type || '—' },
                                  {
                                    label: 'Proposed fields',
                                    value: request.proposed_json && typeof request.proposed_json === 'object'
                                      ? Object.keys(request.proposed_json).join(', ') || '—'
                                      : '—',
                                  },
                                  { label: 'Reason', value: request.reason || '—' },
                                  { label: 'Submitted', value: formatDisplayDateTime(request.created_at) },
                                ],
                              }),
                            },
                            { key: 'approve', label: 'Approve', disabled: Boolean(busyKey), onSelect: () => approveCustomerChange(request.request_id) },
                            { key: 'reject', label: 'Reject', disabled: Boolean(busyKey), onSelect: () => rejectCustomerChange(request.request_id) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nothing waiting for your decision" description="No customer changes are awaiting approval." />
          )}
        </section>
      ) : null}

      {tab === 'branch-transfers' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Customer Branch Transfers</h3>
            <p className="list-section-subtitle">
              SA provides current location → Receiving BM confirms territory → Source BM releases ownership → OM final approval. Same Customer ID is preserved.
            </p>
          </div>
          {branchTransferList.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Customer ID</th>
                    <th>From → Receiving</th>
                    <th>Current Location</th>
                    <th>Territory / Staffing</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {branchTransferList.map((transfer) => {
                    const draft = transferDrafts[transfer.transfer_id] || {};
                    const actorBranch = Number(getUserBranchId(currentUser));
                    const isSourceBm = !isOm && actorBranch === Number(transfer.source_branch_id);
                    const isReceivingBm = !isOm && actorBranch === Number(transfer.target_branch_id);
                    const needsReceiving = transfer.status === 'Pending Receiving';
                    const needsSource = transfer.status === 'Pending Source';
                    const locationLabel = transferLocationLabel(transfer);
                    const omCanDecide = isOm && transfer.status === 'Pending OM';
                    return (
                      <tr key={transfer.transfer_id}>
                        <td style={{ verticalAlign: 'top', whiteSpace: 'normal' }}>
                          <strong>
                            {transferCustomerLabel(transfer)}
                          </strong>
                          <div style={{ marginTop: 4 }}>
                            <StatusBadge status={transfer.customer_status || 'Active'} />
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {formatCustomerDisplayId(transfer)}
                        </td>
                        <td style={{ verticalAlign: 'top', whiteSpace: 'normal', maxWidth: 180 }}>
                          <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {transfer.source_branch_name || transfer.source_branch_id}
                            {' → '}
                            {transfer.target_branch_name || transfer.target_branch_id}
                          </div>
                          <div className="muted" style={{ fontSize: '0.75rem', overflowWrap: 'anywhere' }}>
                            Requested by {transfer.requester_name || '—'}
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', maxWidth: 200, width: '22%' }}>
                          <div style={{ fontSize: '0.85rem', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                            {locationLabel}
                          </div>
                          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4, overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                            {transfer.reason || '—'}
                          </div>
                          {transfer.revision_note ? (
                            <p className="form-error" style={{ fontSize: '0.75rem', margin: '4px 0 0', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              Return note: {transfer.revision_note}
                            </p>
                          ) : null}
                        </td>
                        <td style={{ verticalAlign: 'top', maxWidth: 200, whiteSpace: 'normal' }}>
                          {needsReceiving && isReceivingBm ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <select
                                className="filter-select"
                                value={draft.target_territory_id || transfer.target_territory_id || transfer.proposed_territory_id || ''}
                                onFocus={() => {
                                  loadTerritoriesForTransfer(transfer.transfer_id);
                                  loadReceivingStaffOptions();
                                }}
                                onChange={(e) => setTransferDrafts((prev) => ({
                                  ...prev,
                                  [transfer.transfer_id]: {
                                    ...prev[transfer.transfer_id],
                                    target_territory_id: e.target.value,
                                  },
                                }))}
                              >
                                <option value="">Confirm receiving territory</option>
                                {(targetTerritoryOptionsByTransfer[transfer.transfer_id] || []).map((t) => (
                                  <option key={t.territory_id} value={t.territory_id}>
                                    {t.territory_name}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="filter-select"
                                value={draft.assigned_sales_agent_id
                                  || transfer.proposed_assigned_sales_agent_id
                                  || transfer.requested_by
                                  || ''}
                                onFocus={() => loadReceivingStaffOptions()}
                                onChange={(e) => setTransferDrafts((prev) => ({
                                  ...prev,
                                  [transfer.transfer_id]: {
                                    ...prev[transfer.transfer_id],
                                    assigned_sales_agent_id: e.target.value,
                                  },
                                }))}
                              >
                                <option value="">Assign Sales Agent</option>
                                {receivingSalesAgents.map((u) => (
                                  <option key={u.id} value={u.id}>{staffDisplayName(u)}</option>
                                ))}
                              </select>
                              <select
                                className="filter-select"
                                value={draft.account_manager_id || transfer.proposed_account_manager_id || ''}
                                onFocus={() => loadReceivingStaffOptions()}
                                onChange={(e) => setTransferDrafts((prev) => ({
                                  ...prev,
                                  [transfer.transfer_id]: {
                                    ...prev[transfer.transfer_id],
                                    account_manager_id: e.target.value,
                                  },
                                }))}
                              >
                                <option value="">Assign Collector</option>
                                {receivingCollectors.map((u) => (
                                  <option key={u.id} value={u.id}>{staffDisplayName(u)}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <div>
                                {transfer.target_territory_name
                                  || transfer.proposed_territory_name
                                  || transfer.target_territory_id
                                  || transfer.proposed_territory_id
                                  || '—'}
                              </div>
                              {(transfer.proposed_sales_agent_name || transfer.proposed_account_manager_name) ? (
                                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                                  SA: {transfer.proposed_sales_agent_name || '—'}
                                  <br />
                                  Collector: {transfer.proposed_account_manager_name || '—'}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td><StatusBadge status={transfer.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for branch transfer ${transfer.transfer_id}`}
                            items={[
                              !isOm
                                && !((needsReceiving && isReceivingBm) || (needsSource && isSourceBm)) && {
                                key: 'view-transfer',
                                label: 'View Transfer Details',
                                disabled: Boolean(busyKey),
                                onSelect: () => setQueueSummary({
                                  title: `Branch transfer ${transferRefLabel(transfer)}`,
                                  rows: [
                                    { label: 'Customer', value: transferCustomerLabel(transfer) },
                                    { label: 'Customer ID', value: formatCustomerDisplayId(transfer) },
                                    { label: 'From → Receiving', value: `${transfer.source_branch_name || transfer.source_branch_id} → ${transfer.target_branch_name || transfer.target_branch_id}` },
                                    { label: 'Location', value: locationLabel },
                                    { label: 'Status', value: transfer.status },
                                    { label: 'Requested by', value: transfer.requester_name || '—' },
                                    { label: 'Reason', value: transfer.reason || '—' },
                                    { label: 'Territory', value: transfer.target_territory_name || transfer.proposed_territory_name || '—' },
                                    { label: 'Source release note', value: transfer.source_release_note || '—' },
                                  ],
                                }),
                              },
                              needsReceiving && isReceivingBm && {
                                key: 'review-incoming',
                                label: 'Review Customer Info',
                                disabled: Boolean(busyKey),
                                onSelect: () => openReceivingTransferReview(transfer),
                              },
                              needsReceiving && isReceivingBm && {
                                key: 'confirm-territory',
                                label: 'Confirm Territory & Staffing',
                                disabled: Boolean(busyKey),
                                onSelect: () => submitReceivingTransfer(transfer),
                              },
                              needsReceiving && isReceivingBm && {
                                key: 'return-sa',
                                label: 'Return to SA',
                                disabled: Boolean(busyKey),
                                onSelect: () => returnReceivingTransfer(transfer),
                              },
                              needsSource && isSourceBm && {
                                key: 'view-profile',
                                label: 'View Customer Profile',
                                disabled: Boolean(busyKey),
                                onSelect: () => navigate(`/branch-manager/customers/${transfer.customer_id}`),
                              },
                              needsSource && isSourceBm && {
                                key: 'release',
                                label: 'Release Ownership',
                                disabled: Boolean(busyKey),
                                onSelect: () => submitSourceTransfer(transfer),
                              },
                              needsSource && isSourceBm && {
                                key: 'source-reject',
                                label: 'Reject',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideSourceTransfer(transfer),
                              },
                              omCanDecide && {
                                key: 'review',
                                label: 'Review Customer Info',
                                disabled: Boolean(busyKey),
                                onSelect: () => openOmTransferReview(transfer),
                              },
                              omCanDecide && {
                                key: 'approve',
                                label: 'Approve',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideOmTransfer(transfer, 'approve'),
                              },
                              omCanDecide && {
                                key: 'reject',
                                label: 'Reject',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideOmTransfer(transfer, 'reject'),
                              },
                              isOm && !omCanDecide && {
                                key: 'oversight',
                                label: 'View Transfer Details',
                                disabled: Boolean(busyKey),
                                onSelect: () => setQueueSummary({
                                  title: `Branch transfer ${transferRefLabel(transfer)}`,
                                  rows: [
                                    { label: 'Customer', value: transferCustomerLabel(transfer) },
                                    { label: 'Customer ID', value: formatCustomerDisplayId(transfer) },
                                    { label: 'From → Receiving', value: `${transfer.source_branch_name || transfer.source_branch_id} → ${transfer.target_branch_name || transfer.target_branch_id}` },
                                    { label: 'Location', value: locationLabel },
                                    { label: 'Status', value: transfer.status },
                                    { label: 'Requested by', value: transfer.requester_name || '—' },
                                    { label: 'Reason', value: transfer.reason || '—' },
                                    { label: 'Territory', value: transfer.target_territory_name || transfer.proposed_territory_name || '—' },
                                    { label: 'Source release note', value: transfer.source_release_note || '—' },
                                  ],
                                }),
                              },
                            ].filter(Boolean)}
                          />
                          {!isOm && !isSourceBm && !isReceivingBm ? (
                            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Waiting on Receiving BM / Source BM / OM</div>
                          ) : null}
                          {isOm && !omCanDecide ? (
                            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                              Waiting on {transfer.status === 'Pending Receiving' ? 'Receiving BM' : transfer.status === 'Pending Source' ? 'Source BM' : 'Sales Agent'}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No customer branch transfers are in progress."
            />
          )}
        </section>
      ) : null}

      <InvoiceReviewDrawer
        open={invoiceReview.open}
        invoiceId={invoiceReview.id}
        seed={invoiceReview.seed}
        busy={Boolean(busyKey)}
        onClose={() => {
          if (busyKey) return;
          setInvoiceReview({ open: false, id: null, seed: null });
        }}
        onAcknowledge={confirmInvoice}
        onReject={rejectInvoice}
      />

      <QueueSummaryModal
        open={Boolean(queueSummary)}
        title={queueSummary?.title}
        rows={queueSummary?.rows || []}
        onClose={() => setQueueSummary(null)}
      />
      <CustomerProfileDrawer
        open={profileDrawer.open}
        loading={profileDrawer.loading}
        profile={profileDrawer.profile}
        limited={Boolean(profileDrawer.limited)}
        title={profileDrawer.title || 'Customer Profile'}
        actions={profileDrawer.actions || []}
        busy={Boolean(busyKey)}
        onClose={closeProfileDrawer}
      />
      <TransferDetailModal
        detail={transferDetail}
        loading={transferDetailLoading}
        onClose={() => {
          if (busyKey) return;
          setTransferDetail(null);
        }}
        onApprove={approveTransfer}
        onReject={rejectTransfer}
        busy={Boolean(busyKey)}
      />

      <InventoryDocModal
        titleId="restock-detail-title"
        heading={restockDetail?.restock_ref}
        subtitle={restockDetail
          ? `${restockDetail.supplier_name || '—'} · ${restockDetail.submitted_by_name || restockDetail.recorded_by_name || '—'} · ${formatDisplayDate(restockDetail.received_date)}`
          : ''}
        status={restockDetail?.status}
        notes={restockDetail?.notes}
        columns={[
          { key: 'sku', label: 'SKU', render: (l) => <span className="mono-cell">{l.sku || '—'}</span> },
          { key: 'product', label: 'Product', render: (l) => <strong>{l.product_name}</strong> },
          { key: 'qty', label: 'Qty', render: (l) => `+${l.quantity}` },
        ]}
        lines={restockDetail?.lines || []}
        lineKey={(l) => l.line_id || l.product_id}
        loading={restockDetailLoading}
        loadingMessage="Loading restock lines…"
        recordEntity="restock"
        recordId={restockDetail?.restock_id}
        recordAlt={restockDetail?.restock_ref || restockDetail?.delivery_ref}
        onClose={() => { if (!busyKey) setRestockDetail(null); }}
        onApprove={() => approveRestock(restockDetail.restock_id)}
        onReject={() => rejectRestock(restockDetail.restock_id)}
        busy={Boolean(busyKey)}
      />

      <InventoryDocModal
        titleId="stock-count-detail-title"
        heading={stockCountDetail?.count_ref}
        subtitle={stockCountDetail
          ? `${stockCountDetail.counted_by_name || '—'} · ${stockCountDetail.discrepancy_count || 0} variance(s)`
          : ''}
        status={stockCountDetail?.status}
        notes={stockCountDetail?.notes}
        columns={[
          { key: 'sku', label: 'SKU', render: (l) => <span className="mono-cell">{l.sku || '—'}</span> },
          { key: 'product', label: 'Product', render: (l) => <strong>{l.product_name}</strong> },
          { key: 'system', label: 'System', render: (l) => l.system_quantity },
          { key: 'physical', label: 'Physical', render: (l) => l.physical_quantity },
          {
            key: 'variance',
            label: 'Variance',
            render: (l) => {
              const v = Number(l.variance) || 0;
              return v > 0 ? `+${v}` : String(v);
            },
          },
        ]}
        lines={stockCountDetail?.lines || []}
        lineKey={(l) => l.line_id || l.product_id}
        loading={stockCountDetailLoading}
        loadingMessage="Loading stock count lines…"
        recordEntity="stock_count"
        recordId={stockCountDetail?.count_id}
        recordAlt={stockCountDetail?.count_ref}
        onClose={() => { if (!busyKey) setStockCountDetail(null); }}
        onApprove={() => approveStockCount(stockCountDetail.count_id)}
        onReject={() => rejectStockCount(stockCountDetail.count_id)}
        busy={Boolean(busyKey)}
      />

      <ReasonDialog
        open={Boolean(reasonDialog)}
        title={reasonDialog?.title || 'Reason required'}
        description={reasonDialog?.description}
        confirmLabel={reasonDialog?.confirmLabel || 'Confirm'}
        value={reasonText}
        onChange={setReasonText}
        onCancel={closeReasonDialog}
        onConfirm={submitReasonDialog}
        busy={Boolean(busyKey)}
      />

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title || 'Confirm'}
        description={confirmDialog?.description}
        details={confirmDialog?.details || []}
        confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
        onCancel={() => {
          if (!busyKey) setConfirmDialog(null);
        }}
        onConfirm={async () => {
          if (!confirmDialog?.onConfirm) return;
          try {
            await confirmDialog.onConfirm();
          } catch {
            /* toast already shown by onConfirm */
          }
        }}
        busy={Boolean(busyKey)}
      />
    </div>
  );
}
