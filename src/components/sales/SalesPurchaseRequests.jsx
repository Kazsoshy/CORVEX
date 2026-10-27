import { useEffect, useMemo, useRef, useState } from 'react';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import {
  fetchSalesPurchaseRequestById,
  fetchSalesPurchaseRequests,
  updateSalesPurchaseRequestItems,
  updateSalesPurchaseRequestStatus,
} from '../../api/salesService';
import { formatCurrency, formatDisplayDateTime } from '../../utils/formatters.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';

const STATUSES = ['All', 'Pending', 'In Review', 'Confirmed', 'Rejected', 'Cancelled', 'Invoiced'];
const EDITABLE = new Set(['Pending', 'In Review', 'Confirmed']);
const CLOSED = new Set(['Rejected', 'Cancelled', 'Invoiced']);

function ProductPhoto({ src, name }) {
  const [failed, setFailed] = useState(false);
  const mark = String(name || '?').trim().slice(0, 2).toUpperCase();
  if (!src || failed) return <span className="pos-photo pos-photo-row" aria-hidden="true">{mark}</span>;
  return <img className="pos-photo pos-photo-row" src={src} alt="" onError={() => setFailed(true)} />;
}

function waitingLabel(createdAt, status) {
  if (CLOSED.has(status)) return 'Closed';
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.max(0, Math.floor(ms / 3600000));
  if (hours < 1) return 'Under 1 hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function linesMatch(saved, draft) {
  if (!saved || saved.length !== draft.length) return false;
  return saved.every((item, index) => (
    item.product_id === draft[index].product_id && Number(item.quantity) === Number(draft[index].quantity)
  ));
}

function estimateOf(lines) {
  return lines.reduce((sum, line) => sum + (Number(line.unit_price) || 0) * (Number(line.quantity) || 0), 0);
}

export function SalesPurchaseRequestsPage({ navigate, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchSalesPurchaseRequests();
      if (!active) return;
      if (res.success) setRequests(res.data || []);
      else showToast?.(res.message || 'Could not load purchase requests.', 'error');
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [showToast]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (status !== 'All' && request.status !== status) return false;
      if (!needle) return true;
      const haystack = [
        request.request_id,
        request.customer_name,
        request.customer_code,
        ...(request.items || []).flatMap((item) => [item.product_name, item.sku]),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [requests, query, status]);

  const pagination = usePagination(filtered, { resetKey: `${query}|${status}` });
  const rows = pagination.paginatedData;
  if (loading) return <LoadingState message="Loading purchase requests…" />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Customer purchase requests</h3>
          <p className="muted">Open a request to check stock, credit, and the customer note before you confirm, reject, or cancel.</p>
        </div>
        <div className="pr-toolbar">
          <label className="pos-search">
            <span className="sr-only">Search requests</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer, product, or request"
            />
          </label>
          <div className="pos-chips" role="group" aria-label="Request status">
            {STATUSES.map((name) => (
              <button
                key={name}
                type="button"
                className={status === name ? 'pos-chip active' : 'pos-chip'}
                aria-pressed={status === name}
                onClick={() => setStatus(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        {!filtered.length ? (
          <EmptyState title="No purchase requests" description="Requests from customer portal accounts will appear here." />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Estimated</th>
                    <th>Waiting</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((request) => (
                    <tr key={request.request_id}>
                      <td>#{request.request_id}</td>
                      <td>
                        <strong>{request.customer_name}</strong>
                        <div className="muted">{request.customer_code || `Customer ${request.customer_id}`}</div>
                      </td>
                      <td><StatusBadge status={request.status} /></td>
                      <td>
                        <ul className="pr-mini">
                          {(request.items || []).slice(0, 3).map((item) => (
                            <li key={item.item_id}>
                              <ProductPhoto src={item.image_url} name={item.product_name} />
                              <span>{item.product_name} × {item.quantity}</span>
                            </li>
                          ))}
                        </ul>
                        {(request.items || []).length > 3 ? <small className="muted">+{request.items.length - 3} more</small> : null}
                      </td>
                      <td>{formatCurrency(Number(request.estimated_total) || 0)}</td>
                      <td>{waitingLabel(request.created_at, request.status)}</td>
                      <td className="table-actions">
                        <button className="button" type="button" onClick={() => navigate(`/sales/purchase-requests/${request.request_id}`)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        )}
      </section>
    </div>
  );
}

export function SalesPurchaseReviewPage({ requestId, navigate, showToast }) {
  const [data, setData] = useState(null);
  const [lines, setLines] = useState([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [missing, setMissing] = useState(false);
  const startedReview = useRef(new Set());

  const load = async () => {
    const result = await fetchSalesPurchaseRequestById(requestId);
    if (!result.success || !result.data) {
      setMissing(true);
      setData(null);
      return result;
    }
    setMissing(false);
    setData(result.data);
    setLines((result.data.items || []).map((item) => ({ ...item, key: item.item_id })));
    setReply(result.data.agent_reply || '');
    return result;
  };

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      const result = await fetchSalesPurchaseRequestById(requestId);
      if (!active) return;
      if (!result.success || !result.data) setMissing(true);
      else {
        setData(result.data);
        setLines((result.data.items || []).map((item) => ({ ...item, key: item.item_id })));
        setReply(result.data.agent_reply || '');
      }
      setLoading(false);
    }
    run();
    return () => { active = false; };
  }, [requestId]);

  useEffect(() => {
    if (!data || data.status !== 'Pending') return;
    const id = data.request_id;
    if (startedReview.current.has(id)) return;
    startedReview.current.add(id);
    async function start() {
      const result = await updateSalesPurchaseRequestStatus(id, 'In Review');
      if (!result.success) {
        startedReview.current.delete(id);
        showToast?.(result.message || 'Could not start the review.', 'error');
        return;
      }
      const fresh = await fetchSalesPurchaseRequestById(id);
      if (!fresh.success || !fresh.data) return;
      setData(fresh.data);
      setLines((fresh.data.items || []).map((item) => ({ ...item, key: item.item_id })));
      setReply(fresh.data.agent_reply || '');
    }
    start();
  }, [data, showToast]);

  const dirty = data ? !linesMatch(data.items || [], lines) : false;
  const editable = data ? EDITABLE.has(data.status) : false;
  const estimated = estimateOf(lines);
  const balance = Number(data?.outstanding_balance) || 0;
  const limit = Number(data?.credit_limit) || 0;
  const projected = balance + estimated;
  const short = lines.filter((line) => line.quantity > Number(line.available_stock));
  const overCredit = limit > 0 && projected > limit;
  const room = limit > 0 ? limit - projected : null;

  const saveLines = async () => {
    setSaving(true);
    const result = await updateSalesPurchaseRequestItems(requestId, lines.map((line) => ({
      product_id: line.product_id,
      quantity: Number(line.quantity),
    })));
    setSaving(false);
    if (!result.success) {
      showToast?.(result.message || 'Could not save the lines.', 'error');
      return false;
    }
    setData(result.data);
    setLines((result.data.items || []).map((item) => ({ ...item, key: item.item_id })));
    showToast?.(result.message || 'Lines saved.', 'success');
    return true;
  };

  const decide = async (status, extra = {}) => {
    if ((status === 'Rejected' || status === 'Cancelled') && !reply.trim()) {
      showToast?.('Write the reason the customer should see.', 'error');
      return;
    }
    if (dirty) {
      showToast?.('Save the quantity change first. Log Sale uses the saved quantities.', 'error');
      return;
    }
    setDeciding(true);
    const result = await updateSalesPurchaseRequestStatus(requestId, status, { reply: reply.trim(), ...extra });
    setDeciding(false);
    if (!result.success) {
      showToast?.(result.message || 'Update failed.', 'error');
      return;
    }
    showToast?.(result.message || 'Updated.', 'success');
    if (status === 'Confirmed' && data?.customer_id) {
      navigate(`/sales/log-sale/${data.customer_id}?purchaseRequestId=${requestId}`);
      return;
    }
    await load();
  };

  if (loading) return <LoadingState message="Loading purchase request…" />;
  if (missing || !data) {
    return (
      <div className="page">
        <EmptyState title="Request not found" description="This purchase request is not assigned to you." />
        <button className="button ghost" type="button" onClick={() => navigate('/sales/purchase-requests')}>Back to requests</button>
      </div>
    );
  }

  const canDecide = data.status === 'Pending' || data.status === 'In Review';
  const confirmReason = dirty
    ? 'Save the quantity change first.'
    : short.length
      ? 'Lower a quantity before confirming, or reject the request.'
      : overCredit
        ? 'This request would put the customer over the credit limit.'
        : '';

  return (
    <div className="page pr-review">
      <div className="pr-review-head">
        <div>
          <button className="button ghost" type="button" onClick={() => navigate('/sales/purchase-requests')}>All requests</button>
          <h3>Request #{data.request_id}</h3>
          <p className="muted">Submitted {formatDisplayDateTime(data.created_at)} · Waiting {waitingLabel(data.created_at, data.status)}</p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <div className="pr-review-grid">
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Lines</h3>
            <p className="muted">The customer chose these products. Adjust a quantity only when stock or credit requires it.</p>
          </div>
          <ul className="pr-lines">
            {lines.map((line, index) => {
              const shortLine = line.quantity > Number(line.available_stock);
              return (
                <li key={line.key || `${line.product_id}-${index}`} className={shortLine ? 'is-short' : ''}>
                  <ProductPhoto src={line.image_url} name={line.product_name} />
                  <div className="pr-line-main">
                    <strong>{line.product_name}</strong>
                    <small>{line.sku || 'No SKU'} · {formatCurrency(Number(line.unit_price) || 0)}</small>
                    <span className={shortLine ? 'pr-stock short' : 'pr-stock'}>
                      Asked {line.quantity} · {Number(line.available_stock)} in branch
                    </span>
                  </div>
                  <div className="pr-line-qty">
                    {editable ? (
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        aria-label={`Quantity for ${line.product_name}`}
                        onChange={(event) => {
                          const quantity = Math.max(1, Number(event.target.value) || 1);
                          setLines((current) => current.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, quantity } : item
                          )));
                        }}
                      />
                    ) : <strong>× {line.quantity}</strong>}
                    <b>{formatCurrency((Number(line.unit_price) || 0) * Number(line.quantity))}</b>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="pr-total">
            <span>Estimated total</span>
            <strong>{formatCurrency(estimated)}</strong>
          </div>
          {editable && dirty ? (
            <button className="button" type="button" onClick={saveLines} disabled={saving}>
              {saving ? 'Saving…' : 'Save quantities'}
            </button>
          ) : null}
        </section>

        <aside className="pr-side">
          <section className="panel content-panel">
            <div className="panel-section-header"><h3>{data.customer_name}</h3></div>
            <dl className="pr-facts">
              <div><dt>Account</dt><dd>{data.customer_code || data.customer_id}</dd></div>
              <div><dt>Phone</dt><dd>{data.contact_phone || '—'}</dd></div>
              <div><dt>Outstanding</dt><dd>{formatCurrency(balance)}</dd></div>
              <div><dt>Credit limit</dt><dd>{limit > 0 ? formatCurrency(limit) : 'None on file'}</dd></div>
              <div><dt>After this request</dt><dd>{formatCurrency(projected)}</dd></div>
              {room != null ? <div><dt>Room left</dt><dd className={room < 0 ? 'pr-stock short' : ''}>{formatCurrency(room)}</dd></div> : null}
            </dl>
            <button className="button ghost" type="button" onClick={() => navigate(`/sales/customer-detail/${data.customer_id}`)}>
              Open customer
            </button>
          </section>

          <section className="panel content-panel">
            <div className="panel-section-header"><h3>Checks</h3></div>
            {short.length ? (
              <p className="pr-warn">Branch stock cannot fill {short.map((line) => line.product_name).join(', ')}.</p>
            ) : <p className="pr-ok">Every line fits the stock at this branch.</p>}
            {limit <= 0 ? (
              <p className="pr-warn">No credit limit is on file. Outstanding balance is {formatCurrency(balance)}.</p>
            ) : overCredit ? (
              <p className="pr-warn">Confirm stays blocked. The projected balance is above the credit limit.</p>
            ) : (
              <p className="pr-ok">{formatCurrency(room)} of credit remains if this request is invoiced.</p>
            )}
            {data.notes ? <p className="pr-note"><strong>Customer note.</strong> {data.notes}</p> : <p className="muted">The customer did not leave a note.</p>}
            {data.reviewed_by_name ? (
              <p className="muted">Last action by {data.reviewed_by_name} on {formatDisplayDateTime(data.reviewed_at)}.</p>
            ) : null}
          </section>

          <section className="panel content-panel">
            <label className="pr-reply">
              Reply the customer will see
              <textarea
                rows={4}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Required when you reject or cancel"
                disabled={data.status === 'Invoiced'}
              />
            </label>
            {confirmReason && canDecide ? <p className="pr-warn">{confirmReason}</p> : null}
            <div className="pr-actions">
              {canDecide ? (
                <button className="button" type="button" disabled={deciding || Boolean(confirmReason)} onClick={() => decide('Confirmed')}>
                  Confirm and log sale
                </button>
              ) : null}
              {data.status === 'Confirmed' ? (
                <button className="button" type="button" onClick={() => navigate(`/sales/log-sale/${data.customer_id}?purchaseRequestId=${data.request_id}`)}>
                  Log sale
                </button>
              ) : null}
              {data.status === 'Invoiced' && data.sales_invoices_id ? (
                <button className="button" type="button" onClick={() => navigate(`/sales/invoices/${data.sales_invoices_id}`)}>
                  View invoice
                </button>
              ) : null}
              {canDecide ? (
                <button className="button ghost" type="button" disabled={deciding} onClick={() => decide('Rejected')}>Reject</button>
              ) : null}
              {data.status !== 'Invoiced' && data.status !== 'Rejected' && data.status !== 'Cancelled' ? (
                <button className="button ghost" type="button" disabled={deciding} onClick={() => decide('Cancelled')}>Cancel request</button>
              ) : null}
              {data.status === 'Rejected' || data.status === 'Cancelled' ? (
                <button className="button" type="button" disabled={deciding} onClick={() => decide('In Review', { reopen: true })}>
                  Reopen
                </button>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
