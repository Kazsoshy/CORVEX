/**
 * DB smoke for operational alert upsert / list / resolve.
 * Run: node backend/scripts/test_operational_alerts_db.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import {
  listOperationalAlerts,
  upsertOpenOperationalAlert,
  resolveAlertsBySourceKey,
} from '../lib/operationalAlerts.js';

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const branch = await pool.query(
    `SELECT id FROM branches WHERE COALESCE(status, 'Active') = 'Active' ORDER BY id LIMIT 1`
  );
  const branchId = branch.rows[0]?.id;
  assert(branchId, 'no active branch');

  const key = `test:stockout:smoke:${Date.now()}`;
  const a1 = await upsertOpenOperationalAlert(pool, {
    branchId,
    alertType: 'Inventory Stockout',
    severity: 'Critical',
    title: 'Smoke stockout',
    message: 'Test stockout alert',
    sourceKey: key,
    entityType: 'product',
    entityId: 1,
    linkPath: 'branch-inventory',
  });
  const a2 = await upsertOpenOperationalAlert(pool, {
    branchId,
    alertType: 'Inventory Stockout',
    severity: 'Critical',
    title: 'Smoke stockout updated',
    message: 'Test stockout alert refreshed',
    sourceKey: key,
    entityType: 'product',
    entityId: 1,
    linkPath: 'branch-inventory',
  });

  assert(a1.created === true, 'expected create');
  assert(a2.created === false, 'expected upsert');
  assert(a1.row.alert_id === a2.row.alert_id, 'id mismatch');

  const open = await listOperationalAlerts(pool, {
    branchId,
    openOnly: true,
    category: 'Inventory',
    severity: 'Critical',
  });
  assert(open.some((r) => r.alert_id === a1.row.alert_id), 'missing in open inventory critical list');

  const n = await resolveAlertsBySourceKey(pool, key, { resolutionNote: 'smoke resolve' });
  assert(n >= 1, 'resolve failed');

  const open2 = await listOperationalAlerts(pool, { branchId, openOnly: true });
  assert(!open2.some((r) => r.alert_id === a1.row.alert_id), 'still open after resolve');

  console.log(JSON.stringify({ ok: true, alertId: a1.row.alert_id, remainingOpen: open2.length }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error('FAIL', err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
