/**
 * Each customer has at most one assigned sales agent (creator or latest completed Sales visit).
 * Purchase requests are visible only to that agent (and stored on pr.sales_agent_id).
 */

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
  if (!row) return false;
  return row.sales_agent_id === user.id || row.assigned_sales_agent_id === user.id;
}
