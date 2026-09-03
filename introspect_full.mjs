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

    for (let row of tableQuery.rows) {
      const tableName = row.table_name;
      console.log(`\nTABLE: ${tableName}`);
      
      const colQuery = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `, [tableName]);
      
      for (let col of colQuery.rows) {
        console.log(`  - ${col.column_name}: ${col.data_type} (Nullable: ${col.is_nullable}) ${col.column_default ? 'Default: ' + col.column_default : ''}`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
