import { insertStockMovement, upsertBranchInventoryStock } from './branchInventoryStock.js';
import { manilaDateString } from './sawCollection.js';
import { ApplyError, SyncConflict } from './syncErrors.js';

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isValidDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

export async function chargeCustomerForSale(client, { customerId, amount }) {
  const charge = money(amount);
  if (!customerId || charge <= 0) return null;
  const updated = await client.query(
    `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
     VALUES ($1, $2, $2)
     ON CONFLICT (customer_id) DO UPDATE
       SET outstanding_balance = customer_activity.outstanding_balance + EXCLUDED.outstanding_balance,
           purchase_volume = customer_activity.purchase_volume + EXCLUDED.purchase_volume,
           updated_at = NOW()
     RETURNING outstanding_balance, purchase_volume`,
    [customerId, charge]
  );
  return {
    outstandingBalance: money(updated.rows[0].outstanding_balance),
    purchaseVolume: money(updated.rows[0].purchase_volume),
  };
}

export async function reverseCustomerSaleCharge(client, { customerId, amount }) {
  const charge = money(amount);
  if (!customerId || charge <= 0) return null;
  const locked = await client.query(
    `SELECT outstanding_balance, purchase_volume
     FROM customer_activity
     WHERE customer_id = $1
     FOR UPDATE`,
    [customerId]
  );
  if (!locked.rows.length) return null;
  const outstandingBalance = Math.max(0, money(Number(locked.rows[0].outstanding_balance) - charge));
  const purchaseVolume = Math.max(0, money(Number(locked.rows[0].purchase_volume) - charge));
  await client.query(
    `UPDATE customer_activity
     SET outstanding_balance = $1, purchase_volume = $2, updated_at = NOW()
     WHERE customer_id = $3`,
    [outstandingBalance, purchaseVolume, customerId]
  );
  return { outstandingBalance, purchaseVolume };
}

async function generateInvoiceNumber(client) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const result = await client.query(
    `SELECT invoice_number
     FROM sales_invoices
     WHERE invoice_number LIKE $1
     ORDER BY sales_invoices_id DESC
     LIMIT 1`,
    [`${prefix}%`]
  );
  let nextSeq = 1;
  if (result.rows[0]?.invoice_number) {
    const suffix = result.rows[0].invoice_number.slice(prefix.length);
    const parsed = Number.parseInt(suffix, 10);
    if (Number.isFinite(parsed)) nextSeq = parsed + 1;
  }
  return `${prefix}${String(nextSeq).padStart(6, '0')}`;
}

export async function applySalesInvoice(client, user, body) {
  if (user.roleSlug && user.roleSlug !== 'sales_staff') {
    throw new ApplyError('Only a sales agent can sync a sale.', 403);
  }
  const customerId = positiveInteger(body.customer_id);
  const paymentMethodId = positiveInteger(body.payment_method_id);
  const invoicesDate = body.invoices_date;
  const dueDate = body.due_date;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const items = Array.isArray(body.items) ? body.items : [];
  const purchaseRequestId = positiveInteger(body.purchase_request_id);
  const savedOffline = Boolean(body.saved_offline);

  if (!customerId || !paymentMethodId || !isValidDate(invoicesDate)) {
    throw new ApplyError('Valid customer_id, payment_method_id, and invoices_date are required.');
  }
  if (dueDate !== undefined && dueDate !== null && dueDate !== '' && !isValidDate(dueDate)) {
    throw new ApplyError('due_date must be a valid YYYY-MM-DD date when provided.');
  }
  if (!items.length) throw new ApplyError('At least one line item is required.');
  if (user.branchId === null || user.branchId === undefined) {
    throw new ApplyError('Sales invoices must be logged by a branch-assigned sales agent.');
  }

  const normalizedItems = [];
  for (const rawItem of items) {
    const productId = positiveInteger(rawItem.product_id);
    const quantity = positiveInteger(rawItem.quantity);
    if (!productId || !quantity) {
      throw new ApplyError('Each line item requires a valid product_id and quantity.');
    }
    normalizedItems.push({ productId, quantity });
  }

  await client.query('SELECT pg_advisory_xact_lock($1)', [748392001]);

  const customerResult = await client.query(
    `SELECT customer_id, branch_id FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  if (!customerResult.rows.length) throw new ApplyError('Customer not found', 404);
  if (customerResult.rows[0].branch_id !== user.branchId) {
    throw new ApplyError('Access denied: customer is not in your assigned branch.', 403);
  }

  const paymentResult = await client.query(
    `SELECT payment_method_id FROM payment_methods
     WHERE payment_method_id = $1 AND status = 'Active'`,
    [paymentMethodId]
  );
  if (!paymentResult.rows.length) throw new ApplyError('Invalid payment method.');

  const lineItems = [];
  const stockAlerts = [];
  for (const item of normalizedItems) {
    const productResult = await client.query(
      `SELECT id, unit_price FROM products WHERE id = $1 AND status = 'Active'`,
      [item.productId]
    );
    if (!productResult.rows.length) {
      throw new ApplyError(`Product ${item.productId} was not found or is inactive.`);
    }
    const unitPrice = Number(productResult.rows[0].unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new ApplyError(`Product ${item.productId} has an invalid unit price.`);
    }
    let snapshot;
    try {
      snapshot = await upsertBranchInventoryStock(client, {
        branchId: user.branchId,
        productId: item.productId,
        delta: -item.quantity,
      });
    } catch (stockError) {
      if (stockError.message === 'INSUFFICIENT_STOCK') {
        const offlineNote = savedOffline
          ? ' The stock changed after this sale was saved on the device.'
          : '';
        throw new SyncConflict(`Not enough stock for product ${item.productId} at your branch.${offlineNote}`);
      }
      throw stockError;
    }
    stockAlerts.push(snapshot);
    lineItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
    });
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const invoiceNumber = await generateInvoiceNumber(client);
  const invoiceInsert = await client.query(
    `INSERT INTO sales_invoices
       (invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
        payment_method_id, status, invoices_date, due_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pending Review', $7, $8, $9)
     RETURNING sales_invoices_id`,
    [
      invoiceNumber,
      customerId,
      user.id,
      user.branchId,
      totalAmount,
      paymentMethodId,
      invoicesDate,
      dueDate && isValidDate(dueDate) ? dueDate : null,
      notes || null,
    ]
  );
  const invoiceId = invoiceInsert.rows[0].sales_invoices_id;
  const balance = await chargeCustomerForSale(client, { customerId, amount: totalAmount });

  for (let index = 0; index < lineItems.length; index += 1) {
    const item = lineItems[index];
    await client.query(
      `INSERT INTO sales_invoice_items
         (invoices_id, product_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, item.productId, item.quantity, item.unitPrice, item.lineTotal]
    );
    await insertStockMovement(client, {
      performedBy: user.id,
      productId: item.productId,
      branchId: user.branchId,
      quantity: -item.quantity,
      type: 'Sale Deduction',
      movementRef: `SALE-${invoiceNumber}-${item.productId}-${index + 1}`,
      movementDate: invoicesDate || manilaDateString(),
    });
  }

  if (purchaseRequestId) {
    const prCheck = await client.query(
      `SELECT pr.request_id, pr.customer_id, pr.status, pr.sales_invoices_id
       FROM purchase_requests pr
       WHERE pr.request_id = $1`,
      [purchaseRequestId]
    );
    if (!prCheck.rows.length || prCheck.rows[0].customer_id !== customerId) {
      throw new ApplyError('Invalid purchase request for this customer.');
    }
    if (prCheck.rows[0].sales_invoices_id) {
      throw new SyncConflict('This purchase request is already linked to an invoice.');
    }
    await client.query(
      `UPDATE purchase_requests
       SET sales_invoices_id = $1, status = 'Invoiced', updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $2`,
      [invoiceId, purchaseRequestId]
    );
  }

  return {
    kind: 'invoice',
    invoiceId,
    invoiceNumber,
    customerId,
    totalAmount,
    outstandingBalance: balance?.outstandingBalance ?? null,
    stockAlerts,
    branchId: user.branchId,
    agentId: user.id,
  };
}
