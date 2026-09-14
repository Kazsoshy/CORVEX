import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env') });

const pool = new pkg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

try {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'suppliers'");
  console.log('suppliers columns:', res.rows.map(r => r.column_name));
} catch (e) {
  console.error(e.message);
} finally {
  pool.end();
}
