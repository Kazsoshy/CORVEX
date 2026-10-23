import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

const checks = [
  ['orphan customers.branch_id', `SELECT COUNT(*)::int n FROM customers c LEFT JOIN branches b ON b.id=c.branch_id WHERE b.id IS NULL`],
  ['orphan users.role_id', `SELECT COUNT(*)::int n FROM users u LEFT JOIN roles r ON r.role_id=u.role_id WHERE r.role_id IS NULL`],
  ['orphan products.category_id', `SELECT COUNT(*)::int n FROM products p LEFT JOIN product_categories c ON c.category_id=p.category_id WHERE c.category_id IS NULL`],
  ['orphan branch_inventory', `SELECT COUNT(*)::int n FROM branch_inventory bi LEFT JOIN products p ON p.id=bi.product_id LEFT JOIN branches b ON b.id=bi.branch_id WHERE p.id IS NULL OR b.id IS NULL`],
  ['orphan purchase_request_items', `SELECT COUNT(*)::int n FROM purchase_request_items i LEFT JOIN purchase_requests r ON r.request_id=i.request_id WHERE r.request_id IS NULL`],
  ['orphan territory_assignments', `SELECT COUNT(*)::int n FROM territory_assignments ta LEFT JOIN territories t ON t.territory_id=ta.territory_id LEFT JOIN users u ON u.id=ta.user_id WHERE t.territory_id IS NULL OR u.id IS NULL`],
  ['orphan customer_user_links', `SELECT COUNT(*)::int n FROM customer_user_links l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN customers c ON c.customer_id=l.customer_id WHERE u.id IS NULL OR c.customer_id IS NULL`],
  ['duplicate branch_inventory pairs', `SELECT COUNT(*)::int n FROM (SELECT branch_id, product_id FROM branch_inventory GROUP BY 1,2 HAVING COUNT(*)>1) x`],
  ['customer_activity 1:1', `SELECT COUNT(*)::int n FROM customer_activity a LEFT JOIN customers c ON c.customer_id=a.customer_id WHERE c.customer_id IS NULL`],
  ['customer_credit_info 1:1', `SELECT COUNT(*)::int n FROM customer_credit_info a LEFT JOIN customers c ON c.customer_id=a.customer_id WHERE c.customer_id IS NULL`],
];

let failed = 0;
for (const [name, sql] of checks) {
  const r = await pool.query(sql);
  const n = r.rows[0].n;
  const ok = n === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${n}`);
}

const tables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
console.log('\nFinal counts:');
for (const { tablename } of tables.rows) {
  const c = await pool.query(`SELECT COUNT(*)::int n FROM "${tablename}"`);
  const mark = c.rows[0].n >= 50 ? '✓' : '·';
  console.log(`${mark} ${tablename}: ${c.rows[0].n}`);
}

await pool.end();
process.exit(failed ? 1 : 0);
