import { insertUserNotification } from './creditInvestigationNotifications.js';

export async function writeCustomerAudit(pool, {
  userId,
  userName,
  action,
  statusDetails,
  ipAddress = '127.0.0.1',
}) {
  const detail = String(statusDetails || action || 'Customer updated').slice(0, 150);
  await pool.query(
    `INSERT INTO audit_logs (user_id, user_name, action, ip_address, status_details, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [userId, userName || 'System', String(action || 'Customer profile updated').slice(0, 150), ipAddress, detail]
  );
}

export async function notifyLinkedCustomer(pool, customerId, { title, message, category = 'Account' }) {
  if (!customerId || !title || !message) return;
  const found = await pool.query(
    `SELECT user_id FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  const userId = found.rows[0]?.user_id;
  if (!userId) return;
  await insertUserNotification(pool, {
    userId,
    title: String(title).slice(0, 150),
    message: String(message).slice(0, 500),
    category,
  });
}

function peso(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function notifyCustomerPaymentEvent(pool, {
  customerId,
  receiptNumber,
  amount,
  kind,
  reason = '',
}) {
  const receipt = receiptNumber || 'your payment';
  const sum = peso(amount);
  const note = reason ? ` Reason: ${reason}` : '';
  const copy = {
    submitted: {
      title: 'Collection recorded',
      message: `A collection of ${sum} (${receipt}) was recorded and is waiting for confirmation. Your balance changes after the branch confirms it.`,
      category: 'Collection',
    },
    confirmed: {
      title: 'Payment confirmed',
      message: `Your payment of ${sum} (${receipt}) was confirmed.`,
      category: 'Payment',
    },
    rejected: {
      title: 'Collection not accepted',
      message: `The collection ${receipt} for ${sum} was not accepted.${note}`,
      category: 'Collection',
    },
    reversed: {
      title: 'Payment reversed',
      message: `The confirmed payment ${receipt} for ${sum} was reversed and returned to your balance.${note}`,
      category: 'Collection',
    },
  };
  const event = copy[kind];
  if (!event) return;
  await notifyLinkedCustomer(pool, customerId, event);
}

export async function notifyCustomerInvoiceConfirmed(pool, { customerId, invoiceNumber, amount, dueDate }) {
  const due = dueDate ? ` Due ${String(dueDate).slice(0, 10)}.` : '';
  await notifyLinkedCustomer(pool, customerId, {
    title: `Invoice ${invoiceNumber}`,
    message: `Invoice ${invoiceNumber} for ${peso(amount)} was added to your account.${due}`,
    category: 'Invoice',
  });
}

export async function notifyCustomerAccountStatus(pool, { customerId, status }) {
  if (!status) return;
  await notifyLinkedCustomer(pool, customerId, {
    title: 'Account status updated',
    message: `Your account status is now ${status}.`,
    category: 'Account',
  });
}

/** Notify BM/OM that a sales agent updated customer profile fields. */
export async function notifyCustomerProfileUpdated(pool, {
  branchId,
  customerId,
  customerCode,
  customerName,
  actorName,
  changedFields = [],
}) {
  if (!branchId) return;
  const approvers = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('branch_manager', 'operating_manager')
       AND (r.slug = 'operating_manager' OR u.branch_id = $1)`,
    [branchId]
  );

  const code = customerCode || `#${customerId}`;
  const fieldList = changedFields.length ? changedFields.join(', ') : 'profile fields';
  const title = 'Customer profile updated';
  const message = `${actorName || 'A sales agent'} updated ${customerName || 'a customer'} (${code}): ${fieldList}. Review the customer profile when convenient.`;

  await Promise.all(
    approvers.rows.map((row) =>
      insertUserNotification(pool, {
        userId: row.id,
        title,
        message,
        category: 'Customer',
      })
    )
  );
}
