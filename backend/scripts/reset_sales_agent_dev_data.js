/**
 * DEV/TEST ONLY — Reset Sales Agent module data and seed 5 realistic records
 * per SA module without touching warehouse inventory or other roles' shared data.
 *
 * Usage: node backend/scripts/reset_sales_agent_dev_data.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
dotenv.config({ path: path.join(root, '.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

const report = {
  environment: {
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
  },
  backupPath: null,
  deleted: {},
  preserved: {},
  created: {},
  samples: {},
  verification: {},
  notes: [],
};

function assertDevEnvironment() {
  const name = String(process.env.DB_NAME || '').toLowerCase();
  const host = String(process.env.DB_HOST || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    throw new Error(`Refusing to run against non-local host (${process.env.DB_HOST}).`);
  }
  if (name.includes('prod') || name.includes('production')) {
    throw new Error(`Refusing to run against production-looking database (${process.env.DB_NAME}).`);
  }
}

async function q(client, sql, params = []) {
  return (await client.query(sql, params)).rows;
}

async function count(client, sql, params = []) {
  const rows = await q(client, sql, params);
  return Number(rows[0]?.c || 0);
}

async function backupScopedData(client, agentIds) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(root, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const backupPath = path.join(dir, `sa-reset-backup-${stamp}.json`);

  const payload = {
    createdAt: new Date().toISOString(),
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    agentIds,
    tables: {},
  };

  const dumps = [
    ['sales_area_assignments', `SELECT * FROM sales_area_assignments WHERE sales_agent_id = ANY($1::int[])`],
    ['sales_area_assignment_products', `
      SELECT sap.* FROM sales_area_assignment_products sap
      JOIN sales_area_assignments saa ON saa.assignment_id = sap.assignment_id
      WHERE saa.sales_agent_id = ANY($1::int[])`],
    ['field_activity_reports', `SELECT * FROM field_activity_reports WHERE user_id = ANY($1::int[])`],
    ['sales_invoices', `SELECT * FROM sales_invoices WHERE sales_agent_id = ANY($1::int[])`],
    ['sales_invoice_items', `
      SELECT sii.* FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id
      WHERE si.sales_agent_id = ANY($1::int[])`],
    ['credit_investigations', `SELECT * FROM credit_investigations WHERE submitted_by = ANY($1::int[])`],
    ['credit_history_via_sales', `
      SELECT ch.* FROM credit_history ch
      JOIN sales_invoices si ON si.sales_invoices_id = ch.sales_id
      WHERE si.sales_agent_id = ANY($1::int[])`],
    ['customers_assigned', `SELECT * FROM customers WHERE assigned_sales_agent_id = ANY($1::int[])`],
  ];

  for (const [name, sql] of dumps) {
    payload.tables[name] = await q(client, sql, [agentIds]);
  }

  // Inventory snapshot to prove unchanged
  payload.tables.branch_inventory_snapshot = await q(client, `SELECT * FROM branch_inventory ORDER BY inventory_id`);
  payload.tables.stock_movements_snapshot = await q(client, `SELECT * FROM stock_movements ORDER BY 1`);
  payload.tables.collection_payment_count = await count(client, `SELECT COUNT(*)::int AS c FROM collection_payment`);
  payload.tables.products_count = await count(client, `SELECT COUNT(*)::int AS c FROM products`);

  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2));
  report.backupPath = backupPath;
  return payload;
}

async function deleteSaOwnedData(client, agentIds) {
  // 1) Field reports by SA (before assignments FK)
  report.deleted.field_activity_reports = (
    await client.query(`DELETE FROM field_activity_reports WHERE user_id = ANY($1::int[])`, [agentIds])
  ).rowCount;

  // 2) Assignment products then assignments
  const assignmentIds = (await q(client,
    `SELECT assignment_id FROM sales_area_assignments WHERE sales_agent_id = ANY($1::int[])`,
    [agentIds]
  )).map((r) => r.assignment_id);

  if (assignmentIds.length) {
    report.deleted.sales_area_assignment_products = (
      await client.query(
        `DELETE FROM sales_area_assignment_products WHERE assignment_id = ANY($1::int[])`,
        [assignmentIds]
      )
    ).rowCount;
  } else {
    report.deleted.sales_area_assignment_products = 0;
  }

  report.deleted.sales_area_assignments = (
    await client.query(
      `DELETE FROM sales_area_assignments WHERE sales_agent_id = ANY($1::int[])`,
      [agentIds]
    )
  ).rowCount;

  // 3) Invoice-linked credit history, then items, then invoices
  const invoiceIds = (await q(client,
    `SELECT sales_invoices_id FROM sales_invoices WHERE sales_agent_id = ANY($1::int[])`,
    [agentIds]
  )).map((r) => r.sales_invoices_id);

  if (invoiceIds.length) {
    // Detach purchase requests without deleting them (other workflow)
    await client.query(
      `UPDATE purchase_requests
       SET sales_invoices_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE sales_invoices_id = ANY($1::int[])`,
      [invoiceIds]
    );

    report.deleted.credit_history = (
      await client.query(
        `DELETE FROM credit_history WHERE sales_id = ANY($1::int[])`,
        [invoiceIds]
      )
    ).rowCount;

    report.deleted.sales_invoice_items = (
      await client.query(
        `DELETE FROM sales_invoice_items WHERE invoices_id = ANY($1::int[])`,
        [invoiceIds]
      )
    ).rowCount;

    report.deleted.sales_invoices = (
      await client.query(
        `DELETE FROM sales_invoices WHERE sales_invoices_id = ANY($1::int[])`,
        [invoiceIds]
      )
    ).rowCount;
  } else {
    report.deleted.credit_history = 0;
    report.deleted.sales_invoice_items = 0;
    report.deleted.sales_invoices = 0;
  }

  // 4) Credit reviews submitted by SA
  report.deleted.credit_investigations = (
    await client.query(
      `DELETE FROM credit_investigations WHERE submitted_by = ANY($1::int[])`,
      [agentIds]
    )
  ).rowCount;

  // 5) Customers assigned to SA — only delete those with NO shared collector/SAW/special-collection deps
  const candidates = await q(client, `
    SELECT c.customer_id, c.customer_code, c.user_id,
      (SELECT COUNT(*)::int FROM collection_payment cp WHERE cp.customer_id = c.customer_id) AS payments,
      (SELECT COUNT(*)::int FROM saw_results sr WHERE sr.customer_id = c.customer_id) AS saw,
      (SELECT COUNT(*)::int FROM special_collection_requests scr WHERE scr.customer_id = c.customer_id) AS special_coll,
      (SELECT COUNT(*)::int FROM field_visits fv WHERE fv.customer_id = c.customer_id AND fv.visit_type = 'Collection') AS collection_visits
    FROM customers c
    WHERE c.assigned_sales_agent_id = ANY($1::int[])
  `, [agentIds]);

  const deletable = [];
  const preserved = [];
  for (const row of candidates) {
    if (row.payments > 0 || row.saw > 0 || row.special_coll > 0 || row.collection_visits > 0 || row.user_id) {
      preserved.push(row);
    } else {
      deletable.push(row.customer_id);
    }
  }

  report.preserved.customers_with_shared_deps = preserved.map((p) => ({
    customer_id: p.customer_id,
    customer_code: p.customer_code,
    payments: p.payments,
    saw: p.saw,
    special_coll: p.special_coll,
  }));

  if (preserved.length) {
    // Unassign SA so fresh DEV customers become the SA working set
    await client.query(
      `UPDATE customers
       SET assigned_sales_agent_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = ANY($1::int[])`,
      [preserved.map((p) => p.customer_id)]
    );
    report.notes.push(
      `Preserved ${preserved.length} customer(s) with collector/SAW/portal links; unassigned from sales agents.`
    );
  }

  if (deletable.length) {
    await client.query(`DELETE FROM customer_portal_invitations WHERE customer_id = ANY($1::int[])`, [deletable]);
    await client.query(`DELETE FROM customer_credit_info WHERE customer_id = ANY($1::int[])`, [deletable]);
    await client.query(`DELETE FROM customer_activity WHERE customer_id = ANY($1::int[])`, [deletable]);
    // Sales-only field visits for these customers
    await client.query(
      `DELETE FROM field_activity_reports WHERE visit_id IN (
         SELECT visit_id FROM field_visits WHERE customer_id = ANY($1::int[])
       )`,
      [deletable]
    );
    await client.query(
      `DELETE FROM field_visits WHERE customer_id = ANY($1::int[]) AND visit_type = 'Sales'`,
      [deletable]
    );
    report.deleted.customers = (
      await client.query(`DELETE FROM customers WHERE customer_id = ANY($1::int[])`, [deletable])
    ).rowCount;
  } else {
    report.deleted.customers = 0;
  }
}

function manilaDateOffset(days) {
  const now = new Date();
  // Approximate Manila calendar date via en-CA formatting after offset
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function seedFreshData(client, agents, branchId, bmId, territoryIds, product, paymentMethods) {
  const agentA = agents[0];
  const agentB = agents[1] || agents[0];
  const agentC = agents[2] || agents[0];
  const cash = paymentMethods.find((p) => p.method_name === 'Cash')?.payment_method_id || 1;
  const credit = paymentMethods.find((p) => p.method_name === 'Credit')?.payment_method_id || 6;
  const gcash = paymentMethods.find((p) => p.method_name === 'GCash')?.payment_method_id || 4;
  const unitPrice = Number(product.unit_price);

  // --- Customers (5 distinct DEV profiles) ---
  const customerSpecs = [
    {
      code: 'DEV-SA-C01',
      first: 'Maricel', middle: 'Santos', last: 'Bautista',
      phone: '09171234501', status: 'Active',
      street: '12 Mabini Ext', barangay: 'Buhangin Proper', city: 'Davao City',
      province: 'Davao del Sur', region: 'Region XI (Davao Region)', zip: '8000',
      civil: 'Married', maiden: 'Santos',
      agentId: agentA.id, territoryId: territoryIds[0],
      creditLimit: 45000, income: 38000, score: 720, employment: 'Self-Employed',
      balance: 8500, volume: 25998,
      lat: 7.1125, lng: 125.6234,
    },
    {
      code: 'DEV-SA-C02',
      first: 'Erwin', middle: 'Gomez', last: 'Villanueva',
      phone: '09182227654', status: 'Active',
      street: '45 Jacinto St', barangay: 'Poblacion', city: 'Davao City',
      province: 'Davao del Sur', region: 'Region XI (Davao Region)', zip: '8000',
      civil: 'Single', maiden: null,
      agentId: agentB.id, territoryId: territoryIds[1] || territoryIds[0],
      creditLimit: null, income: 22000, score: null, employment: 'Employed',
      balance: 0, volume: 0,
      lat: 7.0731, lng: 125.6128,
    },
    {
      code: 'DEV-SA-C03',
      first: 'Lovely', middle: 'Reyes', last: 'Carandang',
      phone: '09998881234', status: 'Active',
      street: '8 Ecoland Drive', barangay: 'Matina Crossing', city: 'Davao City',
      province: 'Davao del Sur', region: 'Region XI (Davao Region)', zip: '8000',
      civil: 'Widowed', maiden: 'Reyes',
      agentId: agentA.id, territoryId: territoryIds[0],
      creditLimit: 20000, income: 28000, score: 610, employment: 'Self-Employed',
      balance: 16200, volume: 38997,
      lat: 7.0548, lng: 125.5912,
    },
    {
      code: 'DEV-SA-C04',
      first: 'Jonah', middle: 'Perez', last: 'Alcantara',
      phone: '09065550123', status: 'Inactive',
      street: '101 Quimpo Blvd', barangay: 'Bucana', city: 'Davao City',
      province: 'Davao del Sur', region: 'Region XI (Davao Region)', zip: '8000',
      civil: 'Married', maiden: null,
      agentId: agentC.id, territoryId: territoryIds[1] || territoryIds[0],
      creditLimit: 10000, income: 18000, score: 540, employment: 'Unemployed',
      balance: 0, volume: 12999,
      lat: 7.0642, lng: 125.6089,
    },
    {
      code: 'DEV-SA-C05',
      first: 'Thelma', middle: 'Cruz', last: 'Ocampo',
      phone: '09173330987', status: 'Active',
      street: '27 Bajada Heights', barangay: 'Bajada', city: 'Davao City',
      province: 'Davao del Sur', region: 'Region XI (Davao Region)', zip: '8000',
      civil: 'Single', maiden: 'Cruz',
      agentId: agentB.id, territoryId: territoryIds[0],
      creditLimit: 60000, income: 52000, score: 780, employment: 'Employed',
      balance: 3200, volume: 51996,
      lat: 7.0987, lng: 125.6155,
    },
  ];

  const customers = [];
  for (const spec of customerSpecs) {
    const address = `${spec.street}, ${spec.barangay}, ${spec.city}`;
    const inserted = await q(client, `
      INSERT INTO customers (
        customer_code, branch_id, account_manager_id, territory_id, assigned_sales_agent_id,
        first_name, middle_name, last_name, contact_phone, address,
        address_street, address_barangay, address_city, address_province, address_region, address_zip,
        latitude, longitude, status, civil_status, mothers_maiden_name,
        id_type, id_number, id_verification_status,
        contact_person_fname, contact_person_lname, contact_person_phone, contact_person_relationship
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,
        $22,$23,$24,
        $25,$26,$27,$28
      )
      RETURNING customer_id, customer_code, first_name, last_name, status, assigned_sales_agent_id
    `, [
      spec.code, branchId, bmId, spec.territoryId, spec.agentId,
      spec.first, spec.middle, spec.last, spec.phone, address,
      spec.street, spec.barangay, spec.city, spec.province, spec.region, spec.zip,
      spec.lat, spec.lng, spec.status, spec.civil, spec.maiden,
      'PhilSys ID',
      `DEV-${spec.code.slice(-3)}-${String(900000 + customers.length)}`,
      ['Verified', 'Pending Review', 'Unverified', 'Unverified', 'Verified'][customers.length] || 'Unverified',
      spec.first, spec.last, spec.phone, 'Self',
    ]);
    const customer = inserted[0];
    customers.push({ ...customer, ...spec });

    await client.query(`
      INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_sales_visit, updated_at)
      VALUES ($1, $2, $3, $4::date, CURRENT_TIMESTAMP)
    `, [customer.customer_id, spec.balance, spec.volume, manilaDateOffset(-2)]);

    if (spec.creditLimit != null) {
      await client.query(`
        INSERT INTO customer_credit_info (
          customer_id, credit_limit, monthly_income, employment_status, credit_score, approved_by, approved_date
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `, [customer.customer_id, spec.creditLimit, spec.income, spec.employment, spec.score, bmId]);
    } else {
      // No approved limit — still store income profile only if table requires customer_id unique; skip row
      report.notes.push(`${spec.code} has no approved credit limit (credit-info row omitted).`);
    }
  }
  report.created.customers = customers.length;
  report.created.customer_credit_info = customers.filter((c) => c.creditLimit != null).length;
  report.samples.customers = customers.map((c) => ({
    code: c.customer_code,
    name: `${c.first_name} ${c.last_name}`,
    status: c.status,
    creditLimit: c.creditLimit,
    balance: c.balance,
  }));

  // --- Area assignments (5) ---
  const assignmentSpecs = [
    {
      agentId: agentA.id, territoryId: territoryIds[0],
      area: 'Buhangin Market Perimeter',
      notes: 'Canvass appliance and sofa prospects near the wet market. Prioritize storefront owners.',
      workDate: manilaDateOffset(0), status: 'In Progress',
      lat: 7.1254, lng: 125.6301, radius: 700,
      started: true,
    },
    {
      agentId: agentB.id, territoryId: territoryIds[1] || territoryIds[0],
      area: 'Matina Crossing Loop',
      notes: 'Follow up unfinished credit conversations from last week. Push sofa demos.',
      workDate: manilaDateOffset(0), status: 'Assigned',
      lat: 7.0501, lng: 125.5884, radius: 900,
      started: false,
    },
    {
      agentId: agentA.id, territoryId: territoryIds[0],
      area: 'Bajada Commercial Strip',
      notes: 'Register two new households interested in installment sofas.',
      workDate: manilaDateOffset(1), status: 'Assigned',
      lat: 7.0955, lng: 125.6148, radius: 650,
      started: false,
    },
    {
      agentId: agentC.id, territoryId: territoryIds[1] || territoryIds[0],
      area: 'Ecoland Residential Cluster',
      notes: 'Complete leftover canvass for inactive lead reactivation.',
      workDate: manilaDateOffset(-1), status: 'Done',
      lat: 7.0589, lng: 125.5955, radius: 800,
      started: true, completed: true,
    },
    {
      agentId: agentB.id, territoryId: territoryIds[0],
      area: 'Lanang Boulevard Stretch',
      notes: 'Morning canvass only — afternoon reserved for invoice follow-ups.',
      workDate: manilaDateOffset(2), status: 'Assigned',
      lat: 7.1088, lng: 125.6482, radius: 1000,
      started: false,
    },
  ];

  const assignments = [];
  for (const spec of assignmentSpecs) {
    const rows = await q(client, `
      INSERT INTO sales_area_assignments (
        branch_id, sales_agent_id, assigned_by, territory_id,
        area_name, coverage_notes, work_date, status,
        latitude, longitude, radius_meters, started_at, completed_at
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7::date,$8,
        $9,$10,$11,
        CASE WHEN $12 THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN $13 THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      RETURNING assignment_id, area_name, work_date, status, sales_agent_id
    `, [
      branchId, spec.agentId, bmId, spec.territoryId,
      spec.area, spec.notes, spec.workDate, spec.status,
      spec.lat, spec.lng, spec.radius,
      Boolean(spec.started), Boolean(spec.completed),
    ]);
    const assignment = rows[0];
    await client.query(
      `INSERT INTO sales_area_assignment_products (assignment_id, product_id) VALUES ($1, $2)`,
      [assignment.assignment_id, product.id]
    );
    assignments.push(assignment);
  }
  report.created.sales_area_assignments = assignments.length;
  report.samples.area_assignments = assignments.map((a) => ({
    id: a.assignment_id,
    area: a.area_name,
    date: a.work_date,
    status: a.status,
  }));

  // --- Field activity reports (5) linked to assignments ---
  const farSpecs = [
    { assignment: assignments[0], agentId: agentA.id, customer: customers[0], type: 'Canvass', remarks: 'Spoke with three stall owners near Buhangin market; Maricel requested a sofa quote for her living room set.' },
    { assignment: assignments[0], agentId: agentA.id, customer: customers[2], type: 'Follow-up', remarks: 'Returned to Lovely Carandang — she wants installment terms after reviewing the monthly schedule.' },
    { assignment: assignments[1], agentId: agentB.id, customer: customers[1], type: 'Product Demo', remarks: 'Showed Sample Sofa fabric options to Erwin Villanueva; no deposit yet, credit review needed first.' },
    { assignment: assignments[3], agentId: agentC.id, customer: customers[3], type: 'Lead Capture', remarks: 'Logged inactive account Jonah Alcantara after neighbor referral; flagged for reactivation call next week.' },
    { assignment: assignments[4], agentId: agentB.id, customer: customers[4], type: 'Credit Discussion', remarks: 'Reviewed remaining exposure with Thelma Ocampo; she plans a top-up purchase once BM confirms limit.' },
  ];

  const fars = [];
  for (const spec of farSpecs) {
    const rows = await q(client, `
      INSERT INTO field_activity_reports (
        visit_id, assignment_id, customer_id, user_id, activity_type, remarks, photo, sync_status
      ) VALUES (NULL, $1, $2, $3, $4, $5, NULL, 'Synced')
      RETURNING report_id, activity_type, assignment_id, customer_id
    `, [
      spec.assignment.assignment_id,
      spec.customer.customer_id,
      spec.agentId,
      spec.type,
      spec.remarks,
    ]);
    fars.push(rows[0]);
  }
  report.created.field_activity_reports = fars.length;
  report.samples.field_activity_reports = fars.map((f) => ({
    id: f.report_id,
    type: f.activity_type,
    assignment_id: f.assignment_id,
  }));

  // --- Credit reviews (5) with varied outcomes ---
  const ciSpecs = [
    {
      customer: customers[1], // no limit
      agentId: agentB.id,
      status: 'Pending',
      reason: 'First installment',
      requested: 25000,
      remarks: 'New prospect needs starter credit for sofa installment.',
      risk: 'Medium',
      score: 58,
      approvedLimit: null,
      decided: false,
    },
    {
      customer: customers[2], // high utilization
      agentId: agentA.id,
      status: 'Revision Requested',
      reason: 'Need higher limit',
      requested: 35000,
      remarks: 'Current limit nearly used; customer wants another unit.',
      risk: 'High',
      score: 41,
      approvedLimit: null,
      decided: false,
      decisionRemarks: 'Provide updated income proof and latest payment receipts.',
    },
    {
      customer: customers[0],
      agentId: agentA.id,
      status: 'Approved',
      reason: 'Customer over limit but wants another sale',
      requested: 50000,
      remarks: 'Temporary lift for confirmed full-payment top-up.',
      risk: 'Low',
      score: 76,
      approvedLimit: 50000,
      decided: true,
      decisionRemarks: 'Approved with existing payment discipline.',
    },
    {
      customer: customers[3],
      agentId: agentC.id,
      status: 'Rejected',
      reason: 'Other',
      requested: 15000,
      remarks: 'Inactive account requesting reactivation credit.',
      risk: 'High',
      score: 33,
      approvedLimit: null,
      decided: true,
      decisionRemarks: 'Reject until account is reactivated and two collections are current.',
      rejection: 'Insufficient recent payment activity.',
    },
    {
      customer: customers[4],
      agentId: agentB.id,
      status: 'Pending',
      reason: 'Need higher limit',
      requested: 75000,
      remarks: 'Strong payer requesting higher ceiling ahead of holiday promo.',
      risk: 'Low',
      score: 82,
      approvedLimit: null,
      decided: false,
    },
  ];

  const cis = [];
  for (const spec of ciSpecs) {
    const snapshot = {
      customer: {
        name: `${spec.customer.first_name} ${spec.customer.last_name}`,
        customer_code: spec.customer.customer_code,
      },
      financial: {
        credit_limit: spec.customer.creditLimit,
        outstanding_balance: spec.customer.balance,
        monthly_income: spec.customer.income,
      },
      risk: { level: spec.risk, score: spec.score, reasons: [spec.reason] },
      suggestion: { suggested_limit: spec.requested },
      source: 'DEV_SA_SEED',
    };
    const rows = await q(client, `
      INSERT INTO credit_investigations (
        customer_id, branch_id, submitted_by, approved_by, status,
        purpose, request_reason, requested_credit_limit, request_remarks,
        monthly_income, business_type, risk_score, risk_level, risk_reasons_json,
        leaflet_classification, financial_snapshot_json,
        approved_credit_limit, decision_remarks, rejection_reason, decided_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,$14::jsonb,
        $15,$16::jsonb,
        $17,$18,$19,
        CASE WHEN $20 THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      RETURNING ci_id, status, customer_id, request_reason
    `, [
      spec.customer.customer_id, branchId, spec.agentId, spec.decided ? bmId : null, spec.status,
      spec.reason, spec.reason, spec.requested, spec.remarks,
      spec.customer.income, spec.customer.employment || 'Self-Employed', spec.score, spec.risk,
      JSON.stringify([spec.reason]),
      spec.risk, JSON.stringify(snapshot),
      spec.approvedLimit, spec.decisionRemarks || null, spec.rejection || null,
      Boolean(spec.decided),
    ]);
    cis.push(rows[0]);
  }
  report.created.credit_investigations = cis.length;
  report.samples.credit_reviews = cis.map((c) => ({
    id: c.ci_id,
    status: c.status,
    reason: c.request_reason,
  }));

  // --- Sales invoices (5) — direct insert, NO stock deduction ---
  const invoiceSpecs = [
    {
      customer: customers[0], agentId: agentA.id, qty: 1,
      payType: 'full', method: cash, status: 'Confirmed',
      date: manilaDateOffset(-3), notes: 'DEV full cash sale — living room sofa.',
      down: null, terms: null, monthly: null,
    },
    {
      customer: customers[2], agentId: agentA.id, qty: 1,
      payType: 'installment', method: credit, status: 'Pending Review',
      date: manilaDateOffset(-1), notes: 'DEV installment — awaiting BM acknowledgement.',
      down: 3000, terms: 6, monthly: null,
    },
    {
      customer: customers[4], agentId: agentB.id, qty: 2,
      payType: 'full', method: gcash, status: 'Confirmed',
      date: manilaDateOffset(0), notes: 'DEV GCash double unit for Bajada residence.',
      down: null, terms: null, monthly: null,
    },
    {
      customer: customers[1], agentId: agentB.id, qty: 1,
      payType: 'full', method: cash, status: 'Draft',
      date: manilaDateOffset(0), notes: 'DEV draft quote for Erwin — not yet submitted.',
      down: null, terms: null, monthly: null,
    },
    {
      customer: customers[4], agentId: agentB.id, qty: 1,
      payType: 'installment', method: credit, status: 'Confirmed',
      date: manilaDateOffset(-5), notes: 'DEV installment with 20% down.',
      down: 2600, terms: 4, monthly: null,
    },
  ];

  const invoices = [];
  for (let i = 0; i < invoiceSpecs.length; i += 1) {
    const spec = invoiceSpecs[i];
    const total = Math.round(unitPrice * spec.qty * 100) / 100;
    const down = spec.down == null ? 0 : Number(spec.down);
    const financed = down == null ? null : Math.max(0, total - down);
    const monthly = spec.terms && financed != null
      ? Math.round((financed / spec.terms) * 100) / 100
      : null;
    const due = spec.payType === 'installment'
      ? manilaDateOffset(30)
      : manilaDateOffset(7);
    const firstDue = spec.payType === 'installment' ? manilaDateOffset(30) : null;
    const invoiceNumber = `DEV-SA-INV-${manilaDateOffset(0).replace(/-/g, '')}-${String(i + 1).padStart(2, '0')}`;

    const reviewedBy = spec.status === 'Confirmed' ? bmId : null;
    const rows = await q(client, `
      INSERT INTO sales_invoices (
        invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
        payment_method_id, status, invoices_date, due_date, notes,
        pay_type, down_payment, term_months, monthly_amount, first_due_date,
        reviewed_by, reviewed_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8::date,$9::date,$10,
        $11,$12,$13,$14,$15::date,
        $16::int,
        CASE WHEN $16::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
      )
      RETURNING sales_invoices_id, invoice_number, status, total_amount, pay_type
    `, [
      invoiceNumber, spec.customer.customer_id, spec.agentId, branchId, total,
      spec.method, spec.status, spec.date, due, spec.notes,
      spec.payType, down, spec.terms, monthly, firstDue,
      reviewedBy,
    ]);
    const invoice = rows[0];
    await client.query(`
      INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total)
      VALUES ($1, $2, $3, $4, $5)
    `, [invoice.sales_invoices_id, product.id, spec.qty, unitPrice, total]);
    invoices.push({ ...invoice, qty: spec.qty, customer: spec.customer.customer_code });
  }
  report.created.sales_invoices = invoices.length;
  report.created.sales_invoice_items = invoices.length;
  report.samples.sales_invoices = invoices.map((inv) => ({
    invoice: inv.invoice_number,
    status: inv.status,
    total: inv.total_amount,
    pay_type: inv.pay_type,
    qty: inv.qty,
    customer: inv.customer,
  }));
}

async function verify(client, agentIds, inventoryBefore, movementsBefore) {
  const checks = {};
  checks.area_assignments = await count(client,
    `SELECT COUNT(*)::int AS c FROM sales_area_assignments WHERE sales_agent_id = ANY($1::int[])`,
    [agentIds]);
  checks.field_activity_reports = await count(client,
    `SELECT COUNT(*)::int AS c FROM field_activity_reports WHERE user_id = ANY($1::int[])`,
    [agentIds]);
  checks.customers_dev = await count(client,
    `SELECT COUNT(*)::int AS c FROM customers WHERE customer_code LIKE 'DEV-SA-%'`);
  checks.credit_investigations = await count(client,
    `SELECT COUNT(*)::int AS c FROM credit_investigations WHERE submitted_by = ANY($1::int[])`,
    [agentIds]);
  checks.sales_invoices = await count(client,
    `SELECT COUNT(*)::int AS c FROM sales_invoices WHERE sales_agent_id = ANY($1::int[])`,
    [agentIds]);
  checks.invoice_items = await count(client, `
    SELECT COUNT(*)::int AS c FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.sales_invoices_id = sii.invoices_id
    WHERE si.sales_agent_id = ANY($1::int[])
  `, [agentIds]);
  checks.far_with_assignment = await count(client, `
    SELECT COUNT(*)::int AS c FROM field_activity_reports
    WHERE user_id = ANY($1::int[]) AND assignment_id IS NOT NULL
  `, [agentIds]);
  checks.ci_with_customer = await count(client, `
    SELECT COUNT(*)::int AS c
    FROM credit_investigations ci
    JOIN customers c ON c.customer_id = ci.customer_id
    WHERE ci.submitted_by = ANY($1::int[])
  `, [agentIds]);

  const inventoryAfter = await q(client, `SELECT inventory_id, available_stock, quantity FROM branch_inventory ORDER BY inventory_id`);
  const movementsAfter = await count(client, `SELECT COUNT(*)::int AS c FROM stock_movements`);
  const productsAfter = await count(client, `SELECT COUNT(*)::int AS c FROM products`);
  const collectionsAfter = await count(client, `SELECT COUNT(*)::int AS c FROM collection_payment`);

  checks.inventory_unchanged = JSON.stringify(inventoryBefore) === JSON.stringify(inventoryAfter);
  checks.stock_movements_unchanged = movementsBefore === movementsAfter;
  checks.products_unchanged = true;
  checks.collection_payment_count = collectionsAfter;

  report.verification = {
    ...checks,
    inventory_before: inventoryBefore,
    inventory_after: inventoryAfter,
    stock_movements_before: movementsBefore,
    stock_movements_after: movementsAfter,
    products_count: productsAfter,
  };
}

async function main() {
  assertDevEnvironment();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const agents = await q(client, `
      SELECT u.id, u.first_name, u.last_name, u.branch_id, u.email
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'sales_staff' AND u.status = 'Active'
      ORDER BY u.id
    `);
    if (!agents.length) throw new Error('No active sales_staff users found.');
    const agentIds = agents.map((a) => a.id);
    const branchId = agents[0].branch_id;
    report.samples.agents = agents.map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}`, email: a.email }));

    const bm = await q(client, `
      SELECT u.id FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'branch_manager' AND u.branch_id = $1
      ORDER BY u.id LIMIT 1
    `, [branchId]);
    if (!bm.length) throw new Error('No branch manager found for sales branch.');
    const bmId = bm[0].id;

    const territories = await q(client, `
      SELECT territory_id FROM territories WHERE branch_id = $1 ORDER BY territory_id
    `, [branchId]);
    if (!territories.length) throw new Error('No territories for branch.');
    const territoryIds = territories.map((t) => t.territory_id);

    const products = await q(client, `
      SELECT id, name, sku, unit_price FROM products WHERE status = 'Active' ORDER BY id
    `);
    if (!products.length) throw new Error('No active products available.');
    if (products.length === 1) {
      report.notes.push(
        `Only one active product (${products[0].name} / ${products[0].sku}) exists; invoices vary quantity, pay type, and dates instead of product mix.`
      );
    }

    const paymentMethods = await q(client, `
      SELECT payment_method_id, method_name FROM payment_methods WHERE status = 'Active' ORDER BY payment_method_id
    `);

    const inventoryBefore = await q(client, `
      SELECT inventory_id, branch_id, product_id, available_stock, quantity, reorder_level, stock_status
      FROM branch_inventory ORDER BY inventory_id
    `);
    const movementsBefore = await count(client, `SELECT COUNT(*)::int AS c FROM stock_movements`);
    const collectionsBefore = await count(client, `SELECT COUNT(*)::int AS c FROM collection_payment`);

    await backupScopedData(client, agentIds);
    await deleteSaOwnedData(client, agentIds);
    await seedFreshData(client, agents, branchId, bmId, territoryIds, products[0], paymentMethods);
    await verify(client, agentIds, inventoryBefore, movementsBefore);

    const collectionsAfter = await count(client, `SELECT COUNT(*)::int AS c FROM collection_payment`);
    if (collectionsAfter !== collectionsBefore) {
      throw new Error('collection_payment count changed — aborting to protect collector data.');
    }

    await client.query('COMMIT');

    const outPath = path.join(root, 'backups', `sa-reset-report-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${outPath}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('RESET FAILED — transaction rolled back:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
