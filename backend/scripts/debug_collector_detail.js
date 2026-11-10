import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import { computeAssignedSawRoute, computeCollectorSawPriority } from '../lib/sawCollectionData.js';
import { manilaDateString } from '../lib/sawCollection.js';

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

try {
  const collectors = await pool.query(`
    SELECT u.id, u.email, u.branch_id, u.phone, u.employee_id, r.slug
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'collector' ORDER BY u.id
  `);
  console.log('collectors', collectors.rows);

  const bm = await pool.query(`
    SELECT u.id, u.email, u.branch_id, r.slug
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'branch_manager' ORDER BY u.id
  `);
  console.log('branch_managers', bm.rows);

  const collectorId = Number(collectors.rows[0]?.id);
  const branchId = collectors.rows[0]?.branch_id;
  const scheduledDate = manilaDateString();
  console.log('testing detail path for', { collectorId, branchId, scheduledDate });

  const profileRes = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.employee_id,
            u.status, u.created_at, u.branch_id, b.name AS branch_name
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1`,
    [collectorId]
  );
  console.log('profile ok', profileRes.rows[0]);

  const assignedRoute = await computeAssignedSawRoute(pool, {
    collectorId,
    branchId,
    scheduledDate,
    asOfDate: scheduledDate,
  });
  console.log('assignedRoute', {
    published: assignedRoute.published,
    stops: assignedRoute.ranked?.length,
    roadProvider: assignedRoute.stats?.roadProvider,
  });

  const candidates = await computeCollectorSawPriority(pool, {
    collectorId,
    branchId,
    asOfDate: scheduledDate,
    scheduledDate,
  });
  console.log('candidates', candidates.stats);
} catch (err) {
  console.error('DETAIL_DEBUG_FAILED', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
