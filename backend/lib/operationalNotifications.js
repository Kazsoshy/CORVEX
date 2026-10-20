import { insertUserNotification } from './creditInvestigationNotifications.js';
import { manilaDateString } from './sawCollection.js';

function guard(label, work) {
  return async (...args) => {
    try {
      await work(...args);
    } catch (err) {
      console.error(`[Notifications] ${label}:`, err.message);
    }
  };
}

async function claimDedup(pool, key) {
  const result = await pool.query(
    `INSERT INTO notification_dedup (dedup_key)
     VALUES ($1)
     ON CONFLICT DO NOTHING
     RETURNING dedup_key`,
    [key]
  );
  return result.rows.length > 0;
}

function scheduleMessage(visitType, scheduledDate, customerNames) {
  const names = customerNames.slice(0, 8);
  const extra = customerNames.length > names.length
    ? ` and ${customerNames.length - names.length} more`
    : '';
  const kind = visitType === 'Sales' ? 'sales' : 'collection';
  return `You have ${customerNames.length} ${kind} visit${customerNames.length === 1 ? '' : 's'} on ${scheduledDate}: ${names.join(', ')}${extra}.`;
}

export const notifyScheduleAssigned = guard('schedule', async (pool, {
  userId,
  scheduledDate,
  visitType,
  customerNames,
}) => {
  const names = (customerNames || []).map((name) => String(name || '').trim()).filter(Boolean);
  if (!userId || !names.length || !scheduledDate) return;

  const kind = visitType === 'Sales' ? 'Sales' : 'Collection';
  const label = kind === 'Sales' ? 'sales' : 'collection';
  await insertUserNotification(pool, {
    userId,
    title: `${kind} schedule assigned`,
    message: `${names.length} ${label} visit${names.length === 1 ? '' : 's'} added to your schedule for ${scheduledDate}: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` and ${names.length - 8} more` : ''}.`,
    category: 'Schedule',
  });
});

export const notifyTodaysSchedules = guard('schedule sweep', async (pool) => {
  const today = manilaDateString();
  const result = await pool.query(
    `SELECT
       fv.user_id,
       fv.visit_type,
       fv.scheduled_date::text AS scheduled_date,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name
     FROM field_visits fv
     JOIN customers c ON c.customer_id = fv.customer_id
     JOIN users u ON u.id = fv.user_id
     JOIN roles r ON r.role_id = u.role_id
     WHERE fv.status = 'Pending'
       AND fv.scheduled_date = $1::date
       AND u.status = 'Active'
       AND (
         (r.slug = 'collector' AND fv.visit_type = 'Collection')
         OR (r.slug = 'sales_staff' AND fv.visit_type = 'Sales')
       )
     ORDER BY fv.user_id, fv.visit_id`,
    [today]
  );

  const groups = new Map();
  for (const row of result.rows) {
    const key = `${row.user_id}:${row.scheduled_date}:${row.visit_type}`;
    if (!groups.has(key)) {
      groups.set(key, {
        userId: row.user_id,
        scheduledDate: row.scheduled_date,
        visitType: row.visit_type,
        customerNames: [],
      });
    }
    groups.get(key).customerNames.push(row.customer_name);
  }

  for (const group of groups.values()) {
    const dedupKey = `schedule-digest:${group.userId}:${group.scheduledDate}:${group.visitType}`;
    const fresh = await claimDedup(pool, dedupKey);
    if (!fresh) continue;
    const kind = group.visitType === 'Sales' ? 'Sales' : 'Collection';
    await insertUserNotification(pool, {
      userId: group.userId,
      title: `${kind} schedule assigned`,
      message: scheduleMessage(kind, group.scheduledDate, group.customerNames),
      category: 'Schedule',
    });
  }
});

export const notifyStockThreshold = guard('stock threshold', async (pool, {
  branchId,
  productId,
  productName,
  previousAvailable,
  available,
  reorderLevel,
}) => {
  const prevRaw = Number(previousAvailable);
  const prev = Number.isFinite(prevRaw) ? prevRaw : Number.POSITIVE_INFINITY;
  const next = Number(available);
  const reorder = Number(reorderLevel) || 0;
  if (!Number.isFinite(next) || branchId == null) return;

  const crossedOut = prev > 0 && next <= 0;
  const crossedReorder = reorder > 0 && prev > reorder && next <= reorder && next > 0;
  if (!crossedOut && !crossedReorder) return;

  const staff = await pool.query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug = 'inventory_staff'
       AND u.branch_id = $1`,
    [branchId]
  );
  if (!staff.rows.length) return;

  let name = productName;
  if (!name && productId) {
    const product = await pool.query(`SELECT name FROM products WHERE id = $1`, [productId]);
    name = product.rows[0]?.name || 'A product';
  }
  name = name || 'A product';

  const title = crossedOut ? 'Inventory out of stock' : 'Inventory reached reorder level';
  const message = crossedOut
    ? `${name} is out of stock (0 units). Reorder level is ${reorder}.`
    : `${name} is at ${next} units, at or below the reorder level of ${reorder}.`;

  await Promise.all(staff.rows.map((row) => insertUserNotification(pool, {
    userId: row.id,
    title,
    message,
    category: 'Stock',
  })));
});

export async function publishStockAlerts(pool, snapshots) {
  for (const snapshot of snapshots || []) {
    await notifyStockThreshold(pool, snapshot);
  }
}

/** Daily digest of SKUs already at/below reorder for warehouse staff (FR-36). */
export const notifyLowStockDigest = guard('stock digest', async (pool) => {
  const today = manilaDateString();
  const rows = await pool.query(
    `SELECT
       bi.branch_id,
       bi.product_id,
       p.name AS product_name,
       bi.available_stock,
       bi.reorder_level,
       b.name AS branch_name
     FROM branch_inventory bi
     JOIN products p ON p.id = bi.product_id
     JOIN branches b ON b.id = bi.branch_id
     WHERE COALESCE(p.status, 'Active') = 'Active'
       AND COALESCE(b.status, 'Active') = 'Active'
       AND (
         bi.available_stock <= 0
         OR (bi.reorder_level > 0 AND bi.available_stock <= bi.reorder_level)
       )
     ORDER BY bi.branch_id, bi.available_stock ASC, p.name`
  );
  if (!rows.rows.length) return;

  const byBranch = new Map();
  for (const row of rows.rows) {
    const branchId = Number(row.branch_id);
    if (!byBranch.has(branchId)) byBranch.set(branchId, []);
    byBranch.get(branchId).push(row);
  }

  for (const [branchId, items] of byBranch.entries()) {
    const staff = await pool.query(
      `SELECT u.id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.status = 'Active'
         AND r.slug = 'inventory_staff'
         AND u.branch_id = $1`,
      [branchId]
    );
    if (!staff.rows.length) continue;

    const fresh = await claimDedup(pool, `stock-digest:${today}:${branchId}`);
    if (!fresh) continue;

    const out = items.filter((item) => Number(item.available_stock) <= 0).length;
    const low = items.length - out;
    const sample = items.slice(0, 6).map((item) => {
      const qty = Number(item.available_stock) || 0;
      return `${item.product_name} (${qty})`;
    });
    const extra = items.length > sample.length ? ` and ${items.length - sample.length} more` : '';
    const title = out > 0 ? 'Daily inventory threshold alert' : 'Daily low-stock digest';
    const message = `${items[0].branch_name}: ${out} out of stock, ${low} at/below reorder. ${sample.join(', ')}${extra}.`;

    await Promise.all(staff.rows.map((row) => insertUserNotification(pool, {
      userId: row.id,
      title,
      message,
      category: 'Stock',
    })));
  }
});

export const notifyOverdueAccounts = guard('overdue', async (pool) => {
  const today = manilaDateString();
  const overdue = await pool.query(
    `SELECT
       c.customer_id,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Customer') AS customer_name,
       b.name AS branch_name,
       ca.outstanding_balance,
       MIN(si.due_date)::text AS due_date
     FROM customers c
     JOIN customer_activity ca ON ca.customer_id = c.customer_id
     JOIN sales_invoices si ON si.customer_id = c.customer_id
     LEFT JOIN branches b ON b.id = c.branch_id
     WHERE c.status = 'Active'
       AND ca.outstanding_balance > 0
       AND si.status IN ('Confirmed', 'Pending Review')
       AND si.due_date IS NOT NULL
       AND si.due_date < $1::date
     GROUP BY c.customer_id, c.first_name, c.last_name, b.name, ca.outstanding_balance
     ORDER BY ca.outstanding_balance DESC, MIN(si.due_date) ASC`,
    [today]
  );
  if (!overdue.rows.length) return;

  const managers = await pool.query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('operating_manager', 'super_admin')`
  );
  if (!managers.rows.length) return;

  for (const row of overdue.rows) {
    const fresh = await claimDedup(pool, `overdue:${row.customer_id}:${row.due_date}`);
    if (!fresh) continue;
    const balance = Number(row.outstanding_balance || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const title = 'Overdue customer account';
    const message = `${row.customer_name} at ${row.branch_name || 'a branch'} is overdue since ${row.due_date}. Outstanding balance is ₱${balance}.`;
    await Promise.all(managers.rows.map((manager) => insertUserNotification(pool, {
      userId: manager.id,
      title,
      message,
      category: 'Overdue',
    })));
  }

  // Compact daily summary for OM dashboards (FR-37 / FR-38)
  const digestFresh = await claimDedup(pool, `overdue-digest:${today}`);
  if (digestFresh) {
    const totalBalance = overdue.rows.reduce((sum, row) => sum + (Number(row.outstanding_balance) || 0), 0);
    const top = overdue.rows.slice(0, 5).map((row) => row.customer_name);
    const extra = overdue.rows.length > top.length ? ` and ${overdue.rows.length - top.length} more` : '';
    const totalFormatted = totalBalance.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const message = `${overdue.rows.length} overdue account${overdue.rows.length === 1 ? '' : 's'} totaling ₱${totalFormatted}. Top: ${top.join(', ')}${extra}.`;
    await Promise.all(managers.rows.map((manager) => insertUserNotification(pool, {
      userId: manager.id,
      title: 'Daily overdue accounts summary',
      message,
      category: 'Overdue',
    })));
  }
});

export const clearOverdueDedup = guard('overdue clear', async (pool, customerId) => {
  if (!customerId) return;
  await pool.query(
    `DELETE FROM notification_dedup WHERE dedup_key LIKE $1`,
    [`overdue:${customerId}:%`]
  );
});

export const notifyInvoicePendingReview = guard('invoice review', async (pool, {
  branchId,
  invoiceNumber,
  customerId,
  agentId,
}) => {
  if (branchId == null || !invoiceNumber) return;
  const agent = agentId
    ? await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'A sales agent') AS agent_name
       FROM users WHERE id = $1`,
      [agentId]
    )
    : { rows: [] };
  const agentName = agent.rows[0]?.agent_name || 'A sales agent';
  const customer = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Customer') AS customer_name
     FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  const customerName = customer.rows[0]?.customer_name || 'a customer';
  const managers = await pool.query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug = 'branch_manager'
       AND u.branch_id = $1`,
    [branchId]
  );
  const recipients = managers.rows.length
    ? managers.rows
    : (await pool.query(
      `SELECT u.id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.status = 'Active' AND r.slug = 'operating_manager'`
    )).rows;
  if (!recipients.length) return;
  await Promise.all(recipients.map((row) => insertUserNotification(pool, {
    userId: row.id,
    title: 'Sale waiting for review',
    message: `${agentName} logged invoice ${invoiceNumber} for ${customerName}. Open the Approval Center to confirm or reject it.`,
    category: 'Approval',
  })));
});

export const notifyInvoiceReviewDecision = guard('invoice decision', async (pool, {
  salesAgentId,
  invoiceNumber,
  status,
  reviewNote,
  reopenedRequest,
}) => {
  if (!salesAgentId || !invoiceNumber) return;
  const confirmed = status === 'Confirmed';
  const reason = reviewNote ? ` Reason: ${reviewNote}` : '';
  const reopen = reopenedRequest ? ' The purchase request is ready to log again.' : '';
  await insertUserNotification(pool, {
    userId: salesAgentId,
    title: confirmed ? 'Sale confirmed' : 'Sale rejected',
    message: confirmed
      ? `Your branch manager confirmed invoice ${invoiceNumber}.`
      : `Your branch manager rejected invoice ${invoiceNumber}.${reason} Stock was returned.${reopen}`,
    category: 'Invoice',
  });
});

export function startOperationalNotificationSweep(pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await notifyTodaysSchedules(pool);
      await notifyLowStockDigest(pool);
      await notifyOverdueAccounts(pool);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, 15 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
