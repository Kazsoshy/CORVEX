/**
 * Applies lightweight schema fixes expected by API routes when migrations
 * have not been run yet. Safe to run on every startup (IF NOT EXISTS).
 */
export async function ensureSchema(client) {
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) DEFAULT NULL;

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) DEFAULT NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person_mname VARCHAR(100) DEFAULT NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(30);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person_relationship VARCHAR(80);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_fname VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_lname VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_phone VARCHAR(30);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_relationship VARCHAR(80);

    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(50);

    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50);

    ALTER TABLE permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE field_activity_reports ADD COLUMN IF NOT EXISTS photo TEXT;

    ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS territory_assignments (
      assignment_id  SERIAL PRIMARY KEY,
      territory_id   INTEGER NOT NULL REFERENCES territories(territory_id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      role_id        INTEGER REFERENCES roles(role_id),
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(territory_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_territory_assignments_territory ON territory_assignments(territory_id);
    CREATE INDEX IF NOT EXISTS idx_territory_assignments_user ON territory_assignments(user_id);
  `);
}
