import { useEffect, useMemo, useState } from 'react';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { RowActionMenu } from '../shared/RowActionMenu';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import {
  fetchCreditInvestigations,
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
  mapCreditInvestigationRow,
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
  fetchCustomers,
  fetchCustomerById,
  decideCustomerIdentityReview,
  fetchBranchTransfers,
  sourceSubmitBranchTransfer,
  receivingSubmitBranchTransfer,
  omDecideBranchTransfer,
  fetchBranchTransferTargetTerritories,
} from '../../api/salesService.js';
import { getCurrentUser } from '../../api/authService.js';
import { formatMoneyOrNA } from '../../utils/creditReview';
import { CreditInvestigationDetailPage } from './CreditInvestigationPages';
import {
  getUserBranchId,
  customerDisplayName,
} from './approvalCenterHelpers.js';

function tabFromSearch() {
  try {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get('focus');
    if (focus === 'identity') return 'identity';
    const raw = params.get('tab') || '';
    const allowed = new Set([
      'collections', 'invoices', 'transfers', 'restocks', 'stock-counts',
      'ci', 'customer-changes', 'identity', 'branch-transfers',
    ]);
    return allowed.has(raw) ? raw : null;
  } catch {
    return null;
  }
}

function sortOldestFirst(rows, dateKey) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a[dateKey] || 0).getTime();
    const bTime = new Date(b[dateKey] || 0).getTime();
    return aTime - bTime;
  });
}

function waitingLabel(dateValue) {
  if (!dateValue) return null;
  const start = new Date(dateValue).getTime();
  if (!Number.isFinite(start)) return null;
  const days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
  if (days <= 0) return 'Waiting today';
  if (days === 1) return 'Waiting 1 day';
  return `Waiting ${days} days`;
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

function CustomerProfileDrawer({ open, loading, profile, onClose, title = 'Customer Profile' }) {
  if (!open) return null;
  const name = customerDisplayName(profile);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
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
                <p className="muted" style={{ margin: 0 }}>Read-only — viewing does not approve or change the record.</p>
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
                <dd style={{ margin: 0 }}>{formatDisplayDateTime(profile.created_at)}</dd>
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
              {(profile.match_reasons || []).length ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="muted">Match indicators</dt>
                  <dd style={{ margin: 0 }}>{(profile.match_reasons || []).join(', ')}</dd>
                </div>
              ) : null}
              {profile.activity || profile.credit ? (
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
              <div>
                <dt className="muted">ID verification</dt>
                <dd style={{ margin: 0 }}>{profile.id_verification_status || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Phone verification</dt>
                <dd style={{ margin: 0 }}>{profile.phone_verification_status || '—'}</dd>
              </div>
            </dl>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button" type="button" onClick={onClose}>Back to Identity Review</button>
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

function TransferDetailModal({
  detail,
  loading,
  onClose,
  onApprove,
  onReject,
  busy,
}) {
  if (!loading && !detail) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-detail-title"
      onClick={onClose}
    >
      <div className="modal-content" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
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
}) {
  if (!loading && !heading) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
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
  const [tab, setTab] = useState(() => tabFromSearch() || 'collections');
  const [ciList, setCiList] = useState([]);
  const [selectedCiId, setSelectedCiId] = useState(null);
  const [transferList, setTransferList] = useState([]);
  const [restockList, setRestockList] = useState([]);
  const [stockCountList, setStockCountList] = useState([]);
  const [invoiceList, setInvoiceList] = useState([]);
  const [collectionList, setCollectionList] = useState([]);
  const [customerChangeList, setCustomerChangeList] = useState([]);
  const [identityList, setIdentityList] = useState([]);
  const [branchTransferList, setBranchTransferList] = useState([]);
  const [targetTerritoryOptionsByTransfer, setTargetTerritoryOptionsByTransfer] = useState({});
  const [transferDrafts, setTransferDrafts] = useState({});
  const [summary, setSummary] = useState(null);
  const [queueSummary, setQueueSummary] = useState(null);
  const [profileDrawer, setProfileDrawer] = useState({ open: false, loading: false, profile: null });
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

  const reload = async () => {
    setLoading(true);
    const [ciRes, trRes, restockRes, countRes, invRes, pendingPayRes, summaryRes, changesRes, identityRes, xferRes] = await Promise.all([
      fetchCreditInvestigations({ status: 'Needs BM', limit: 100 }),
      fetchInventoryTransfers({ status: 'pending', limit: 100 }),
      fetchPendingRestocks(),
      fetchPendingStockCounts(),
      fetchPendingSalesInvoices(),
      fetchCollectionsForReview('Pending'),
      fetchApprovalCenterSummary(),
      fetchCustomerChangeRequests({ status: 'Pending' }),
      fetchCustomers({ status: 'Pending Identity Review', limit: 100 }),
      fetchBranchTransfers({ limit: 100 }),
    ]);

    const nextCi = ciRes.success
      ? sortOldestFirst(
        (ciRes.data || [])
          .map(mapCreditInvestigationRow)
          .filter((row) => row.status === 'Pending' || row.status === 'Revision Requested'),
        'submissionDate'
      )
      : [];
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
      ? sortOldestFirst(invRes.data || [], 'invoices_date')
      : [];
    const nextCollections = pendingPayRes.success
      ? sortOldestFirst(pendingPayRes.data || [], 'payment_date')
      : [];

    setCiList(nextCi);
    setTransferList(nextTransfers);
    setRestockList(nextRestocks);
    setStockCountList(nextCounts);
    setInvoiceList(nextInvoices);
    setCollectionList(nextCollections);
    setCustomerChangeList(changesRes.success ? (changesRes.data || []) : []);
    const nextIdentity = identityRes.success
      ? sortOldestFirst(identityRes.data || [], 'created_at')
      : [];
    setIdentityList(nextIdentity);
    const nextXfers = xferRes.success
      ? sortOldestFirst(xferRes.data || [], 'created_at')
      : [];
    setBranchTransferList(nextXfers);
    if (summaryRes.success) setSummary(summaryRes.data || null);
    else setSummary(null);

    const preferred = tabFromSearch();
    const identityCount = nextIdentity.length;
    const counts = {
      collections: nextCollections.length,
      invoices: nextInvoices.length,
      transfers: nextTransfers.length,
      restocks: nextRestocks.length,
      'stock-counts': nextCounts.length,
      ci: nextCi.length,
      'customer-changes': changesRes.success ? (changesRes.data || []).length : 0,
      identity: identityCount,
      'branch-transfers': nextXfers.length,
    };
    setTab((current) => {
      if (preferred && counts[preferred] != null) return preferred;
      if (counts[current] > 0) return current;
      if (counts.collections > 0) return 'collections';
      if (counts.invoices > 0) return 'invoices';
      if (counts.transfers > 0) return 'transfers';
      if (counts.restocks > 0) return 'restocks';
      if (counts['stock-counts'] > 0) return 'stock-counts';
      if (counts.ci > 0) return 'ci';
      if (counts['customer-changes'] > 0) return 'customer-changes';
      if (counts.identity > 0) return 'identity';
      if (counts['branch-transfers'] > 0) return 'branch-transfers';
      return 'collections';
    });

    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const counts = useMemo(() => ({
    collections: collectionList.length,
    invoices: invoiceList.length,
    transfers: transferList.length,
    restocks: restockList.length,
    'stock-counts': stockCountList.length,
    ci: ciList.length,
    'customer-changes': customerChangeList.length,
    identity: identityList.length,
    'branch-transfers': branchTransferList.length,
  }), [collectionList, invoiceList, transferList, restockList, stockCountList, ciList, customerChangeList, identityList, branchTransferList]);

  const tabs = [
    { key: 'collections', label: `Collections (${counts.collections})` },
    { key: 'invoices', label: `Sales Invoices (${counts.invoices})` },
    { key: 'transfers', label: `Inventory Transfers (${counts.transfers})` },
    { key: 'restocks', label: `Restocks (${counts.restocks})` },
    { key: 'stock-counts', label: `Stock Counts (${counts['stock-counts']})` },
    { key: 'ci', label: `Credit Reviews (${counts.ci})` },
    { key: 'customer-changes', label: `Customer Changes (${counts['customer-changes']})` },
    { key: 'identity', label: `Identity Review (${counts.identity})` },
    { key: 'branch-transfers', label: `Branch Transfers (${counts['branch-transfers']})` },
  ];

  const paginationCollections = usePagination(collectionList);
  const paginationInvoices = usePagination(invoiceList);
  const paginationTransfers = usePagination(transferList);
  const paginationRestocks = usePagination(restockList);
  const paginationStockCounts = usePagination(stockCountList);
  const paginationCi = usePagination(ciList);

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

  const confirmInvoice = async (invoiceId) => {
    setBusyKey(`invoice-confirm-${invoiceId}`);
    const result = await patchSalesInvoiceReview(invoiceId, { status: 'Confirmed' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Invoice acknowledged.', 'success');
      reload();
    } else showToast?.(result.message || 'Acknowledge failed.', 'error');
  };

  const rejectInvoice = (invoiceId) => {
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
          reload();
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

  const approveIdentityReview = async (customerId) => {
    setBusyKey(`identity-approve-${customerId}`);
    const result = await decideCustomerIdentityReview(customerId, { decision: 'approve' });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Customer identity approved.', 'success');
      reload();
    } else showToast?.(result.message || 'Approve failed.', 'error');
  };

  const rejectIdentityReview = (customerId) => {
    openReasonDialog({
      key: `identity-reject-${customerId}`,
      title: 'Reject customer identity',
      description: 'The customer will be set Inactive and remain blocked from sales.',
      confirmLabel: 'Reject Identity',
      onSubmit: async (reason) => {
        const result = await decideCustomerIdentityReview(customerId, {
          decision: 'reject',
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Customer identity rejected.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Reject failed.', 'error');
          throw new Error(result.message || 'Reject failed.');
        }
      },
    });
  };

;

  const loadTerritoriesForTransfer = async (transferId) => {
    const res = await fetchBranchTransferTargetTerritories(transferId);
    const rows = res.success ? (res.data || []) : [];
    setTargetTerritoryOptionsByTransfer((prev) => ({ ...prev, [transferId]: rows }));
  };

  const submitReceivingTransfer = async (transfer) => {
    const draft = transferDrafts[transfer.transfer_id] || {};
    const territoryId = Number(
      draft.target_territory_id
      || transfer.target_territory_id
      || transfer.proposed_territory_id
    );
    if (!territoryId) {
      showToast?.('Select or confirm a receiving territory.', 'error');
      return;
    }
    setBusyKey(`xfer-recv-${transfer.transfer_id}`);
    const result = await receivingSubmitBranchTransfer(transfer.transfer_id, {
      decision: 'confirm',
      target_territory_id: territoryId,
      note: draft.note || null,
    });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Territory confirmed.', 'success');
      reload();
    } else showToast?.(result.message || 'Submit failed.', 'error');
  };

  const returnReceivingTransfer = (transfer) => {
    openReasonDialog({
      key: `xfer-recv-return-${transfer.transfer_id}`,
      title: 'Return location to Sales Agent',
      description: 'Ask the SA to correct the customer\'s current address or landmark.',
      confirmLabel: 'Return to SA',
      onSubmit: async (reason) => {
        const result = await receivingSubmitBranchTransfer(transfer.transfer_id, {
          decision: 'return',
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Returned to SA.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Failed.', 'error');
          throw new Error(result.message || 'Failed.');
        }
      },
    });
  };

  const submitSourceTransfer = async (transfer) => {
    setBusyKey(`xfer-source-${transfer.transfer_id}`);
    const result = await sourceSubmitBranchTransfer(transfer.transfer_id, {
      decision: 'release',
      note: transferDrafts[transfer.transfer_id]?.note || null,
    });
    setBusyKey(null);
    if (result.success) {
      showToast?.(result.message || 'Ownership released to OM.', 'success');
      reload();
    } else showToast?.(result.message || 'Submit failed.', 'error');
  };

  const decideSourceTransfer = (transfer, decision) => {
    openReasonDialog({
      key: `xfer-source-${decision}-${transfer.transfer_id}`,
      title: decision === 'reject' ? 'Reject ownership release' : 'Return transfer to SA',
      description: decision === 'reject'
        ? 'Customer remains in the source branch.'
        : 'Sales Agent must correct location details.',
      confirmLabel: decision === 'reject' ? 'Reject Transfer' : 'Return to SA',
      onSubmit: async (reason) => {
        const result = await sourceSubmitBranchTransfer(transfer.transfer_id, {
          decision,
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Updated.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Failed.', 'error');
          throw new Error(result.message || 'Failed.');
        }
      },
    });
  };

  const decideOmTransfer = (transfer, decision) => {
    if (decision === 'approve') {
      setBusyKey(`xfer-om-${transfer.transfer_id}`);
      omDecideBranchTransfer(transfer.transfer_id, { decision: 'approve' }).then((result) => {
        setBusyKey(null);
        if (result.success) {
          showToast?.(result.message || 'Transfer approved.', 'success');
          reload();
        } else showToast?.(result.message || 'Approve failed.', 'error');
      });
      return;
    }
    openReasonDialog({
      key: `xfer-om-${decision}-${transfer.transfer_id}`,
      title: decision === 'reject' ? 'Reject branch transfer' : 'Return to Sales Agent',
      description: decision === 'reject'
        ? 'Customer remains in the source branch.'
        : 'Sales Agent must correct location before Receiving BM re-validates.',
      confirmLabel: decision === 'reject' ? 'Reject Transfer' : 'Return to SA',
      onSubmit: async (reason) => {
        const result = await omDecideBranchTransfer(transfer.transfer_id, {
          decision: decision === 'needs_revision' ? 'return' : decision,
          note: reason,
        });
        if (result.success) {
          showToast?.(result.message || 'Updated.', 'success');
          reload();
        } else {
          showToast?.(result.message || 'Failed.', 'error');
          throw new Error(result.message || 'Failed.');
        }
      },
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
    && !ciList.length
    && !identityList.length
  ) {
    return <LoadingState message="Loading approval center…" />;
  }

  return (
    <div className="page">
      <section className="panel content-panel" style={{ marginBottom: 12 }}>
        <div className="list-section-header">
          <div>
            <h3>Approval Center</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Pending decisions for your branch.
            </p>
          </div>
          <button className="button secondary" type="button" disabled={loading || Boolean(busyKey)} onClick={reload}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

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
                      <tr key={payment.collectionpayment_id}>
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
          {invoiceList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Sales Agent</th>
                      <th>Amount</th>
                      <th>Terms</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationInvoices.paginatedData.map((inv) => (
                      <tr key={inv.sales_invoices_id}>
                        <td><strong>{inv.invoice_number}</strong></td>
                        <td>{inv.customer_name}</td>
                        <td>{inv.sales_agent_name}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(Number(inv.total_amount))}</td>
                        <td>
                          {inv.pay_type
                            ? `${inv.pay_type}${inv.term_months ? ` · ${inv.term_months} mo` : ''}`
                            : '—'}
                        </td>
                        <td>
                          {formatDisplayDateTime(inv.invoices_date || inv.created_at)}
                          {waitingLabel(inv.invoices_date || inv.created_at) ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {waitingLabel(inv.invoices_date || inv.created_at)}
                            </div>
                          ) : null}
                        </td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for invoice ${inv.invoice_number || inv.sales_invoices_id}`}
                            items={[
                              {
                                key: 'view',
                                label: 'View',
                                disabled: Boolean(busyKey),
                                onSelect: () => setQueueSummary({
                                  title: `Invoice ${inv.invoice_number || inv.sales_invoices_id}`,
                                  rows: [
                                    { label: 'Invoice', value: inv.invoice_number || inv.sales_invoices_id },
                                    { label: 'Customer', value: inv.customer_name || '—' },
                                    { label: 'Sales Agent', value: inv.sales_agent_name || inv.agent_name || '—' },
                                    { label: 'Amount', value: formatCurrency(Number(inv.total_amount ?? inv.amount ?? 0)) },
                                    { label: 'Status', value: inv.status || '—' },
                                    { label: 'Submitted', value: formatDisplayDateTime(inv.created_at || inv.invoice_date) },
                                  ],
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
                    ))}
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
                      <tr key={t.id}>
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
                      <tr key={row.restock_id}>
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
                      <tr key={row.count_id}>
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

      {tab === 'ci' ? (
        <section className="panel content-panel relative overflow-hidden">
          {selectedCiId ? (
            <>
              <div className="mb-4" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    setSelectedCiId(null);
                    reload();
                  }}
                >
                  Back to CI queue
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => navigate(`${opsBase}/ci-approvals/${selectedCiId}`)}
                >
                  Open full desk
                </button>
              </div>
              <CreditInvestigationDetailPage
                ciId={selectedCiId}
                navigate={navigate}
                opsBase={opsBase}
                showToast={showToast}
              />
            </>
          ) : (
          <>
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3>Credit Reviews</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Review and decide here. Same decide UI as the Credit Review desk.
              </p>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={() => navigate(`${opsBase}/ci-approvals`)}
            >
              Full Credit Review Queue
            </button>
          </div>
          {ciList.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Sales Agent</th>
                      <th>Risk</th>
                      <th>Requested / Suggested</th>
                      <th>Waiting Since</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationCi.paginatedData.map((ci) => (
                      <tr
                        key={ci.id}
                        className="clickable-row"
                        onClick={() => setSelectedCiId(ci.ciId || ci.id)}
                      >
                        <td>
                          <strong>{ci.customerName}</strong>
                          {ci.customerCode ? (
                            <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                              {ci.customerCode}
                            </span>
                          ) : null}
                        </td>
                        <td>{ci.submittedBy || '—'}</td>
                        <td><StatusBadge status={ci.riskLevel || '—'} /></td>
                        <td>
                          <div>{formatMoneyOrNA(ci.requestedLimit)} requested</div>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>
                            {formatMoneyOrNA(ci.suggestedLimit)} suggested
                          </div>
                        </td>
                        <td>
                          {formatDisplayDate(ci.submissionDate)}
                          {waitingLabel(ci.submissionDate) ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {waitingLabel(ci.submissionDate)}
                            </div>
                          ) : null}
                        </td>
                        <td><StatusBadge status={ci.displayStatus || ci.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for credit review ${ci.ciId || ci.id}`}
                            items={[
                              { key: 'view', label: 'View', onSelect: () => setSelectedCiId(ci.ciId || ci.id) },
                              { key: 'desk', label: 'Open full desk', onSelect: () => navigate(`${opsBase}/ci-approvals/${ci.ciId || ci.id}`) },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationCi} />
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for your decision"
              description="No credit reviews are awaiting a Branch Manager decision."
              actionLabel="Full Credit Review Queue"
              onAction={() => navigate(`${opsBase}/ci-approvals`)}
            />
          )}
          </>
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
                    <tr key={request.request_id}>
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
                                  { label: 'Summary', value: request.summary || request.change_summary || request.notes || '—' },
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

      {tab === 'identity' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Customer Identity Review</h3>
            <p className="list-section-subtitle">
              Review customers held in Pending Identity Review. Possible-match registration is blocked at Find Existing Customer — no Branch Manager verification tickets are created.
            </p>
          </div>

          {identityList.length ? (
            <>
              <h4 className="subsection-title">Legacy held customers (Pending Identity Review)</h4>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Matches</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {identityList.map((customer) => {
                      const candidates = customer.identity_match_json?.candidates || [];
                      return (
                        <tr key={customer.customer_id}>
                          <td>
                            <strong>
                              {[customer.first_name, customer.last_name].filter(Boolean).join(' ')
                                || `#${customer.customer_id}`}
                            </strong>
                            <StatusBadge status={customer.status} />
                          </td>
                          <td>{customer.contact_phone || '—'}</td>
                          <td>
                            {candidates.map((m) => (
                              <div key={m.customer_id} className="muted" style={{ fontSize: '0.8rem' }}>
                                {m.display_name || m.customer_code}
                                {m.branch_name ? ` · ${m.branch_name}` : ''}
                                {m.cross_branch ? ' (other branch)' : ''}
                              </div>
                            ))}
                          </td>
                          <td>{formatDisplayDateTime(customer.created_at)}</td>
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu
                              label={`Actions for customer ${customer.customer_id}`}
                              items={[
                                {
                                  key: 'view',
                                  label: 'View Profile',
                                  disabled: Boolean(busyKey),
                                  onSelect: async () => {
                                    setProfileDrawer({ open: true, loading: true, profile: null });
                                    const res = await fetchCustomerById(customer.customer_id);
                                    if (!res.success || !res.data) {
                                      setProfileDrawer({ open: false, loading: false, profile: null });
                                      showToast?.(res.message || 'Could not load customer profile.', 'error');
                                      return;
                                    }
                                    setProfileDrawer({
                                      open: true,
                                      loading: false,
                                      profile: {
                                        ...res.data,
                                        contact_phone_masked: res.data.contact_phone,
                                      },
                                    });
                                  },
                                },
                                {
                                  key: 'approve',
                                  label: 'Approve',
                                  disabled: Boolean(busyKey),
                                  onSelect: () => approveIdentityReview(customer.customer_id),
                                },
                                {
                                  key: 'reject',
                                  label: 'Reject',
                                  disabled: Boolean(busyKey),
                                  onSelect: () => rejectIdentityReview(customer.customer_id),
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
            </>
          ) : (
            <EmptyState
              title="Nothing waiting for identity review"
              description="No customers are held in Pending Identity Review."
            />
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
                    <th>Proposed Territory</th>
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
                    const locationLabel = [
                      transfer.address_street,
                      transfer.address_barangay,
                      transfer.address_city,
                      transfer.address_province,
                    ].filter(Boolean).join(', ') || transfer.address || '—';
                    return (
                      <tr key={transfer.transfer_id}>
                        <td>
                          <strong>
                            {[transfer.first_name, transfer.last_name].filter(Boolean).join(' ')
                              || transfer.customer_code
                              || `#${transfer.customer_id}`}
                          </strong>
                          <div className="muted" style={{ fontSize: '0.75rem' }}>{transfer.customer_code}</div>
                          <StatusBadge status={transfer.customer_status || 'Active'} />
                        </td>
                        <td>{transfer.customer_id}</td>
                        <td>
                          {transfer.source_branch_name || transfer.source_branch_id}
                          {' → '}
                          {transfer.target_branch_name || transfer.target_branch_id}
                          <div className="muted" style={{ fontSize: '0.75rem' }}>
                            Requested by {transfer.requester_name || '—'}
                          </div>
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <div style={{ fontSize: '0.85rem' }}>{locationLabel}</div>
                          <div className="muted" style={{ fontSize: '0.75rem' }}>{transfer.reason || '—'}</div>
                          {transfer.revision_note ? (
                            <p className="form-error" style={{ fontSize: '0.75rem', margin: '4px 0 0' }}>
                              Return note: {transfer.revision_note}
                            </p>
                          ) : null}
                        </td>
                        <td style={{ minWidth: 200 }}>
                          {needsReceiving && isReceivingBm ? (
                            <select
                              className="filter-select"
                              value={draft.target_territory_id || transfer.target_territory_id || transfer.proposed_territory_id || ''}
                              onFocus={() => loadTerritoriesForTransfer(transfer.transfer_id)}
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
                          ) : (
                            <div>
                              {transfer.target_territory_name
                                || transfer.proposed_territory_name
                                || transfer.target_territory_id
                                || transfer.proposed_territory_id
                                || '—'}
                            </div>
                          )}
                        </td>
                        <td><StatusBadge status={transfer.status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            label={`Actions for branch transfer ${transfer.transfer_id}`}
                            items={[
                              {
                                key: 'view',
                                label: 'View',
                                onSelect: () => setQueueSummary({
                                  title: `Branch transfer CBT-${transfer.transfer_id}`,
                                  rows: [
                                    { label: 'Customer', value: [transfer.first_name, transfer.last_name].filter(Boolean).join(' ') || transfer.customer_code || transfer.customer_id },
                                    { label: 'Customer ID', value: transfer.customer_id },
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
                                key: 'confirm-territory',
                                label: 'Confirm Territory',
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
                                onSelect: async () => {
                                  setProfileDrawer({ open: true, loading: true, profile: null });
                                  const res = await fetchCustomerById(transfer.customer_id);
                                  if (!res.success || !res.data) {
                                    setProfileDrawer({ open: false, loading: false, profile: null });
                                    showToast?.(res.message || 'Could not load customer profile.', 'error');
                                    return;
                                  }
                                  setProfileDrawer({
                                    open: true,
                                    loading: false,
                                    profile: {
                                      ...res.data,
                                      contact_phone_masked: res.data.contact_phone_masked || res.data.contact_phone,
                                    },
                                  });
                                },
                              },
                              needsSource && isSourceBm && {
                                key: 'release',
                                label: 'Release Ownership',
                                disabled: Boolean(busyKey),
                                onSelect: () => submitSourceTransfer(transfer),
                              },
                              needsSource && isSourceBm && {
                                key: 'source-return',
                                label: 'Return to SA',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideSourceTransfer(transfer, 'return'),
                              },
                              needsSource && isSourceBm && {
                                key: 'source-reject',
                                label: 'Reject',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideSourceTransfer(transfer, 'reject'),
                              },
                              isOm && transfer.status === 'Pending OM' && {
                                key: 'approve',
                                label: 'Approve',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideOmTransfer(transfer, 'approve'),
                              },
                              isOm && transfer.status === 'Pending OM' && {
                                key: 'revision',
                                label: 'Return to SA',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideOmTransfer(transfer, 'needs_revision'),
                              },
                              isOm && transfer.status === 'Pending OM' && {
                                key: 'reject',
                                label: 'Reject',
                                disabled: Boolean(busyKey),
                                onSelect: () => decideOmTransfer(transfer, 'reject'),
                              },
                            ]}
                          />
                          {!isOm && !isSourceBm && !isReceivingBm ? (
                            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Waiting on Receiving BM / Source BM / OM</div>
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
        onClose={() => setProfileDrawer({ open: false, loading: false, profile: null })}
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
    </div>
  );
}
