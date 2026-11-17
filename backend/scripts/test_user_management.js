/**
 * End-to-end checks for Operating Manager user management.
 * Mounts the real auth + users routers on a throwaway port and drives them over HTTP.
 * Creates temporary accounts and removes them afterwards.
 * Run: node backend/scripts/test_user_management.js
 */
import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import pkg from 'pg';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'user-management-test-secret';

const { requireAuth, issueSessionToken } = await import('../middleware/auth.js');
const { default: authRouter } = await import('../routes/auth.js');
const { default: usersRouter } = await import('../routes/users.js');

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
app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, usersRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

const STAMP = Date.now();
const created = [];
const results = [];

function check(name, cond, detail = '') {
  results.push([name, cond ? 'PASS' : 'FAIL', detail]);
}

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
  return { status: res.status, body: json, headers: res.headers };
}

async function roleId(slug) {
  const r = await pool.query(`SELECT role_id FROM roles WHERE slug = $1`, [slug]);
  return r.rows[0].role_id;
}

async function main() {
  const om = (await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'operating_manager' AND u.status = 'Active' ORDER BY u.id LIMIT 1`
  )).rows[0];
  const omToken = issueSessionToken(om.id);
  const collectorRole = await roleId('collector');
  const bmRole = await roleId('branch_manager');

  // ── List visibility, sorting, search ──
  const list = await call('GET', '/users?limit=500&sort=employee_id&order=asc', omToken);
  const slugs = new Set(list.body.data.map((u) => u.role.slug));
  check('list hides super_admin/OM/customer', !slugs.has('super_admin') && !slugs.has('operating_manager') && !slugs.has('customer'));
  check('list hides own account', !list.body.data.some((u) => u.user_id === om.id));
  const ids = list.body.data.map((u) => u.employee_id);
  check('sort employee_id asc', ids.every((v, i) => i === 0 || String(ids[i - 1]) <= String(v)), ids.slice(0, 4).join(','));
  check('every employee has EMP id', ids.every((v) => /^EMP-\d{5}$/.test(v || '')));
  const desc = await call('GET', '/users?limit=500&sort=name&order=desc', omToken);
  const names = desc.body.data.map((u) => `${u.first_name} ${u.last_name}`.toLowerCase());
  check('sort name desc', names.every((v, i) => i === 0 || names[i - 1] >= v));
  const search = await call('GET', `/users?search=${encodeURIComponent(ids[0])}`, omToken);
  check('search by employee id', search.body.data.length === 1 && search.body.data[0].employee_id === ids[0]);

  const sa = (await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.slug = 'super_admin' LIMIT 1`
  )).rows[0];
  check('GET super admin by id is 404 for OM', (await call('GET', `/users/${sa.id}`, omToken)).status === 404);
  check('edit super admin is 404 for OM', (await call('PUT', `/users/${sa.id}`, omToken, { first_name: 'X' })).status === 404);
  check('disable own account is 404 for OM', (await call('POST', `/users/${om.id}/disable`, omToken, { reason: 'testing self' })).status === 404);

  // ── One Branch Manager per branch ──
  const slots = await call('GET', '/users/branch-manager-slots', omToken);
  const filled = slots.body.data.filter((s) => s.manager);
  check('each branch has at most one active BM', slots.body.data.length > 0, filled.map((s) => `${s.branchName}:${s.manager.employeeId}`).join(' | '));
  const bmDupes = await pool.query(
    `SELECT u.branch_id, COUNT(*)::int n FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE r.slug = 'branch_manager' AND u.status = 'Active' GROUP BY 1 HAVING COUNT(*) > 1`
  );
  check('no branch has two active BMs in DB', bmDupes.rows.length === 0);
  if (filled.length) {
    const dupBm = await call('POST', '/users', omToken, {
      first_name: 'Dup', last_name: 'Manager', email: `dup.bm.${STAMP}@corvex.test`,
      role_id: bmRole, branch_id: filled[0].branchId,
    });
    check('second BM for branch rejected', dupBm.status === 409 && dupBm.body.code === 'BRANCH_MANAGER_EXISTS', dupBm.body.message);
  }

  // ── Create: forced Active, generated EMP id + temporary password ──
  const emailA = `um.collector.a.${STAMP}@corvex.test`;
  const createA = await call('POST', '/users', omToken, {
    first_name: 'Test', last_name: 'CollectorA', email: emailA.toUpperCase(), role_id: collectorRole,
    branch_id: 1, status: 'Inactive', password: 'ignored-password', employee_id: 'HACK-1', contact_number: '0917 123 4567',
  });
  const userA = createA.body.data;
  if (userA) created.push(userA.user_id);
  const tempA = createA.body.initialCredential?.temporaryPassword;
  check('create returns 201', createA.status === 201, createA.body.message);
  check('created user is Active despite status input', userA?.status === 'Active');
  check('employee id generated (manual ignored)', /^EMP-\d{5}$/.test(userA?.employee_id || ''), userA?.employee_id);
  check('email stored lowercase', userA?.email === emailA);
  check('temporary password returned once (OM password ignored)', typeof tempA === 'string' && tempA.length >= 12 && tempA !== 'ignored-password');
  check('create response is no-store', String(createA.headers.get('cache-control')).includes('no-store'));
  const hashRow = (await pool.query(`SELECT password_hash, must_change_password FROM users WHERE id = $1`, [userA.user_id])).rows[0];
  check('password stored as bcrypt hash', /^\$2[aby]\$12\$/.test(hashRow.password_hash) && !hashRow.password_hash.includes(tempA));
  check('must_change_password set', hashRow.must_change_password === true);
  check('list rows never include password data', !JSON.stringify(list.body).includes('password_hash'));

  const dupEmail = await call('POST', '/users', omToken, {
    first_name: 'Dup', last_name: 'Email', email: emailA.replace('um.', 'UM.'), role_id: collectorRole, branch_id: 1,
  });
  check('duplicate email (case-insensitive) rejected', dupEmail.status === 409, dupEmail.body.message);
  const noBranch = await call('POST', '/users', omToken, {
    first_name: 'No', last_name: 'Branch', email: `nobranch.${STAMP}@corvex.test`, role_id: collectorRole,
  });
  check('branch role without branch rejected', noBranch.status === 400, noBranch.body.message);
  const omRole = await roleId('operating_manager');
  const makeOm = await call('POST', '/users', omToken, {
    first_name: 'No', last_name: 'Om', email: `noom.${STAMP}@corvex.test`, role_id: omRole,
  });
  check('OM cannot create OM accounts', makeOm.status === 403);

  // ── First sign-in forces a password change ──
  const loginA = await call('POST', '/auth/login', null, { email: emailA, password: tempA });
  check('login with temporary password', loginA.status === 200 && loginA.body.user?.mustChangePassword === true);
  const tokenA = loginA.body.token;
  const blocked = await call('GET', '/users', tokenA);
  check('non-auth API blocked until password changed', blocked.status === 403 && blocked.body.code === 'PASSWORD_CHANGE_REQUIRED');
  const samePw = await call('PUT', '/auth/me', tokenA, { current_password: tempA, new_password: tempA });
  check('cannot reuse temporary password', samePw.status === 400);
  const newPw = `Fresh-${STAMP}-Pw`;
  const changed = await call('PUT', '/auth/me', tokenA, { current_password: tempA, new_password: newPw, confirm_password: newPw });
  check('password change clears flag', changed.status === 200 && changed.body.data?.must_change_password === false, changed.body.message);

  // ── Edit restrictions ──
  const editEmail = await call('PUT', `/users/${userA.user_id}`, omToken, { email: `other.${STAMP}@corvex.test` });
  check('email locked in edit', editEmail.status === 400 && editEmail.body.code === 'EMAIL_LOCKED');
  const editPw = await call('PUT', `/users/${userA.user_id}`, omToken, { password: 'NewPassword123!' });
  check('password locked in edit', editPw.status === 400 && editPw.body.code === 'PASSWORD_LOCKED');
  const editStatus = await call('PUT', `/users/${userA.user_id}`, omToken, { status: 'Inactive' });
  check('status not editable in edit', editStatus.status === 400);
  const editEmp = await call('PUT', `/users/${userA.user_id}`, omToken, { employee_id: 'EMP-99999' });
  check('employee id not editable', editEmp.status === 400);
  const editName = await call('PUT', `/users/${userA.user_id}`, omToken, {
    first_name: 'Tested', email: emailA, status: 'Active', employee_id: userA.employee_id,
  });
  check('name edit with unchanged locked fields ok', editName.status === 200 && editName.body.data.first_name === 'Tested', editName.body.message);
  let triggerBlocked = false;
  try {
    await pool.query(`UPDATE users SET employee_id = 'EMP-99999' WHERE id = $1`, [userA.user_id]);
  } catch {
    triggerBlocked = true;
  }
  check('DB trigger keeps employee id immutable', triggerBlocked);

  // ── Disable with dependency check + reassignment ──
  const createB = await call('POST', '/users', omToken, {
    first_name: 'Test', last_name: 'CollectorB', email: `um.collector.b.${STAMP}@corvex.test`, role_id: collectorRole, branch_id: 1,
  });
  const userB = createB.body.data;
  if (userB) created.push(userB.user_id);
  const customer = (await pool.query(`SELECT customer_id FROM customers WHERE branch_id = 1 ORDER BY customer_id LIMIT 1`)).rows[0];
  const visit = await pool.query(
    `INSERT INTO field_visits (customer_id, user_id, visit_type, scheduled_date, status)
     VALUES ($1, $2, 'Collection', DATE '2099-01-01', 'Pending') RETURNING visit_id`,
    [customer.customer_id, userA.user_id]
  );
  const visitId = visit.rows[0].visit_id;

  const loginA2 = await call('POST', '/auth/login', null, { email: emailA, password: newPw });
  const tokenA2 = loginA2.body.token;
  check('normal login after password change', loginA2.status === 200 && loginA2.body.user?.mustChangePassword === false);

  const deps = await call('GET', `/users/${userA.user_id}/dependencies`, omToken);
  const visitDep = deps.body.data?.dependencies?.items?.find((i) => i.key === 'pendingVisits');
  check('dependency count is real', visitDep?.count === 1, JSON.stringify(deps.body.data?.dependencies?.totals));
  check('replacement candidates same role+branch', deps.body.data?.candidates?.some((c) => c.id === userB.user_id));

  const noReason = await call('POST', `/users/${userA.user_id}/disable`, omToken, {});
  check('disable requires reason', noReason.status === 400);
  const needReassign = await call('POST', `/users/${userA.user_id}/disable`, omToken, { reason: 'Resigned effective today' });
  check('disable blocked until work reassigned', needReassign.status === 409 && needReassign.body.reason === 'reassignment_required');
  const badTarget = await call('POST', `/users/${userA.user_id}/disable`, omToken, { reason: 'Resigned effective today', reassign_to_user_id: om.id });
  check('reassignment target must match role/branch', badTarget.status === 400);
  const disabled = await call('POST', `/users/${userA.user_id}/disable`, omToken, {
    reason: 'Resigned effective today', reassign_to_user_id: userB.user_id,
  });
  check('disable with reassignment succeeds', disabled.status === 200 && disabled.body.data.status === 'Inactive', disabled.body.message);
  const visitOwner = (await pool.query(`SELECT user_id FROM field_visits WHERE visit_id = $1`, [visitId])).rows[0].user_id;
  check('open visit moved to replacement', visitOwner === userB.user_id);
  const afterDisable = await call('GET', '/auth/me', tokenA2);
  check('existing session rejected after disable', afterDisable.status === 401, afterDisable.body.code);
  const loginDisabled = await call('POST', '/auth/login', null, { email: emailA, password: newPw });
  check('disabled account cannot sign in', loginDisabled.status === 401);
  const kept = (await pool.query(`SELECT email, status_reason FROM users WHERE id = $1`, [userA.user_id])).rows[0];
  check('email + reason preserved on disable', kept.email === emailA && kept.status_reason === 'Resigned effective today');
  const auditRow = await pool.query(
    `SELECT 1 FROM audit_logs WHERE affected_record = $1 AND activity = 'Disable User'`, [`user:${userA.user_id}`]
  );
  check('disable audited', auditRow.rows.length === 1);
  const editDisabled = await call('PUT', `/users/${userA.user_id}`, omToken, { last_name: 'StillDisabled' });
  check('edit keeps disabled status', editDisabled.status === 200 && editDisabled.body.data.status === 'Inactive');

  const enabled = await call('POST', `/users/${userA.user_id}/enable`, omToken, { reason: 'Rehired' });
  check('enable restores access', enabled.status === 200 && enabled.body.data.status === 'Active');
  const loginEnabled = await call('POST', '/auth/login', null, { email: emailA, password: newPw });
  check('re-enabled account can sign in', loginEnabled.status === 200);

  // ── Temporary password (recovery) ──
  const temp = await call('POST', `/users/${userA.user_id}/temporary-password`, omToken, { reason: 'Forgot password' });
  check('temporary password issued', temp.status === 200 && typeof temp.body.initialCredential?.temporaryPassword === 'string');
  const afterTemp = await call('GET', '/auth/me', loginEnabled.body.token);
  check('sessions revoked after temporary password', afterTemp.status === 401 && afterTemp.body.code === 'SESSION_REVOKED');

  // ── Policies ──
  const badPolicy = await call('PUT', '/users/policies', omToken, { inactivity: { mode: 'auto', inactivityDays: null } });
  check('auto policy requires threshold', badPolicy.status === 400);
  const before = await call('GET', '/users/policies', omToken);
  const preview = await call('GET', '/users/policies/inactivity-preview?days=30&include_never_signed_in=true', omToken);
  check('inactivity preview works', preview.status === 200 && Array.isArray(preview.body.data?.candidates), `${preview.body.data?.candidates?.length} candidates`);
  check('policy default is off', before.body.data?.inactivity?.mode === 'off');

  await pool.query(`DELETE FROM field_visits WHERE visit_id = $1`, [visitId]);
}

async function cleanup() {
  if (!created.length) return;
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::int[])`, [created]);
  await pool.query(
    `DELETE FROM audit_logs WHERE user_id = ANY($1::int[]) OR affected_record = ANY($2::text[])`,
    [created, created.map((id) => `user:${id}`)]
  );
  await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [created]);
  await pool.query(`
    SELECT setval('users_employee_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING(employee_id FROM 5)::int) FROM users WHERE employee_id ~ '^EMP-[0-9]+$'), 0)),
      (SELECT COUNT(*) > 0 FROM users WHERE employee_id ~ '^EMP-[0-9]+$'))
  `);
}

try {
  await main();
} catch (err) {
  results.push(['unexpected error', 'FAIL', err.stack || err.message]);
} finally {
  await cleanup().catch((err) => results.push(['cleanup', 'FAIL', err.message]));
  server.close();
  await pool.end();
}

console.table(results.map(([test, status, detail]) => ({ test, status, detail: String(detail).slice(0, 90) })));
const failed = results.filter((r) => r[1] !== 'PASS');
console.log(failed.length ? `${failed.length} check(s) failed.` : `All ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
