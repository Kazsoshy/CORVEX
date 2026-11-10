import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

const byBranch = await pool.query(`
  SELECT COALESCE(b.name, '(null branch)') AS branch_name,
         COUNT(*)::int AS collectors,
         COUNT(*) FILTER (WHERE u.branch_id IS NULL)::int AS null_branch
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN branches b ON b.id = u.branch_id
  WHERE r.slug = 'collector'
  GROUP BY 1
  ORDER BY 1
`);
const am = await pool.query(`SELECT COUNT(*)::int AS n FROM customers WHERE account_manager_id IS NOT NULL`);
console.log(JSON.stringify({ collectorsByBranch: byBranch.rows, customersWithAccountManager: am.rows[0].n }, null, 2));
await pool.end();
