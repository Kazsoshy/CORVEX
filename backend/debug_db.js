import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

async function testQuery(name, sql, params = []) {
  try {
    await pool.query(sql, params);
    console.log(`OK: ${name}`);
  } catch (err) {
    console.log(`FAIL: ${name} -> ${err.message}`);
  }
}

const tables = ['users', 'customers', 'field_visits', 'collection_payment', 'sales_invoices', 'branch_inventory', 'territories'];
for (const t of tables) {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [t]
  );
  console.log(`\n${t}: ${r.rows.map((x) => x.column_name).join(', ')}`);
}

const user = await pool.query(`SELECT u.id, u.status, u.branch_id, r.slug AS role_slug FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.status = 'Active' LIMIT 1`);
console.log('\nSample user:', user.rows[0]);

if (user.rows[0]) {
  const uid = user.rows[0].id;
  await testQuery('staff base', `SELECT u.id, u.first_name, u.last_name, u.email, r.slug AS role_slug FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.status = 'Active' AND r.slug IN ('collector', 'sales_staff') LIMIT 5`);
  await testQuery('field_visits', `SELECT COUNT(*) FROM field_visits WHERE user_id = $1`, [uid]);
  await testQuery('collection_payment', `SELECT COALESCE(SUM(amount), 0) FROM collection_payment WHERE collector_id = $1`, [uid]);
  await testQuery('sales_invoices', `SELECT COUNT(*) FROM sales_invoices WHERE sales_agent_id = $1`, [uid]);
}

await testQuery('customers join', `SELECT c.customer_id, c.first_name, ca.outstanding_balance FROM customers c LEFT JOIN customer_activity ca ON c.customer_id = ca.customer_id LIMIT 1`);
await testQuery('territories', `SELECT territory_id, territory_name, branch_id FROM territories LIMIT 1`);

await testQuery('territories join', `SELECT t.territory_id, b.name AS branch_name, u.full_name FROM territories t LEFT JOIN branches b ON b.id = t.branch_id LEFT JOIN users u ON u.id = t.assigned_user LIMIT 1`);

await testQuery('customers full', `SELECT c.customer_id, b.name AS branch_name, mgr.full_name AS account_manager_name, ca.outstanding_balance FROM customers c JOIN branches b ON b.id = c.branch_id LEFT JOIN customer_activity ca ON c.customer_id = ca.customer_id LEFT JOIN users mgr ON mgr.id = c.account_manager_id LIMIT 1`);

await testQuery('inventory report', `SELECT CASE WHEN available_stock <= 0 THEN 'Out of Stock' WHEN available_stock <= reorder_level THEN 'Low Stock' ELSE 'Sufficient' END AS stock_status, COUNT(*) AS count FROM branch_inventory GROUP BY 1`);

await testQuery('collection report', `SELECT TO_CHAR(payment_date, 'Dy') AS day, COALESCE(SUM(amount), 0) AS amount FROM collection_payment WHERE payment_date >= (CURRENT_TIMESTAMP AT TIME ZONE '+08')::DATE - INTERVAL '7 days' GROUP BY TO_CHAR(payment_date, 'Dy'), payment_date ORDER BY MIN(payment_date)`);

const branches = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'branches' ORDER BY ordinal_position`);
console.log('\nbranches:', branches.rows.map((x) => x.column_name).join(', '));

const ca = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'customer_activity' ORDER BY ordinal_position`);
console.log('customer_activity:', ca.rows.map((x) => x.column_name).join(', '));

const bm = await pool.query(`SELECT u.id, u.email, u.branch_id, r.slug FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.slug = 'branch_manager' ORDER BY u.id`);
console.log('\nBranch managers:', bm.rows);

const offlineEmails = [
  'marcus.santos@corvex.ph', 'corazon.v@corvex.ph', 'elena.mercado@corvex.ph',
  'roberto.villanueva@corvex.ph', 'miguel.f@corvex.ph', 'grace.t@corvex.ph',
  'ana.r@corvex.ph', 'florencia.r@corvex.ph', 'carlos.m@corvex.ph',
  'jane.s@corvex.ph', 'maria.dc@corvex.ph', 'luntiang.tahanan@email.com',
];
const ids = await pool.query(
  `SELECT u.id, u.email, r.slug FROM users u JOIN roles r ON r.role_id = u.role_id WHERE lower(u.email) = ANY($1::text[]) ORDER BY u.id`,
  [offlineEmails.map((e) => e.toLowerCase())]
);
console.log('\nOffline account DB ids:', ids.rows);
const all = await pool.query(`SELECT u.id, u.email, r.slug FROM users u JOIN roles r ON r.role_id = u.role_id ORDER BY u.id`);
console.log('\nAll users count:', all.rows.length);
console.log(all.rows.map((u) => `${u.id}:${u.email}`).join('\n'));

await pool.end();
