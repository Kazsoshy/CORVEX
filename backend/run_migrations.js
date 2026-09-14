import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'corvex',
  password: process.env.DB_PASSWORD || '100802',
  port:     Number(process.env.DB_PORT) || 5432,
});

const MIGRATIONS_DIR = path.join(process.cwd(), 'backend', 'migrations');

const MIGRATIONS = [
  { file: '001_initial_schema.sql',                  label: '001_initial_schema.sql' },
  { file: '000_prepare_existing_tables.sql',         label: '000_prepare_existing_tables.sql' },
  { file: '002_seed_data.sql',                       label: '002_seed_data.sql' },
  { file: '004_fix_password_hash.sql',               label: '004_fix_password_hash.sql' },
  { file: '008_seed_customers.sql',                  label: '008_seed_customers.sql' },
  { file: '009_seed_customer_activity.sql',          label: '009_seed_customer_activity.sql' },
  { file: '010_seed_field_operations.sql',           label: '010_seed_field_operations.sql' },
  { file: '011_seed_reports.sql',                    label: '011_seed_reports.sql' },
  { file: '012_seed_customer_activity.sql',          label: '012_seed_customer_activity.sql' },
  { file: '013_seed_realistic_transactions.sql',     label: '013_seed_realistic_transactions.sql' },
  { file: '014_acm_schema_alignment.sql',            label: '014_acm_schema_alignment.sql' },
  { file: '015_cleanup_branch_columns.sql',          label: '015_cleanup_branch_columns.sql' },
  { file: '016_seed_missing_tables.sql',             label: '016_seed_missing_tables.sql' },
  { file: '017_fix_unscoped_roles.sql',              label: '017_fix_unscoped_roles.sql' },
  { file: '018_seed_credit_history.sql',             label: '018_seed_credit_history.sql' },
  { file: '019_seed_digital_receipts.sql',           label: '019_seed_digital_receipts.sql' },
];

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query(`SELECT migration FROM schema_migrations`);
  return new Set(result.rows.map((row) => row.migration));
}

async function recordMigration(label) {
  await pool.query(`INSERT INTO schema_migrations (migration) VALUES ($1) ON CONFLICT (migration) DO NOTHING`, [label]);
}

function isAlreadyExistsError(err) {
  const message = (err.message || '').toLowerCase();
  return message.includes('already exists') || message.includes('duplicate key') || err.code === '42P07' || err.code === '42710';
}

async function runMigrations() {
  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const pending = MIGRATIONS.filter((m) => !applied.has(m.label));

    if (!pending.length) {
      console.log('No pending migrations. All up to date.');
      process.exit(0);
    }

    for (const { file, label } of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${label} — file not found.`);
        await recordMigration(label);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`Running ${label}...`);
      try {
        await pool.query(sql);
        await recordMigration(label);
        console.log(`${label} completed.`);
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          console.log(`${label} skipped — objects already exist in database.`);
          await recordMigration(label);
        } else {
          throw err;
        }
      }
    }

    console.log(`All migrations completed successfully (${pending.length} processed).`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

runMigrations();
