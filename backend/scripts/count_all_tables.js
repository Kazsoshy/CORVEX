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

const tables = await pool.query(`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`);
console.log('TABLES:', tables.rows.map((r) => r.tablename).join(', '));
console.log('---COUNTS---');
const counts = {};
for (const { tablename } of tables.rows) {
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM "${tablename}"`);
  counts[tablename] = c.rows[0].n;
  console.log(`${tablename}: ${c.rows[0].n}`);
}

// Also dump columns for key tables
const keyTables = [
  'users', 'branches', 'products', 'customers', 'territories', 'branch_inventory',
  'sales_invoices', 'collection_payment', 'stock_movements', 'notifications',
  'purchase_requests', 'purchase_request_items', 'credit_investigations',
  'special_collection_requests', 'operational_alerts', 'territory_assignments',
  'customer_portal_invitations', 'saw_results', 'system_settings', 'system_backups',
  'central_inventory', 'notification_dedup', 'permissions', 'roles', 'role_permissions',
  'payment_methods', 'product_categories', 'suppliers',
];
for (const t of keyTables) {
  try {
    const r = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [t]
    );
    if (r.rows.length) {
      console.log(`\nCOLS ${t}: ${r.rows.map((x) => x.column_name).join(', ')}`);
    }
  } catch {
    /* skip */
  }
}

await pool.end();
