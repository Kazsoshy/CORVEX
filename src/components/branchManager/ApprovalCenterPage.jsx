import { useEffect, useMemo, useState } from 'react';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { Stats } from '../shared/StatsGrid';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../data/branchManagerMockData';
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
} from '../../api/approvalsService.js';
import {
  fetchInventoryTransfers,
  fetchInventoryTransferById,
  patchInventoryTransfer,
  mapInventoryTransferRow,
} from '../../api/inventoryService.js';
import { formatMoneyOrNA } from '../../utils/creditReview';

function tabFromSearch() {
  try {
    const raw = new URLSearchParams(window.location.search).get('tab') || '';
    const allowed = new Set(['collections', 'invoices', 'transfers', 'restocks', 'stock-counts', 'ci']);
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
  const [transferList, setTransferList] = useState([]);
  const [restockList, setRestockList] = useState([]);
  const [stockCountList, setStockCountList] = useState([]);
  const [invoiceList, setInvoiceList] = useState([]);
  const [collectionList, setCollectionList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);

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
    const [ciRes, trRes, restockRes, countRes, invRes, pendingPayRes, summaryRes] = await Promise.all([
      fetchCreditInvestigations({ status: 'Needs BM', limit: 100 }),
      fetchInventoryTransfers({ status: 'pending', limit: 100 }),
      fetchPendingRestocks(),
      fetchPendingStockCounts(),
      fetchPendingSalesInvoices(),
      fetchCollectionsForReview('Pending'),
      fetchApprovalCenterSummary(),
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
    if (summaryRes.success) setSummary(summaryRes.data || null);
    else setSummary(null);

    const preferred = tabFromSearch();
    const counts = {
      collections: nextCollections.length,
      invoices: nextInvoices.length,
      transfers: nextTransfers.length,
      restocks: nextRestocks.length,
      'stock-counts': nextCounts.length,
      ci: nextCi.length,
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
  }), [collectionList, invoiceList, transferList, restockList, stockCountList, ciList]);

  const needsAction = useMemo(() => {
    if (summary && Number.isFinite(Number(summary.needs_action))) {
      return Number(summary.needs_action);
    }
    return counts.collections
      + counts.invoices
      + counts.transfers
      + counts.restocks
      + counts['stock-counts']
      + counts.ci;
  }, [summary, counts]);

  const tabs = [
    { key: 'collections', label: `Collections (${counts.collections})` },
    { key: 'invoices', label: `Sales Invoices (${counts.invoices})` },
    { key: 'transfers', label: `Inventory Transfers (${counts.transfers})` },
    { key: 'restocks', label: `Restocks (${counts.restocks})` },
    { key: 'stock-counts', label: `Stock Counts (${counts['stock-counts']})` },
    { key: 'ci', label: `Credit Reviews (${counts.ci})` },
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

  if (
    loading
    && !collectionList.length
    && !invoiceList.length
    && !transferList.length
    && !restockList.length
    && !stockCountList.length
    && !ciList.length
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

      <Stats stats={[
        { label: 'Needs Your Action', value: String(needsAction) },
      ]}
      />

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
                        <td className="table-actions">
                          <button
                            className="button"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => confirmCollection(payment.collectionpayment_id)}
                          >
                            Confirm
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => rejectCollection(payment.collectionpayment_id)}
                          >
                            Reject
                          </button>
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
                        <td className="table-actions">
                          <button
                            className="button"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => confirmInvoice(inv.sales_invoices_id)}
                          >
                            Acknowledge
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => rejectInvoice(inv.sales_invoices_id)}
                          >
                            Reject
                          </button>
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
                        <td className="table-actions">
                          <button
                            className="button ghost"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => openTransferDetail(t.id)}
                          >
                            View Details
                          </button>
                          <button
                            className="button"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => approveTransfer(t.id)}
                          >
                            Approve
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => rejectTransfer(t.id)}
                          >
                            Reject
                          </button>
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
                        <td className="table-actions">
                          <button className="button ghost" type="button" disabled={Boolean(busyKey)} onClick={() => openRestockDetail(row.restock_id)}>
                            View Details
                          </button>
                          <button className="button" type="button" disabled={Boolean(busyKey)} onClick={() => approveRestock(row.restock_id)}>
                            Approve
                          </button>
                          <button className="button secondary" type="button" disabled={Boolean(busyKey)} onClick={() => rejectRestock(row.restock_id)}>
                            Reject
                          </button>
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
                        <td className="table-actions">
                          <button className="button ghost" type="button" disabled={Boolean(busyKey)} onClick={() => openStockCountDetail(row.count_id)}>
                            View Details
                          </button>
                          <button className="button" type="button" disabled={Boolean(busyKey)} onClick={() => approveStockCount(row.count_id)}>
                            Approve
                          </button>
                          <button className="button secondary" type="button" disabled={Boolean(busyKey)} onClick={() => rejectStockCount(row.count_id)}>
                            Reject
                          </button>
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
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3>Credit Reviews</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Preview only. Open the full credit decision desk to approve, reject, or request revision.
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
                      <th>Suggested / Requested</th>
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
                        onClick={() => navigate(`${opsBase}/ci-approvals/${ci.ciId || ci.id}`)}
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
                          {formatMoneyOrNA(ci.requestedLimit)}
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
                          <button
                            className="button"
                            type="button"
                            onClick={() => navigate(`${opsBase}/ci-approvals/${ci.ciId || ci.id}`)}
                          >
                            Open Decision
                          </button>
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
        </section>
      ) : null}

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
