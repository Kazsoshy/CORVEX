/**
 * Idempotent seed for General Santos + Davao Oriental branches.
 * Does NOT touch Davao City operational data.
 *
 * Creates per branch (up to ~10 related records each area):
 * - Branch manager, collector, inventory staff, sales agent
 * - Territories with coverage areas
 * - Customers + activity/credit
 * - Branch inventory (aligned to central totals)
 * - Field visits, collection payments, sales invoices (sample)
 *
 * Usage: node backend/scripts/seed_secondary_branches.js
 */
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEED_PASSWORD, SEED_PASSWORD_HASH } from '../lib/seedDefaults.js';
import { alignCentralInventory, deriveStockStatus } from '../lib/branchInventoryStock.js';

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

const BRANCH_SEEDS = [
  {
    match: '%General Santos%',
    label: 'General Santos Branch',
    city: 'General Santos City',
    users: {
      branch_manager: { first: 'Miguel', last: 'Flores', email: 'miguel.f@corvex.ph' },
      collector: { first: 'Carla', last: 'Santiago', email: 'carla.santiago@corvex.ph' },
      inventory_staff: { first: 'Diego', last: 'Navarro', email: 'diego.navarro@corvex.ph' },
      sales_staff: { first: 'Robert', last: 'Lee', email: 'robert.l@corvex.ph' },
    },
    territories: [
      { name: 'Gensan Central', coverage: 'Poblacion, City Heights, Lagao' },
      { name: 'Gensan East', coverage: 'Bula, Apopong, Conel' },
      { name: 'Gensan West', coverage: 'Calumpang, Labangal, Dadiangas' },
    ],
    customers: [
      { first: 'Lorna', last: 'Mendoza', address: '456 Magsaysay Ave, General Santos City', lat: 6.1164, lon: 125.1756, balance: 22000, volume: 68000, overdue: 7 },
      { first: 'Hector', last: 'Alvarez', address: '18 Pioneer Ave, General Santos City', lat: 6.1128, lon: 125.1712, balance: 18500, volume: 42000, overdue: 12 },
      { first: 'Nina', last: 'Villar', address: '77 National Highway, General Santos City', lat: 6.1215, lon: 125.1820, balance: 9600, volume: 27500, overdue: 0 },
      { first: 'Omar', last: 'Diaz', address: '9 Bulaong Blvd, General Santos City', lat: 6.1089, lon: 125.1688, balance: 34100, volume: 81000, overdue: 21 },
      { first: 'Faye', last: 'Cortez', address: '205 City Heights, General Santos City', lat: 6.1198, lon: 125.1795, balance: 7400, volume: 19800, overdue: 3 },
      { first: 'Gino', last: 'Ramos', address: '33 Apopong Rd, General Santos City', lat: 6.1250, lon: 125.1901, balance: 15200, volume: 36000, overdue: 9 },
      { first: 'Ivy', last: 'Pascual', address: '14 Lagao Crossing, General Santos City', lat: 6.1302, lon: 125.1866, balance: 27800, volume: 54000, overdue: 16 },
      { first: 'Joel', last: 'Miranda', address: '88 Calumpang, General Santos City', lat: 6.1044, lon: 125.1620, balance: 11300, volume: 25000, overdue: 5 },
      { first: 'Kara', last: 'Yap', address: '61 Dadiangas West, General Santos City', lat: 6.1140, lon: 125.1705, balance: 19900, volume: 47000, overdue: 11 },
      { first: 'Leo', last: 'Bautista', address: '4 Conel Proper, General Santos City', lat: 6.1405, lon: 125.2010, balance: 8600, volume: 21000, overdue: 2 },
    ],
    inventoryStock: [12, 9, 7, 14, 6, 8, 11, 5, 10, 4],
  },
  {
    match: '%Davao Oriental%',
    label: 'Davao Oriental Branch',
    city: 'Mati City',
    users: {
      branch_manager: { first: 'Grace', last: 'Tan', email: 'grace.t@corvex.ph' },
      collector: { first: 'Noel', last: 'Cabrera', email: 'noel.cabrera@corvex.ph' },
      inventory_staff: { first: 'Ana', last: 'Reyes', email: 'ana.r@corvex.ph' },
      sales_staff: { first: 'Patricia', last: 'Cruz', email: 'patricia.c@corvex.ph' },
    },
    territories: [
      { name: 'Mati Central', coverage: 'Central, Madang, Safa' },
      { name: 'Mati Coastal', coverage: 'Dahican, Mayo, Badas' },
      { name: 'Mati Upland', coverage: 'Don Enrique Lopez, Culian, Tagabakid' },
    ],
    customers: [
      { first: 'Marites', last: 'Ocampo', address: '12 Dahican Road, Mati City', lat: 6.9564, lon: 126.2219, balance: 16400, volume: 39000, overdue: 8 },
      { first: 'Benito', last: 'Salazar', address: '45 Rizal St, Mati City', lat: 6.9520, lon: 126.2155, balance: 23800, volume: 56000, overdue: 15 },
      { first: 'Celia', last: 'Torres', address: '8 Mayo Proper, Mati City', lat: 6.9610, lon: 126.2288, balance: 7200, volume: 18000, overdue: 0 },
      { first: 'Dante', last: 'Guevarra', address: '19 Central Market, Mati City', lat: 6.9548, lon: 126.2180, balance: 30500, volume: 72000, overdue: 24 },
      { first: 'Elena', last: 'Padilla', address: '66 Badas Rd, Mati City', lat: 6.9488, lon: 126.2102, balance: 9800, volume: 24500, overdue: 4 },
      { first: 'Felix', last: 'Morales', address: '3 Tagabakid, Mati City', lat: 6.9705, lon: 126.2350, balance: 14100, volume: 33000, overdue: 10 },
      { first: 'Gina', last: 'Esperanza', address: '27 Madang Village, Mati City', lat: 6.9588, lon: 126.2244, balance: 21200, volume: 48000, overdue: 13 },
      { first: 'Hugo', last: 'Santillan', address: '91 Culian Rd, Mati City', lat: 6.9655, lon: 126.2401, balance: 6700, volume: 16000, overdue: 1 },
      { first: 'Irene', last: 'Valdez', address: '15 Don Enrique Lopez, Mati City', lat: 6.9730, lon: 126.2488, balance: 18900, volume: 41000, overdue: 6 },
      { first: 'Jonas', last: 'Mercado', address: '52 Safa District, Mati City', lat: 6.9502, lon: 126.2128, balance: 12600, volume: 29000, overdue: 9 },
    ],
    inventoryStock: [9, 6, 11, 8, 5, 7, 10, 4, 12, 3],
  },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function ensureRole(client, slug) {
  const res = await client.query(`SELECT role_id FROM roles WHERE slug = $1`, [slug]);
  if (!res.rows[0]) throw new Error(`Missing role: ${slug}`);
  return res.rows[0].role_id;
}

async function ensureUser(client, { branchId, roleId, first, last, email }) {
  const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
       SET branch_id = $1,
           role_id = $2,
           first_name = $3,
           last_name = $4,
           password_hash = $5,
           status = 'Active',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [branchId, roleId, first, last, SEED_PASSWORD_HASH, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  // Support schemas that still expose password instead of password_hash
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' AND column_name IN ('password_hash', 'password')`
  );
  const names = new Set(cols.rows.map((r) => r.column_name));
  if (names.has('password_hash')) {
    const inserted = await client.query(
      `INSERT INTO users (branch_id, first_name, last_name, role_id, email, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active')
       RETURNING id`,
      [branchId, first, last, roleId, email, SEED_PASSWORD_HASH]
    );
    return inserted.rows[0].id;
  }
  const inserted = await client.query(
    `INSERT INTO users (branch_id, first_name, last_name, role_id, email, password, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'Active')
     RETURNING id`,
    [branchId, first, last, roleId, email, SEED_PASSWORD_HASH]
  );
  return inserted.rows[0].id;
}

async function ensureTerritory(client, { branchId, name, coverage, assignedUserId }) {
  const existing = await client.query(
    `SELECT territory_id FROM territories WHERE branch_id = $1 AND territory_name = $2`,
    [branchId, name]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE territories
       SET coverage_area = $1, assigned_user = $2
       WHERE territory_id = $3`,
      [coverage, assignedUserId, existing.rows[0].territory_id]
    );
    return existing.rows[0].territory_id;
  }
  const inserted = await client.query(
    `INSERT INTO territories (territory_name, branch_id, assigned_user, coverage_area)
     VALUES ($1, $2, $3, $4)
     RETURNING territory_id`,
    [name, branchId, assignedUserId, coverage]
  );
  return inserted.rows[0].territory_id;
}

async function ensureCustomer(client, {
  branchId,
  territoryId,
  salesAgentId,
  first,
  last,
  address,
  lat,
  lon,
  balance,
  volume,
  overdue,
  phoneSuffix,
}) {
  const phone = `+63 9${String(100000000 + phoneSuffix).slice(0, 9)}`;
  let customerId;
  const existing = await client.query(
    `SELECT customer_id FROM customers
     WHERE branch_id = $1 AND first_name = $2 AND last_name = $3
     LIMIT 1`,
    [branchId, first, last]
  );
  if (existing.rows[0]) {
    customerId = existing.rows[0].customer_id;
    await client.query(
      `UPDATE customers
       SET address = $1,
           latitude = $2,
           longitude = $3,
           contact_phone = $4,
           contact_person_fname = $5,
           contact_person_lname = $6,
           contact_person_phone = $4,
           territory_id = $7,
           assigned_sales_agent_id = $8,
           status = 'Active'
       WHERE customer_id = $9`,
      [address, lat, lon, phone, first, last, territoryId, salesAgentId, customerId]
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO customers (
         branch_id, first_name, last_name, address, latitude, longitude,
         contact_phone, contact_person_fname, contact_person_lname, contact_person_phone,
         territory_id, assigned_sales_agent_id, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$7,$10,$11,'Active')
       RETURNING customer_id`,
      [branchId, first, last, address, lat, lon, phone, first, last, territoryId, salesAgentId]
    );
    customerId = inserted.rows[0].customer_id;
  }

  await client.query(
    `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date, last_sales_visit)
     VALUES ($1, $2, $3, $4::date, $5::date)
     ON CONFLICT (customer_id) DO UPDATE
       SET outstanding_balance = EXCLUDED.outstanding_balance,
           purchase_volume = EXCLUDED.purchase_volume,
           last_collection_date = EXCLUDED.last_collection_date,
           last_sales_visit = EXCLUDED.last_sales_visit,
           updated_at = CURRENT_TIMESTAMP`,
    [customerId, balance, volume, daysAgo(Math.max(1, overdue || 1)), daysAgo(3)]
  );

  const om = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE r.slug = 'operating_manager' LIMIT 1`
  );
  await client.query(
    `INSERT INTO customer_credit_info (customer_id, credit_limit, monthly_income, credit_score, approved_by, approved_date)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
     ON CONFLICT (customer_id) DO UPDATE
       SET credit_limit = EXCLUDED.credit_limit,
           monthly_income = EXCLUDED.monthly_income,
           credit_score = EXCLUDED.credit_score,
           approved_by = EXCLUDED.approved_by,
           approved_date = EXCLUDED.approved_date,
           updated_at = CURRENT_TIMESTAMP`,
    [customerId, Math.max(balance * 2, 50000), 25000 + (phoneSuffix % 5) * 3000, 700 + (phoneSuffix % 10) * 5, om.rows[0]?.id || null]
  );

  return customerId;
}

async function seedBranchInventory(client, branchId, stockPattern) {
  const products = await client.query(
    `SELECT id FROM products WHERE COALESCE(status, 'Active') = 'Active' ORDER BY id LIMIT 10`
  );
  for (let i = 0; i < products.rows.length; i += 1) {
    const productId = products.rows[i].id;
    const stock = stockPattern[i % stockPattern.length];
    const reorder = 3;
    const status = deriveStockStatus(stock, reorder);
    await client.query(
      `INSERT INTO branch_inventory (
         branch_id, product_id, available_stock, quantity, reorder_level, status, stock_status, last_updated
       ) VALUES ($1, $2, $3, $3, $4, $5, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (branch_id, product_id) DO UPDATE
         SET available_stock = EXCLUDED.available_stock,
             quantity = EXCLUDED.quantity,
             reorder_level = EXCLUDED.reorder_level,
             status = EXCLUDED.status,
             stock_status = EXCLUDED.stock_status,
             last_updated = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP`,
      [branchId, productId, stock, reorder, status]
    );
    await alignCentralInventory(client, productId);
  }
  return products.rows.length;
}

async function seedOperationalSamples(client, {
  branchId,
  salesAgentId,
  collectorId,
  customerIds,
  products,
}) {
  const cash = await client.query(
    `SELECT payment_method_id FROM payment_methods WHERE method_name = 'Cash' LIMIT 1`
  );
  const paymentMethodId = cash.rows[0]?.payment_method_id || 1;

  // Field visits (sales + collection) — up to 10
  for (let i = 0; i < Math.min(10, customerIds.length); i += 1) {
    const customerId = customerIds[i];
    const visitType = i % 2 === 0 ? 'Sales' : 'Collection';
    const agentId = visitType === 'Sales' ? salesAgentId : collectorId;
    const visitDate = daysAgo(i + 1);
    const exists = await client.query(
      `SELECT visit_id FROM field_visits
       WHERE customer_id = $1 AND user_id = $2 AND scheduled_date = $3::date
       LIMIT 1`,
      [customerId, agentId, visitDate]
    );
    if (exists.rows[0]) continue;
    await client.query(
      `INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status)
       VALUES ($1, $2, $3, $4::date, 'Completed')`,
      [customerId, agentId, visitType, visitDate]
    );
  }

  // Collection payments — up to 8
  for (let i = 0; i < Math.min(8, customerIds.length); i += 1) {
    const customerId = customerIds[i];
    const amount = 1500 + i * 350;
    const payDate = daysAgo(i + 2);
    const ref = `SEED-CP-${branchId}-${customerId}-${i + 1}`;
    const exists = await client.query(
      `SELECT collectionpayment_id FROM collection_payment
       WHERE receipt_number = $1
       LIMIT 1`,
      [ref]
    );
    if (exists.rows[0]) continue;

    await client.query(
      `INSERT INTO collection_payment (
         receipt_number, customer_id, collector_id, branch_id, amount, payment_method_id, payment_date, payment_time, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, TIME '10:00:00', 'Completed')`,
      [ref, customerId, collectorId, branchId, amount, paymentMethodId, payDate]
    );
  }

  // Sales invoices — up to 6
  for (let i = 0; i < Math.min(6, customerIds.length); i += 1) {
    const customerId = customerIds[i];
    const productId = products[i % products.length];
    const qty = 1 + (i % 3);
    const priceRes = await client.query(`SELECT unit_price FROM products WHERE id = $1`, [productId]);
    const unitPrice = Number(priceRes.rows[0]?.unit_price || 5000);
    const total = unitPrice * qty;
    const invDate = daysAgo(i + 1);
    const invoiceNo = `SEED-INV-${branchId}-${customerId}-${i + 1}`;
    const exists = await client.query(
      `SELECT sales_invoices_id FROM sales_invoices WHERE invoice_number = $1 LIMIT 1`,
      [invoiceNo]
    );
    if (exists.rows[0]) continue;

    const dueDate = daysAgo(Math.max(0, i - 3)); // some overdue, some current
    const inserted = await client.query(
      `INSERT INTO sales_invoices (
         invoice_number, customer_id, sales_agent_id, branch_id, total_amount, payment_method_id, invoices_date, due_date, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, 'Confirmed')
       RETURNING sales_invoices_id`,
      [invoiceNo, customerId, salesAgentId, branchId, total, paymentMethodId, invDate, dueDate]
    );
    const invoiceId = inserted.rows[0]?.sales_invoices_id;
    if (!invoiceId) continue;

    const itemExists = await client.query(
      `SELECT 1 FROM sales_invoice_items WHERE invoices_id = $1 AND product_id = $2 LIMIT 1`,
      [invoiceId, productId]
    );
    if (!itemExists.rows.length) {
      await client.query(
        `INSERT INTO sales_invoice_items (invoices_id, product_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoiceId, productId, qty, unitPrice, total]
      );
    }
  }
}

async function seedOneBranch(client, seed) {
  const branchRes = await client.query(
    `SELECT id, name FROM branches WHERE name ILIKE $1 LIMIT 1`,
    [seed.match]
  );
  const branch = branchRes.rows[0];
  if (!branch) {
    console.warn(`⚠ Branch not found for ${seed.label} — skipped.`);
    return null;
  }

  console.log(`\n→ Seeding ${branch.name} (id=${branch.id})`);

  const roleIds = {
    branch_manager: await ensureRole(client, 'branch_manager'),
    collector: await ensureRole(client, 'collector'),
    inventory_staff: await ensureRole(client, 'inventory_staff'),
    sales_staff: await ensureRole(client, 'sales_staff'),
  };

  const userIds = {};
  for (const [slug, profile] of Object.entries(seed.users)) {
    userIds[slug] = await ensureUser(client, {
      branchId: branch.id,
      roleId: roleIds[slug],
      ...profile,
    });
    console.log(`  user ${slug}: ${profile.email}`);
  }

  // Point branch manager_id when column exists
  await client.query(
    `UPDATE branches SET manager_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [userIds.branch_manager, branch.id]
  ).catch(() => {});

  const territoryIds = [];
  for (let i = 0; i < seed.territories.length; i += 1) {
    const t = seed.territories[i];
    const assigned = i === 0 ? userIds.collector : (i === 1 ? userIds.sales_staff : userIds.branch_manager);
    const tid = await ensureTerritory(client, {
      branchId: branch.id,
      name: t.name,
      coverage: t.coverage,
      assignedUserId: assigned,
    });
    territoryIds.push(tid);
    console.log(`  territory: ${t.name}`);
  }

  const customerIds = [];
  for (let i = 0; i < seed.customers.length; i += 1) {
    const c = seed.customers[i];
    const customerId = await ensureCustomer(client, {
      branchId: branch.id,
      territoryId: territoryIds[i % territoryIds.length],
      salesAgentId: userIds.sales_staff,
      phoneSuffix: branch.id * 100 + i + 1,
      ...c,
    });
    customerIds.push(customerId);
  }
  console.log(`  customers: ${customerIds.length}`);

  const skuCount = await seedBranchInventory(client, branch.id, seed.inventoryStock);
  console.log(`  inventory SKUs: ${skuCount}`);

  const products = (await client.query(
    `SELECT id FROM products WHERE COALESCE(status, 'Active') = 'Active' ORDER BY id LIMIT 10`
  )).rows.map((r) => r.id);

  await seedOperationalSamples(client, {
    branchId: branch.id,
    salesAgentId: userIds.sales_staff,
    collectorId: userIds.collector,
    customerIds,
    products,
  });
  console.log('  visits / collections / invoices seeded');

  return {
    branchId: branch.id,
    branchName: branch.name,
    users: Object.fromEntries(
      Object.entries(seed.users).map(([slug, profile]) => [slug, profile.email])
    ),
    territories: seed.territories.length,
    customers: customerIds.length,
  };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summaries = [];
    for (const seed of BRANCH_SEEDS) {
      const summary = await seedOneBranch(client, seed);
      if (summary) summaries.push(summary);
    }
    await client.query('COMMIT');

    console.log('\n✅ Secondary branch seed complete.');
    console.log(`Password for all seeded staff: ${SEED_PASSWORD}`);
    for (const s of summaries) {
      console.log(`\n${s.branchName}`);
      console.log(`  manager:   ${s.users.branch_manager}`);
      console.log(`  collector: ${s.users.collector}`);
      console.log(`  warehouse: ${s.users.inventory_staff}`);
      console.log(`  sales:     ${s.users.sales_staff}`);
      console.log(`  territories=${s.territories} customers=${s.customers}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
