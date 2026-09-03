const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex_db',
  password: process.env.DB_PASSWORD || '100802',
  port: Number(process.env.DB_PORT) || 5432,
});

async function run() {
  try {
    const res = await pool.query(`
      INSERT INTO users (branch_id, first_name, last_name, role_id, email, password_hash, status)
      SELECT 
          (SELECT branch_id FROM branches WHERE branch_name = 'Davao City Branch'),
          'Test', 'Test',
          (SELECT role_id FROM roles WHERE slug = 'customer'),
          'test@test.com',
          'hash',
          'Active'
    `);
    console.log('Query 1 OK');
  } catch (err) {
    console.error('Query 1 Error:', err.message);
  } finally {
    pool.end();
  }
}
run();
