import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function runScript(filePath) {
  console.log(`Running script: ${filePath}`);
  const sql = fs.readFileSync(filePath, 'utf8');
  try {
    await pool.query(sql);
    console.log(`✅ Success: ${filePath}`);
  } catch (err) {
    console.error(`❌ Error in ${filePath}:`, err.message);
  }
}

(async () => {
  try {
    await runScript('C:/Users/ASUS/.gemini/antigravity-ide/brain/b28efd64-05b5-470d-9308-57bceaa5b995/fix_audit_logs.sql');
  } catch (err) {
    console.error('Migration execution failed:', err);
  } finally {
    await pool.end();
  }
})();
