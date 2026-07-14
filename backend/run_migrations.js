import fs from 'fs';
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const { Pool } = pkg;

const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'corvex_db',
  password: process.env.DB_PASSWORD || '100802',
  port:     Number(process.env.DB_PORT) || 5432,
});

async function runMigrations() {
  try {
    const s000 = fs.readFileSync(path.join(process.cwd(), 'backend', 'migrations', '000_prepare_existing_tables.sql'), 'utf-8');
    const schemaSql = fs.readFileSync(path.join(process.cwd(), 'backend', 'migrations', '001_initial_schema.sql'), 'utf-8');
    const seedSql = fs.readFileSync(path.join(process.cwd(), 'backend', 'migrations', '002_seed_data.sql'), 'utf-8');

    console.log('Running 000_prepare_existing_tables.sql...');
    await pool.query(s000);
    console.log('Preparation successful.');

    console.log('Running 001_initial_schema.sql...');
    await pool.query(schemaSql);
    console.log('Schema created successfully.');

    // Add constraints to existing tables safely
    const fkSql = `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='users_role_id_fkey') THEN
          ALTER TABLE users ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='users_branch_id_fkey') THEN
          ALTER TABLE users ADD CONSTRAINT users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='clients_user_id_fkey') THEN
          ALTER TABLE clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='clients_branch_id_fkey') THEN
          ALTER TABLE clients ADD CONSTRAINT clients_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='clients_assigned_collector_fkey') THEN
          ALTER TABLE clients ADD CONSTRAINT clients_assigned_collector_fkey FOREIGN KEY (assigned_collector) REFERENCES users(id);
        END IF;
      END $$;
    `;
    await pool.query(fkSql);
    console.log('Constraints added successfully.');

    console.log('Running 002_seed_data.sql...');
    await pool.query(seedSql);
    console.log('Seed data inserted successfully.');

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

runMigrations();
