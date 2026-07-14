import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'corvex_db',
  password: process.env.DB_PASSWORD || '100802',
  port:     Number(process.env.DB_PORT) || 5432,
});

async function run() {
  // Check all seeded users
  const users = await pool.query(
    `SELECT id, email, full_name, role_id, status FROM users WHERE role_id IS NOT NULL ORDER BY id LIMIT 30`
  );
  console.log('Seeded users:');
  users.rows.forEach(u => console.log(`  [${u.id}] ${u.full_name} | ${u.email} | role_id=${u.role_id} | ${u.status}`));

  // Check roles
  const roles = await pool.query('SELECT id, name, slug FROM roles ORDER BY id');
  console.log('\nRoles:');
  roles.rows.forEach(r => console.log(`  [${r.id}] ${r.name} | slug=${r.slug}`));

  pool.end();
}
run();
