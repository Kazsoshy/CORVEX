/**
 * Each customer has at most one assigned sales agent (creator or latest completed Sales visit).
 * Purchase requests are visible only to that agent (and stored on pr.sales_agent_id).
 */

import { insertUserNotification } from './creditInvestigationNotifications.js';

export async function resolveSalesAgentIdForCustomer(pool, customerId) {
  const result = await pool.query(
    `SELECT assigned_sales_agent_id FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  const id = result.rows[0]?.assigned_sales_agent_id;
  return id != null ? Number(id) : null;
}

export async function assignSalesAgentToCustomer(client, customerId, salesAgentUserId) {
  if (!customerId || !salesAgentUserId) return;
  await client.query(
    `UPDATE customers
     SET assigned_sales_agent_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE customer_id = $2`,
    [salesAgentUserId, customerId]
  );
}

export function purchaseRequestListFilter(user) {
  const params = [user.id];
  let whereSql = '(pr.sales_agent_id = $1 OR c.assigned_sales_agent_id = $1)';
  if (user.branchId != null && user.roleSlug === 'sales_staff') {
    whereSql += ' AND pr.branch_id = $2';
    params.push(user.branchId);
  }
  return { whereSql, params };
}

export function purchaseRequestAccessSql(user, paramOffset = 2) {
  const userIdParam = `$${paramOffset}`;
  return {
    sql: `(pr.sales_agent_id = ${userIdParam} OR c.assigned_sales_agent_id = ${userIdParam})`,
    extraParams: [user.id],
  };
}

export function userCanManagePurchaseRequest(user, row) {
  if (!row || !user) return false;
  const userId = Number(user.id);
  if (!userId) return false;
  return Number(row.sales_agent_id) === userId || Number(row.assigned_sales_agent_id) === userId;
}

const STATUS_FROM = {
  'In Review': ['Pending', 'Rejected', 'Cancelled'],
  Confirmed: ['Pending', 'In Review'],
  Rejected: ['Pending', 'In Review'],
  Cancelled: ['Pending', 'In Review', 'Confirmed'],
};

export function purchaseRequestStatusMove(fromStatus, toStatus) {
  const allowed = STATUS_FROM[toStatus];
  if (!allowed || !allowed.includes(fromStatus)) {
    return `This request cannot move from ${fromStatus} to ${toStatus}.`;
  }
  return null;
}

function mapCatalogLine(row) {
  return {
    ...row,
    product_id: Number(row.product_id),
    unit_price: Number(row.unit_price) || 0,
    available_stock: Number(row.available_stock) || 0,
    ...(row.quantity != null ? { quantity: Number(row.quantity) } : {}),
  };
}

export async function getPurchaseRequestDetail(pool, user, requestId) {
  const access = purchaseRequestAccessSql(user, 2);
  const result = await pool.query(
    `SELECT pr.request_id, pr.status, pr.notes, pr.agent_reply, pr.reviewed_at,
            pr.created_at, pr.updated_at, pr.sales_invoices_id, pr.branch_id, pr.sales_agent_id,
            c.customer_id, c.customer_code, c.contact_phone, c.assigned_sales_agent_id,
            c.first_name || ' ' || c.last_name AS customer_name,
            COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
            COALESCE(cci.credit_limit, 0) AS credit_limit,
            COALESCE(NULLIF(CONCAT_WS(' ', reviewer.first_name, reviewer.last_name), ''), '') AS reviewed_by_name
     FROM purchase_requests pr
     JOIN customers c ON c.customer_id = pr.customer_id
     LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
     LEFT JOIN customer_credit_info cci ON cci.customer_id = c.customer_id
     LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
     WHERE pr.request_id = $1
       AND ${access.sql}`,
    [requestId, ...access.extraParams]
  );
  if (!result.rows.length) return null;
  const request = result.rows[0];
  const items = await pool.query(
    `SELECT pri.item_id, pri.product_id, pri.quantity, pri.notes,
            p.name AS product_name, p.sku, p.unit_price, p.image_url,
            COALESCE(bi.available_stock, 0) AS available_stock
     FROM purchase_request_items pri
     JOIN products p ON p.id = pri.product_id
     LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = $2
     WHERE pri.request_id = $1
     ORDER BY pri.item_id`,
    [requestId, request.branch_id]
  );
  const catalog = await pool.query(
    `SELECT p.id AS product_id, p.name AS product_name, p.sku, p.unit_price, p.image_url,
            COALESCE(bi.available_stock, 0) AS available_stock
     FROM products p
     LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = $1
     WHERE p.status = 'Active'
     ORDER BY p.name`,
    [request.branch_id]
  );
  return {
    ...request,
    outstanding_balance: Number(request.outstanding_balance) || 0,
    credit_limit: Number(request.credit_limit) || 0,
    items: items.rows.map(mapCatalogLine),
    catalog: catalog.rows.map(mapCatalogLine),
  };
}

function peso(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function confirmBlockReason(pool, requestId, branchId) {
  const items = await pool.query(
    `SELECT pri.quantity, p.name AS product_name, p.unit_price,
            COALESCE(bi.available_stock, 0) AS available_stock
     FROM purchase_request_items pri
     JOIN products p ON p.id = pri.product_id
     LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = $2
     WHERE pri.request_id = $1`,
    [requestId, branchId]
  );
  const short = items.rows.filter((row) => Number(row.quantity) > Number(row.available_stock));
  if (short.length) {
    const detail = short
      .map((row) => `${row.product_name} asks for ${row.quantity} and the branch has ${Number(row.available_stock)}`)
      .join('; ');
    return `Confirm stays blocked until every line fits branch stock. ${detail}.`;
  }
  const money = await pool.query(
    `SELECT COALESCE(ca.outstanding_balance, 0) AS outstanding_balance,
            COALESCE(cci.credit_limit, 0) AS credit_limit
     FROM purchase_requests pr
     LEFT JOIN customer_activity ca ON ca.customer_id = pr.customer_id
     LEFT JOIN customer_credit_info cci ON cci.customer_id = pr.customer_id
     WHERE pr.request_id = $1`,
    [requestId]
  );
  const balance = Number(money.rows[0]?.outstanding_balance) || 0;
  const limit = Number(money.rows[0]?.credit_limit) || 0;
  const total = items.rows.reduce((sum, row) => sum + (Number(row.unit_price) || 0) * Number(row.quantity), 0);
  if (limit > 0 && balance + total > limit) {
    return `Confirm stays blocked. Outstanding ${peso(balance)} plus this request ${peso(total)} is above the ${peso(limit)} credit limit.`;
  }
  return null;
}

export async function notifyPurchaseRequestCustomer(pool, { customerId, requestId, status, reply, reopened }) {
  const found = await pool.query(
    `SELECT user_id FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  const userId = found.rows[0]?.user_id;
  if (!userId) return;
  const note = reply ? ` ${reply}` : '';
  const titles = {
    'In Review': reopened ? 'Purchase request reopened' : 'Purchase request in review',
    Confirmed: 'Purchase request confirmed',
    Rejected: 'Purchase request rejected',
    Cancelled: 'Purchase request cancelled',
  };
  let message = `Request #${requestId} is in review.${note}`;
  if (reopened) message = `Request #${requestId} was reopened and is in review again.${note}`;
  else if (status === 'Rejected') message = `Request #${requestId} was rejected. Reason: ${reply}`;
  else if (status === 'Cancelled') message = `Request #${requestId} was cancelled. Reason: ${reply}`;
  else if (status === 'Confirmed') message = `Request #${requestId} was confirmed. Your sales agent will prepare the invoice.${note}`;
  await insertUserNotification(pool, {
    userId,
    title: titles[status] || 'Purchase request update',
    message: message.trim(),
    category: 'Purchase',
  });
}
