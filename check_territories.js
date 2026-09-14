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
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'territories'");
  console.log('territories columns:', res.rows);
} catch (e) {
  console.error(e.message);
} finally {
  pool.end();
}
