import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex_db',
  password: process.env.DB_PASSWORD || '100802',
  port: process.env.DB_PORT || 5432,
});

(async () => {
  try {
    const tableQuery = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tables = tableQuery.rows.map(r => r.table_name);
    console.log('TABLES:', tables.join(', '));
    
    for (let tableName of tables) {
      const colQuery = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
      `, [tableName]);
      console.log(`- ${tableName}: ${colQuery.rows.map(r => r.column_name).join(', ')}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
