import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pkg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

async function col(table) {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((x) => x.column_name);
}

try {
  console.log('DB:', process.env.DB_NAME, 'user:', process.env.DB_USER);
  console.log('products:', (await col('products')).join(', '));
  console.log('branch_inventory:', (await col('branch_inventory')).join(', '));
  console.log('product_categories:', (await col('product_categories')).join(', '));

  const query = `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.category_id,
      pc.category_name,
      p.unit_price,
      p.status,
      COALESCE(SUM(i.quantity), 0) AS total_quantity,
      CASE
        WHEN COALESCE(SUM(i.quantity), 0) = 0 THEN 'Out of Stock'
        WHEN COALESCE(SUM(i.quantity), 0) <= 10 THEN 'Low Stock'
        ELSE 'Sufficient'
      END AS stock_status
    FROM products p
    LEFT JOIN product_categories pc ON pc.category_id = p.category_id
    LEFT JOIN branch_inventory i ON i.product_id = p.id
    WHERE p.status = 'Active'
    GROUP BY p.id, p.category_id, pc.category_name, p.unit_price, p.status
    ORDER BY p.name
    LIMIT $1 OFFSET $2
  `;
  const result = await pool.query(query, [50, 0]);
  console.log('Query OK, rows:', result.rows.length);
  if (result.rows[0]) console.log('Sample:', result.rows[0]);

  const cats = await pool.query(
    `SELECT category_id, category_name FROM product_categories WHERE status='Active' ORDER BY category_name`
  );
  console.log('Categories OK, rows:', cats.rows.length);
} catch (e) {
  console.error('ERROR:', e.message);
  console.error(e.stack);
} finally {
  await pool.end();
}
