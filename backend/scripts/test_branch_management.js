import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import pkg from 'pg';
import { fileURLToPath } from 'url';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'branch-management-smoke-secret';

const { requireAuth, issueSessionToken } = await import('../middleware/auth.js');
const { default: branchesRouter } = await import('../routes/branches.js');

const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

const app = express();
app.use(express.json());
app.locals.pool = pool;
app.use('/api/branches', requireAuth, branchesRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

async function call(method, url, token, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const om = (await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'operating_manager' AND u.status = 'Active' ORDER BY u.id LIMIT 1`
  )).rows[0];
  const token = issueSessionToken(om.id);

  const listed = await pool.query(
    `SELECT id, branch_code, name FROM branches ORDER BY id`
  );
  check('existing branches have BR codes', listed.rows.every((r) => /^BR-\d{5}$/.test(r.branch_code || '')), listed.rows.map((r) => r.branch_code).join(','));

  const list = await call('GET', '/branches', token);
  check('GET /branches', list.status === 200 && list.body.success, `status=${list.status}`);
  check('list exposes branch_code not as raw-only id', Boolean(list.body.data?.[0]?.branch_code));

  const policies = await call('GET', '/branches/policies', token);
  check('GET /branches/policies', policies.status === 200 && policies.body.data?.inactivity?.mode === 'off');

  const first = list.body.data?.[0];
  const detail = await call('GET', `/branches/${first.branch_id}`, token);
  check('GET detail omits MTD collections/sales payloads', detail.body.data?.collections == null && detail.body.data?.sales == null);
  check('GET detail includes branch_code', Boolean(detail.body.data?.branch_code));

  const stamp = Date.now();
  const created = await call('POST', '/branches', token, {
    branch_name: `Smoke Branch ${stamp}`,
    address_street: 'Test Street',
    address_barangay: 'Poblacion',
    address_city: 'Davao City',
    address_province: 'Davao del Sur',
    address_region: 'Region XI (Davao Region)',
    address_zip: '8000',
    latitude: 7.0731,
    longitude: 125.6128,
    contact_no: '09171234567',
    email: `smoke.branch.${stamp}@corvex.test`,
  });
  check('POST create branch', created.status === 201 && /^BR-\d{5}$/.test(created.body.data?.branch_code || ''), created.body.data?.branch_code || created.body.message);

  const bid = created.body.data?.branch_id;
  if (bid) {
    const badStatus = await call('PUT', `/branches/${bid}`, token, { status: 'Inactive' });
    // status field ignored — still success if no other fields? Our PUT requires fields; status alone should be "No fields"
    check('PUT status-only rejected or ignored', badStatus.status === 400 || badStatus.body.data?.status === 'Active', `${badStatus.status}`);

    const ops = await call('POST', `/branches/${bid}/operations`, token, {
      operations_state: 'suspended',
      reason: 'Smoke-test formal suspension record',
    });
    check('POST operations suspension', ops.status === 200 && ops.body.data?.status === 'Inactive' && ops.body.data?.operations_state === 'suspended');

    const resume = await call('POST', `/branches/${bid}/operations`, token, {
      operations_state: 'operating',
      reason: 'Smoke-test resume',
    });
    check('POST operations resume', resume.status === 200 && resume.body.data?.status === 'Active');

    await pool.query(
      `UPDATE branches SET name = $2, email = $3, status = 'Inactive', operations_state = 'ceased',
              operations_reason = 'Smoke cleanup', updated_at = NOW()
        WHERE id = $1`,
      [bid, `[SMOKE CLEANUP] Branch ${bid}`, `smoke.cleanup.${bid}@corvex.test`]
    );
  }

  const preview = await call('GET', '/branches/policies/inactivity-preview?months=1', token);
  check('inactivity preview', preview.status === 200 && Array.isArray(preview.body.data?.candidates));

  server.close();
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  server.close();
  await pool.end().catch(() => {});
  process.exit(1);
});
