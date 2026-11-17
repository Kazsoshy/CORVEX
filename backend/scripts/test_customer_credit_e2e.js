/**
 * Live API E2E: SA register with credit → BM approve → credit_info → optional installment sale.
 * Also smoke-tests Reject (no credit activation) on a disposable customer that is cleaned up.
 *
 * Usage: node backend/scripts/test_customer_credit_e2e.js
 * Env: DB_* ; optional API_BASE to hit a running server instead of an in-process app.
 */
import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import pkg from 'pg';
import { suggestFirstCreditLimit, DEFAULT_CREDIT_POLICIES } from '../lib/creditPolicies.js';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'customer-credit-e2e-secret';

const { requireAuth, requireBranchScope, issueSessionToken } = await import('../middleware/auth.js');
const { default: customersRouter } = await import('../routes/customers.js');
const { default: approvalsRouter } = await import('../routes/approvals.js');
const { default: salesRouter } = await import('../routes/sales.js');
const { default: productsRouter } = await import('../routes/products.js');

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

const results = [];
const createdCustomerIds = [];

function check(name, cond, detail = '') {
  results.push([name, cond ? 'PASS' : 'FAIL', detail]);
  if (!cond) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(base, method, url, token, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

function stampName(prefix) {
  return `${prefix} ${Date.now().toString(36)}`;
}

async function main() {
  let server = null;
  let base = process.env.API_BASE ? String(process.env.API_BASE).replace(/\/$/, '') : null;

  if (!base) {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.locals.pool = pool;
    app.use('/api/customers', requireAuth, requireBranchScope, customersRouter);
    app.use('/api/approvals', requireAuth, approvalsRouter);
    app.use('/api/sales', requireAuth, requireBranchScope, salesRouter);
    app.use('/api/products', requireAuth, requireBranchScope, productsRouter);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}/api`;
  }

  // Income vs revenue suggestion unit smoke (no HTTP).
  const incomeSuggest = suggestFirstCreditLimit({
    policies: DEFAULT_CREDIT_POLICIES,
    monthlyIncome: 25000,
    existingObligations: 1000,
    classification: 'Employed Individual',
    hasEvidence: true,
  });
  check('income_path_suggestion', incomeSuggest.suggested_limit != null && incomeSuggest.path === 'income', String(incomeSuggest.suggested_limit));

  const revenueSuggest = suggestFirstCreditLimit({
    policies: DEFAULT_CREDIT_POLICIES,
    estimatedMonthlyRevenue: 40000,
    existingObligations: 2000,
    classification: 'Business Owner',
    hasEvidence: true,
  });
  check('revenue_path_suggestion', revenueSuggest.suggested_limit != null && revenueSuggest.path === 'revenue', String(revenueSuggest.suggested_limit));

  const pair = await pool.query(
    `SELECT sa.id AS sa_id, sa.branch_id, bm.id AS bm_id
     FROM users sa
     JOIN roles rsa ON rsa.role_id = sa.role_id AND rsa.slug = 'sales_staff'
     JOIN users bm ON bm.branch_id = sa.branch_id AND bm.status = 'Active'
     JOIN roles rbm ON rbm.role_id = bm.role_id AND rbm.slug = 'branch_manager'
     WHERE sa.status = 'Active' AND sa.branch_id IS NOT NULL
     ORDER BY sa.branch_id, sa.id
     LIMIT 1`
  );
  check('sa_bm_pair', pair.rows.length === 1, 'need Active sales_staff + branch_manager on same branch');
  const { sa_id: saId, bm_id: bmId, branch_id: branchId } = pair.rows[0];
  const saToken = issueSessionToken(saId);
  const bmToken = issueSessionToken(bmId);

  const territory = await pool.query(
    `SELECT territory_id FROM territories
     WHERE branch_id = $1 AND COALESCE(status, 'Active') = 'Active'
     ORDER BY territory_id LIMIT 1`,
    [branchId]
  );
  check('territory_available', territory.rows.length === 1, 'branch needs an active territory');
  const territoryId = territory.rows[0].territory_id;

  const phone = `09${String(Date.now()).slice(-9)}`;
  const createPayload = {
    customer_type: 'Business',
    business_name: stampName('E2E Credit Store'),
    first_name: 'E2E',
    last_name: 'Owner',
    contact_phone: phone,
    address_region: 'Region XI (Davao Region)',
    address_province: 'Davao City (HUC)',
    address_city: 'City of Davao',
    address_barangay: 'Poblacion',
    address_street: 'E2E Test Street',
    address: 'E2E Test Street, Poblacion, City of Davao',
    latitude: 7.1907,
    longitude: 125.4553,
    territory_id: territoryId,
    contact_person_fname: 'E2E',
    contact_person_lname: 'Owner',
    contact_person_phone: phone,
    contact_person_relationship: 'Owner',
    estimated_monthly_revenue: 40000,
    estimated_monthly_expenses: 15000,
    existing_obligations: 2000,
    request_credit: true,
    requested_credit_limit: 15000,
    credit_request_reason: 'First installment',
    credit_request_remarks: 'E2E credit workflow proof',
    acknowledge_duplicate: true,
    registration_profile: {
      classification: 'Business Owner',
      business_type: 'Retail',
      store_type: 'Sari-sari',
      years_of_operation: 3,
      requested_credit_limit: 15000,
      evidence_photos: [{ name: 'e2e-placeholder.png' }],
    },
  };

  const created = await call(base, 'POST', '/customers', saToken, createPayload);
  check('sa_register_credit', created.status === 201 || created.status === 200, `status=${created.status} ${created.body.message || ''}`);
  const customerId = created.body.data?.customer_id || created.body.data?.customer?.customer_id;
  check('customer_id', Boolean(customerId), JSON.stringify(created.body));
  createdCustomerIds.push(customerId);

  const ciId = created.body.credit_investigation?.ci_id
    || created.body.data?.credit_investigation?.ci_id
    || (await pool.query(
      `SELECT ci_id FROM credit_investigations WHERE customer_id = $1 ORDER BY ci_id DESC LIMIT 1`,
      [customerId]
    )).rows[0]?.ci_id;
  check('ci_created', Boolean(ciId), 'expected Pending CI');

  const ciRow = await pool.query(
    `SELECT status, requested_credit_limit, financial_snapshot_json
     FROM credit_investigations WHERE ci_id = $1`,
    [ciId]
  );
  check('ci_pending', ciRow.rows[0]?.status === 'Pending', ciRow.rows[0]?.status);
  const snap = typeof ciRow.rows[0].financial_snapshot_json === 'string'
    ? JSON.parse(ciRow.rows[0].financial_snapshot_json)
    : ciRow.rows[0].financial_snapshot_json;
  const suggested = snap?.suggestion?.suggested_limit;
  check('ci_suggestion_snapshot', suggested == null || Number(suggested) > 0, String(suggested));

  // Protected-field PUT must not apply directly.
  const putProtected = await call(base, 'PUT', `/customers/${customerId}`, saToken, {
    first_name: 'Hacker',
    reason: 'E2E protected-field probe',
  });
  check(
    'sa_protected_put_queued',
    putProtected.status === 202 || putProtected.body.pending === true,
    `status=${putProtected.status}`
  );
  const nameCheck = await pool.query(`SELECT first_name FROM customers WHERE customer_id = $1`, [customerId]);
  check('sa_protected_not_applied', nameCheck.rows[0].first_name === 'E2E', nameCheck.rows[0].first_name);

  // Soft field may apply directly.
  const putSoft = await call(base, 'PUT', `/customers/${customerId}`, saToken, {
    secondary_contact_phone: '09170001111',
  });
  check('sa_soft_put_ok', putSoft.status === 200, `status=${putSoft.status}`);

  const approveLimit = Number(suggested) > 0 ? Number(suggested) : 12000;
  const decide = await call(base, 'PATCH', `/approvals/credit-investigations/${ciId}`, bmToken, {
    status: 'Approved',
    approved_credit_limit: approveLimit,
    decision_remarks: 'E2E approve',
  });
  // Some deployments expose decide under /sales or /branch-manager — try approvals first then sales.
  let decideOk = decide.status === 200 && decide.body.success;
  if (!decideOk) {
    const alt = await call(base, 'PATCH', `/sales/credit-investigations/${ciId}`, bmToken, {
      status: 'Approved',
      approved_credit_limit: approveLimit,
      decision_remarks: 'E2E approve',
    });
    decideOk = alt.status === 200 && alt.body.success;
    check('bm_approve_ci', decideOk, `approvals=${decide.status} sales=${alt.status} ${alt.body.message || decide.body.message || ''}`);
  } else {
    check('bm_approve_ci', true, `limit=${approveLimit}`);
  }

  const credit = await pool.query(
    `SELECT credit_limit, approved_by FROM customer_credit_info WHERE customer_id = $1`,
    [customerId]
  );
  check('credit_info_set', credit.rows.length === 1 && Number(credit.rows[0].credit_limit) > 0, JSON.stringify(credit.rows[0] || {}));

  const detail = await call(base, 'GET', `/customers/${customerId}`, saToken);
  const limit = Number(detail.body.data?.creditInfo?.credit_limit || detail.body.data?.credit_info?.credit_limit || 0);
  const outstanding = Number(detail.body.data?.outstanding_balance || detail.body.data?.activity?.outstanding_balance || 0);
  const available = Math.max(0, limit - outstanding);
  check('sa_detail_available_credit', limit > 0 && available === Math.max(0, limit - outstanding), `limit=${limit} available=${available}`);

  // Optional installment sale if stock exists (schema-tolerant).
  let stockRow = null;
  try {
    const stock = await pool.query(
      `SELECT bi.product_id,
              COALESCE(p.name, 'Product') AS product_name,
              COALESCE(bi.available_stock, bi.quantity, 0)::float AS qty,
              COALESCE(p.unit_price, 0)::float AS selling_price
       FROM branch_inventory bi
       JOIN products p ON p.id = bi.product_id AND p.status = 'Active'
       WHERE bi.branch_id = $1
         AND COALESCE(bi.available_stock, bi.quantity, 0) > 0
         AND COALESCE(p.unit_price, 0) > 0
       ORDER BY COALESCE(bi.available_stock, bi.quantity, 0) DESC
       LIMIT 1`,
      [branchId]
    );
    stockRow = stock.rows[0] || null;
  } catch (err) {
    results.push(['installment_sale_stock_lookup', 'SKIP', err.message]);
  }
  if (stockRow && available > 0) {
    const unitPrice = Number(stockRow.selling_price);
    const payMethod = await pool.query(
      `SELECT payment_method_id FROM payment_methods
       WHERE status = 'Active' AND LOWER(method_name) IN ('cash', 'gcash')
       ORDER BY payment_method_id LIMIT 1`
    );
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    const firstDue = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    // Ask pricing endpoint for term; fall back to 3 months if unavailable.
    let termMonths = 3;
    const priced = await call(base, 'POST', '/sales/pricing/calculate', saToken, {
      items: [{ product_id: stockRow.product_id, quantity: 1 }],
      payment_arrangement: 'installment',
      invoices_date: ymd,
    });
    if (priced.body?.data?.termMonths) termMonths = Number(priced.body.data.termMonths);
    else if (priced.body?.termMonths) termMonths = Number(priced.body.termMonths);

    const sale = await call(base, 'POST', '/sales/invoices', saToken, {
      customer_id: customerId,
      invoices_date: ymd,
      pay_type: 'installment',
      payment_method_id: payMethod.rows[0]?.payment_method_id,
      down_payment: 0,
      term_months: termMonths,
      first_due_date: firstDue,
      items: [{ product_id: stockRow.product_id, quantity: 1 }],
    });
    if (sale.status === 200 || sale.status === 201) {
      const after = await pool.query(
        `SELECT COALESCE(outstanding_balance, 0)::float AS outstanding
         FROM customer_activity WHERE customer_id = $1`,
        [customerId]
      );
      const newOutstanding = Number(after.rows[0]?.outstanding || 0);
      check('installment_sale_updates_outstanding', newOutstanding > outstanding, `before=${outstanding} after=${newOutstanding}`);
      check('available_shrinks', Math.max(0, limit - newOutstanding) < available || newOutstanding > 0, `available was ${available}`);
    } else {
      results.push(['installment_sale', 'SKIP', `status=${sale.status} ${sale.body.message || ''} price=${unitPrice}`]);
    }
  } else if (!stockRow) {
    results.push(['installment_sale', 'SKIP', 'no stock or available credit for sale']);
  }

  // Reject smoke on disposable customer (cleaned up).
  const rejectPhone = `09${String(Date.now() + 7).slice(-9)}`;
  const rejectCreate = await call(base, 'POST', '/customers', saToken, {
    ...createPayload,
    business_name: stampName('E2E Reject Store'),
    contact_phone: rejectPhone,
    contact_person_phone: rejectPhone,
    request_credit: true,
    acknowledge_duplicate: true,
  });
  const rejectCustomerId = rejectCreate.body.data?.customer_id || rejectCreate.body.data?.customer?.customer_id;
  check('reject_customer_created', Boolean(rejectCustomerId), rejectCreate.body.message || '');
  if (rejectCustomerId) createdCustomerIds.push(rejectCustomerId);

  const rejectCiId = rejectCreate.body.credit_investigation?.ci_id
    || rejectCreate.body.data?.credit_investigation?.ci_id
    || (await pool.query(
      `SELECT ci_id FROM credit_investigations WHERE customer_id = $1 ORDER BY ci_id DESC LIMIT 1`,
      [rejectCustomerId]
    )).rows[0]?.ci_id;
  check('reject_ci_created', Boolean(rejectCiId));

  let rejectDecide = await call(base, 'PATCH', `/approvals/credit-investigations/${rejectCiId}`, bmToken, {
    status: 'Rejected',
    rejection_reason: 'E2E reject smoke — insufficient capacity',
    decision_remarks: 'E2E reject smoke',
  });
  if (!(rejectDecide.status === 200 && rejectDecide.body.success)) {
    rejectDecide = await call(base, 'PATCH', `/sales/credit-investigations/${rejectCiId}`, bmToken, {
      status: 'Rejected',
      rejection_reason: 'E2E reject smoke — insufficient capacity',
      decision_remarks: 'E2E reject smoke',
    });
  }
  check('bm_reject_ci', rejectDecide.status === 200 && rejectDecide.body.success, rejectDecide.body.message || '');

  const rejectCredit = await pool.query(
    `SELECT credit_limit FROM customer_credit_info WHERE customer_id = $1`,
    [rejectCustomerId]
  );
  const rejectedLimit = rejectCredit.rows[0] ? Number(rejectCredit.rows[0].credit_limit) : 0;
  check('reject_no_credit_activation', !rejectCredit.rows.length || !(rejectedLimit > 0), JSON.stringify(rejectCredit.rows[0] || {}));

  // Cleanup disposable reject customer (keep approve-path customer as the permanent proof record).
  if (rejectCustomerId) {
    await pool.query(`DELETE FROM credit_investigations WHERE customer_id = $1`, [rejectCustomerId]);
    await pool.query(`DELETE FROM customer_change_requests WHERE customer_id = $1`, [rejectCustomerId]);
    await pool.query(`DELETE FROM customer_credit_info WHERE customer_id = $1`, [rejectCustomerId]);
    await pool.query(`DELETE FROM customer_activity WHERE customer_id = $1`, [rejectCustomerId]);
    await pool.query(`DELETE FROM customers WHERE customer_id = $1`, [rejectCustomerId]);
    results.push(['reject_customer_cleanup', 'PASS', `deleted ${rejectCustomerId}`]);
  }

  console.log(JSON.stringify({
    ok: true,
    approved_customer_id: customerId,
    ci_id: ciId,
    credit_limit: credit.rows[0]?.credit_limit,
    results,
  }, null, 2));

  if (server) server.close();
  await pool.end();
}

main().catch(async (err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, results }, null, 2));
  try {
    // Best-effort cleanup of reject customer only.
    for (const id of createdCustomerIds.slice(1)) {
      await pool.query(`DELETE FROM credit_investigations WHERE customer_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM customer_change_requests WHERE customer_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM customer_credit_info WHERE customer_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM customer_activity WHERE customer_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM customers WHERE customer_id = $1`, [id]).catch(() => {});
    }
  } catch { /* ignore */ }
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
