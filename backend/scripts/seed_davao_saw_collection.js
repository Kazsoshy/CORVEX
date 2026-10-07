/**
 * Idempotent seed: Davao City SAW-eligible collection customers + collector portfolios.
 * Fixes the "only 3 customers" issue (collectors with portfolio history are scoped to linked accounts).
 *
 * Usage: npm run seed:saw-davao
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { manilaDateString } from '../lib/sawCollection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;

if (!process.env.DB_PASSWORD) {
  console.error('DB_PASSWORD is not set. Add it to .env and retry.');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

/** Business-style Davao accounts aligned with collector mock data */
const SAW_CUSTOMERS = [
  { first: 'Luntiang', last: 'Tahanan', address: '42 Ilustre Ave, Davao City', lat: 7.0782, lon: 125.6185, balance: 48500, daysOverdue: 14 },
  { first: 'Casa', last: 'Moderna', address: '18 JP Laurel Ave, Davao City', lat: 7.0855, lon: 125.6055, balance: 22000, daysOverdue: 9 },
  { first: 'Hardin', last: 'Bahay', address: '7 Quirino Ave, Davao City', lat: 7.0698, lon: 125.6142, balance: 15800, daysOverdue: 6 },
  { first: 'Soledad', last: 'Gallery', address: '55 MacArthur Highway, Davao City', lat: 7.0910, lon: 125.6200, balance: 9200, daysOverdue: 0 },
  { first: 'Dreamspace', last: 'Living', address: '91 Sandawa Rd, Davao City', lat: 7.0765, lon: 125.6095, balance: 6500, daysOverdue: 0 },
  { first: 'Mabuhay', last: 'Sala', address: '33 R. Castillo St, Davao City', lat: 7.0625, lon: 125.6255, balance: 38000, daysOverdue: 28 },
  { first: 'Danny', last: 'Cabrera', address: '45 C.M. Recto Ave, Davao City', lat: 7.0815, lon: 125.6080, balance: 31200, daysOverdue: 18 },
  { first: 'Rosa', last: 'Imperial', address: '123 Rizal Street, Davao City', lat: 7.0745, lon: 125.6168, balance: 27500, daysOverdue: 12 },
  { first: 'Teresa', last: 'Ong', address: '78 San Pedro St, Davao City', lat: 7.0705, lon: 125.6105, balance: 19400, daysOverdue: 21 },
  { first: 'Rafael', last: 'Lim', address: '15 Bonifacio St, Davao City', lat: 7.0770, lon: 125.6115, balance: 15000, daysOverdue: 8 },
  { first: 'Marco', last: 'Velasco', address: '210 Bangkal, Davao City', lat: 7.0555, lon: 125.6020, balance: 44200, daysOverdue: 35 },
  { first: 'Helena', last: 'Quizon', address: '9 Matina Crossing, Davao City', lat: 7.0485, lon: 125.6280, balance: 12800, daysOverdue: 4 },
  { first: 'Jasper', last: 'Mendez', address: '67 Toril Proper, Davao City', lat: 7.0185, lon: 125.5055, balance: 35600, daysOverdue: 16 },
  { first: 'Analyn', last: 'Fabro', address: '14 Buhangin Rd, Davao City', lat: 7.0985, lon: 125.6320, balance: 8900, daysOverdue: 2 },
  { first: 'Renato', last: 'Santos', address: '502 Lanang, Davao City', lat: 7.1025, lon: 125.6410, balance: 52100, daysOverdue: 42 },
];

function dueDateFromOverdue(asOf, daysOverdue) {
  const d = new Date(`${asOf}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysOverdue);
  return d.toISOString().slice(0, 10);
}

async function resolveContext(client) {
  const branchRes = await client.query(
    `SELECT id, latitude::float AS lat, longitude::float AS lon
     FROM branches WHERE name ILIKE '%Davao City%' LIMIT 1`
  );
  const branch = branchRes.rows[0];
  if (!branch) throw new Error('Davao City branch not found.');

  const salesRes = await client.query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE r.slug = 'sales_staff' AND u.branch_id = $1 AND u.status = 'Active'
     ORDER BY u.id LIMIT 1`,
    [branch.id]
  );
  const salesAgentId = salesRes.rows[0]?.id;
  if (!salesAgentId) throw new Error('No active sales agent on Davao City branch.');

  const pmRes = await client.query(
    `SELECT payment_method_id FROM payment_methods WHERE method_name = 'Cash' LIMIT 1`
  );
  const paymentMethodId = pmRes.rows[0]?.payment_method_id ?? 1;

  const collectorsRes = await client.query(
    `SELECT u.id, u.email FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE r.slug = 'collector' AND u.branch_id = $1 AND u.status = 'Active'
     ORDER BY u.id`,
    [branch.id]
  );

  return {
    branchId: branch.id,
    branchLat: branch.lat,
    branchLon: branch.lon,
    salesAgentId,
    paymentMethodId,
    collectors: collectorsRes.rows,
  };
}

async function ensureCustomer(client, ctx, spec, asOf) {
  const existing = await client.query(
    `SELECT customer_id FROM customers
     WHERE branch_id = $1 AND first_name = $2 AND last_name = $3 LIMIT 1`,
    [ctx.branchId, spec.first, spec.last]
  );

  let customerId = existing.rows[0]?.customer_id;
  if (!customerId) {
    const ins = await client.query(
      `INSERT INTO customers (
         branch_id, first_name, last_name, address, latitude, longitude,
         contact_phone, contact_person_fname, contact_person_lname, contact_person_phone, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$2,$3,$7,'Active')
       RETURNING customer_id`,
      [
        ctx.branchId,
        spec.first,
        spec.last,
        spec.address,
        spec.lat,
        spec.lon,
        '+63 917 000 0000',
      ]
    );
    customerId = ins.rows[0].customer_id;
  } else {
    await client.query(
      `UPDATE customers SET
         address = $2, latitude = $3, longitude = $4, status = 'Active'
       WHERE customer_id = $1`,
      [customerId, spec.address, spec.lat, spec.lon]
    );
  }

  await client.query(
    `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (customer_id) DO UPDATE SET
       outstanding_balance = EXCLUDED.outstanding_balance,
       updated_at = CURRENT_TIMESTAMP`,
    [customerId, spec.balance, spec.balance * 2.5]
  );

  const invoiceNumber = `INV-SAW-${spec.first}-${spec.last}`.replace(/\s+/g, '-').toUpperCase();
  const dueDate = dueDateFromOverdue(asOf, spec.daysOverdue);

  const invExisting = await client.query(
    `SELECT sales_invoices_id, total_amount FROM sales_invoices WHERE invoice_number = $1`,
    [invoiceNumber]
  );

  let invoiceId;
  let totalAmount = spec.balance + (spec.daysOverdue > 0 ? 5000 : 0);
  if (!invExisting.rows.length) {
    const inv = await client.query(
      `INSERT INTO sales_invoices (
         invoice_number, customer_id, sales_agent_id, branch_id, total_amount,
         payment_method_id, status, invoices_date, due_date, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,'Confirmed', $7::date, $8::date, $9)
       RETURNING sales_invoices_id, total_amount`,
      [
        invoiceNumber,
        customerId,
        ctx.salesAgentId,
        ctx.branchId,
        totalAmount,
        ctx.paymentMethodId,
        dueDateFromOverdue(asOf, spec.daysOverdue + 30),
        dueDate,
        'SAW collection demo invoice',
      ]
    );
    invoiceId = inv.rows[0].sales_invoices_id;
    totalAmount = Number(inv.rows[0].total_amount);
  } else {
    invoiceId = invExisting.rows[0].sales_invoices_id;
    totalAmount = Number(invExisting.rows[0].total_amount);
    await client.query(
      `UPDATE sales_invoices SET due_date = $2, status = 'Confirmed', branch_id = $3
       WHERE sales_invoices_id = $1`,
      [invoiceId, dueDate, ctx.branchId]
    );
  }

  const paidRes = await client.query(
    `SELECT COALESCE(SUM(payment_amount), 0)::float AS paid
     FROM credit_history WHERE sales_id = $1`,
    [invoiceId]
  );
  const paid = Number(paidRes.rows[0]?.paid) || 0;
  const targetPaid = spec.daysOverdue === 0 && spec.balance < totalAmount
    ? Math.max(0, totalAmount - spec.balance)
    : paid;

  if (targetPaid > paid && targetPaid < totalAmount) {
    await client.query(
      `INSERT INTO credit_history (
         customer_id, sales_id, previous_balance, payment_amount, remaining_balance,
         payment_status, transaction_date
       ) VALUES ($1,$2,$3,$4,$5,'Partial', $6::date)`,
      [
        customerId,
        invoiceId,
        totalAmount,
        targetPaid - paid,
        totalAmount - targetPaid,
        dueDateFromOverdue(asOf, 5),
      ]
    );
  }

  return customerId;
}

async function ensurePortfolioLink(client, ctx, collectorId, customerId, seq) {
  const receipt = `RCP-SAW-${collectorId}-${customerId}-${seq}`;
  const exists = await client.query(
    `SELECT 1 FROM collection_payment WHERE receipt_number = $1`,
    [receipt]
  );
  if (exists.rows.length) return;

  await client.query(
    `INSERT INTO collection_payment (
       receipt_number, customer_id, collector_id, branch_id, amount,
       payment_method_id, payment_date, payment_time, status, notes
     ) VALUES ($1,$2,$3,$4,500,$5,$6::date,'10:00:00','Completed','SAW demo portfolio link')`,
    [
      receipt,
      customerId,
      collectorId,
      ctx.branchId,
      ctx.paymentMethodId,
      dueDateFromOverdue(manilaDateString(), 90),
    ]
  );
}

async function ensureTodayAssignments(client, collectorId, customerIds, scheduledDate) {
  for (const customerId of customerIds) {
    const exists = await client.query(
      `SELECT visit_id FROM field_visits
       WHERE user_id = $1 AND customer_id = $2 AND visit_type = 'Collection'
         AND scheduled_date = $3::date AND status IN ('Pending','Completed')`,
      [collectorId, customerId, scheduledDate]
    );
    if (exists.rows.length) continue;

    await client.query(
      `INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status)
       VALUES ($1,$2,'Collection',$3::date,'Pending')`,
      [customerId, collectorId, scheduledDate]
    );
  }
}

async function nudgeBranchCoincidentCoords(client, ctx) {
  await client.query(
    `UPDATE customers c SET
       latitude = b.latitude::float + (0.001 + (c.customer_id % 7) * 0.0007),
       longitude = b.longitude::float + (0.001 + (c.customer_id % 5) * 0.0009)
     FROM branches b
     WHERE c.branch_id = b.id
       AND c.branch_id = $1
       AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
       AND ABS(c.latitude::float - b.latitude::float) < 0.00001
       AND ABS(c.longitude::float - b.longitude::float) < 0.00001`,
    [ctx.branchId]
  );
}

export async function seedDavaoSawCollection(dbPool = pool) {
  const asOf = manilaDateString();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const ctx = await resolveContext(client);
    await nudgeBranchCoincidentCoords(client, ctx);

    const customerIds = [];
    for (const spec of SAW_CUSTOMERS) {
      const id = await ensureCustomer(client, ctx, spec, asOf);
      customerIds.push(id);
    }

    let linkSeq = 0;
    for (const collector of ctx.collectors) {
      for (const customerId of customerIds) {
        linkSeq += 1;
        await ensurePortfolioLink(client, ctx, collector.id, customerId, linkSeq);
      }
    }

    const primaryCollector =
      ctx.collectors.find((c) => c.email === 'maria.dc@corvex.ph') || ctx.collectors[0];
    if (primaryCollector) {
      const topFive = customerIds.slice(0, 5);
      await ensureTodayAssignments(client, primaryCollector.id, topFive, asOf);
    }

    await client.query('COMMIT');
    const summary = {
      customers: customerIds.length,
      collectors: ctx.collectors.length,
      scheduledDate: asOf,
      primaryCollector: primaryCollector?.email ?? null,
    };
    console.log(
      `Davao SAW seed OK: ${summary.customers} customers, ${summary.collectors} collector(s), ` +
        `today=${summary.scheduledDate}, primary collector ${summary.primaryCollector} assigned top 5.`
    );
    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await seedDavaoSawCollection(pool);
  } catch (err) {
    console.error('seed_davao_saw_collection failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1]?.includes('seed_davao_saw_collection');
if (isDirectRun) {
  main();
}
