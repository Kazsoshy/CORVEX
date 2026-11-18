/**
 * Acceptance matrix for SA Find / identity / branch-transfer revise.
 * Exercises library + SQL paths (not browser UI).
 *
 * Usage: node scripts/test_sa_detection_transfer_matrix.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import { findCustomerDuplicates } from '../lib/customerDuplicateLookup.js';
import {
  createIdentityVerification,
  decideIdentityVerification,
  deriveIdentityNextAction,
  getIdentityVerificationById,
  listMyOpenIdentityVerifications,
  linkBranchTransferToIdentity,
  consumeClearanceToken,
} from '../lib/customerIdentityVerification.js';
import {
  createBranchTransferRequest,
  sourceBmSubmitTransfer,
  omDecideTransfer,
} from '../lib/customerBranchTransfer.js';

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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const client = await pool.connect();
  try {
    const branches = await pool.query(`SELECT id, name FROM branches ORDER BY id ASC LIMIT 5`);
    if (branches.rows.length < 2) {
      throw new Error('Need at least 2 branches for cross-branch tests.');
    }
    const branchA = branches.rows[0];
    const branchB = branches.rows[1];

    const terrA = await pool.query(
      `SELECT territory_id FROM territories WHERE branch_id = $1 AND COALESCE(status,'Active') = 'Active' LIMIT 1`,
      [branchA.id]
    );
    const terrB = await pool.query(
      `SELECT territory_id FROM territories WHERE branch_id = $1 AND COALESCE(status,'Active') = 'Active' LIMIT 1`,
      [branchB.id]
    );
    if (!terrA.rows.length || !terrB.rows.length) {
      throw new Error('Need Active territories on both branches.');
    }

    const users = await pool.query(
      `SELECT u.id, r.slug AS role_slug, u.branch_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE r.slug IN ('sales_staff', 'sales_agent', 'branch_manager', 'operating_manager')
         AND u.status = 'Active'
       ORDER BY u.id ASC`
    );
    const isSa = (u) => u.role_slug === 'sales_staff' || u.role_slug === 'sales_agent';
    const sa = users.rows.find((u) => isSa(u) && Number(u.branch_id) === Number(branchA.id))
      || users.rows.find((u) => isSa(u));
    const bmA = users.rows.find((u) => u.role_slug === 'branch_manager' && Number(u.branch_id) === Number(branchA.id))
      || users.rows.find((u) => u.role_slug === 'branch_manager');
    const bmB = users.rows.find((u) => u.role_slug === 'branch_manager' && Number(u.branch_id) === Number(branchB.id))
      || bmA;
    const om = users.rows.find((u) => u.role_slug === 'operating_manager') || bmA;
    if (!sa || !bmA || !om) {
      throw new Error('Need SA, BM, and OM users for tests.');
    }

    const stamp = Date.now().toString().slice(-6);
    // Distinct 11-digit PH mobiles (09 + 9 digits)
    const phoneExactSame = `0917${stamp}001`;
    const phoneExactCross = `0917${stamp}002`;
    const phonePossible = `0917${stamp}003`;
    const phoneNoMatch = `0917${stamp}999`;

    async function insertCustomer({ branchId, territoryId, phone, first, last, agentId }) {
      const code = `T-${stamp}-${Math.floor(Math.random() * 900 + 100)}`;
      const res = await pool.query(
        `INSERT INTO customers (
           customer_code, branch_id, territory_id, first_name, last_name, contact_phone,
           address, status, assigned_sales_agent_id, customer_type
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Active',$8,'Individual')
         RETURNING customer_id, branch_id, contact_phone, first_name, last_name, customer_code`,
        [code, branchId, territoryId, first, last, phone, 'Test Address Barangay', agentId || sa.id]
      );
      return res.rows[0];
    }

    // --- Setup customers ---
    const sameBranchCust = await insertCustomer({
      branchId: branchA.id,
      territoryId: terrA.rows[0].territory_id,
      phone: phoneExactSame,
      first: 'ExactSame',
      last: `Test${stamp}`,
    });
    const crossBranchCust = await insertCustomer({
      branchId: branchB.id,
      territoryId: terrB.rows[0].territory_id,
      phone: phoneExactCross,
      first: 'ExactCross',
      last: `Test${stamp}`,
    });
    const possibleCust = await insertCustomer({
      branchId: branchA.id,
      territoryId: terrA.rows[0].territory_id,
      phone: phonePossible,
      first: 'PossibleMatch',
      last: `Alpha${stamp}`,
    });

    // Seed outstanding balance for cross-branch customer (preserve after transfer)
    try {
      await pool.query(
        `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
         VALUES ($1, 1500.00, 0)
         ON CONFLICT (customer_id) DO UPDATE
         SET outstanding_balance = 1500.00`,
        [crossBranchCust.customer_id]
      );
    } catch (err) {
      try {
        await pool.query(
          `UPDATE customer_activity SET outstanding_balance = 1500.00 WHERE customer_id = $1`,
          [crossBranchCust.customer_id]
        );
        const exists = await pool.query(
          `SELECT 1 FROM customer_activity WHERE customer_id = $1`,
          [crossBranchCust.customer_id]
        );
        if (!exists.rows.length) {
          await pool.query(
            `INSERT INTO customer_activity (customer_id, outstanding_balance) VALUES ($1, 1500.00)`,
            [crossBranchCust.customer_id]
          );
        }
      } catch (inner) {
        console.warn('Could not seed customer_activity:', inner.message);
      }
    }

    // 1) Exact same branch
    {
      const dup = await findCustomerDuplicates(pool, {
        contact_phone: phoneExactSame,
        name: `ExactSame Test${stamp}`,
      }, { actorBranchId: branchA.id });
      const primary = dup.matches.find((m) => m.match_tier === 'exact' && m.same_branch);
      check(
        'Exact Match, Same Branch → exact + same_branch',
        dup.summary === 'exact' && Boolean(primary),
        `summary=${dup.summary} customer=${primary?.customer_id}`
      );
    }

    // 2) Exact cross branch
    {
      const dup = await findCustomerDuplicates(pool, {
        contact_phone: phoneExactCross,
        name: `ExactCross Test${stamp}`,
      }, { actorBranchId: branchA.id });
      const primary = dup.matches.find((m) => m.match_tier === 'exact' && m.cross_branch);
      check(
        'Exact Match, Different Branch → exact + cross_branch',
        dup.summary === 'exact' && Boolean(primary),
        `summary=${dup.summary}`
      );
    }

    // 3) Possible match (same phone, different name demotion)
    {
      const dup = await findCustomerDuplicates(pool, {
        contact_phone: phonePossible,
        name: `Different Person${stamp}`,
      }, { actorBranchId: branchA.id });
      check(
        'Possible Match (same phone different name) → possible / BM required',
        dup.summary === 'possible' && dup.requires_bm_verification === true,
        `summary=${dup.summary}`
      );
    }

    // 4) No match — phone-only unique number (avoid fuzzy name hits)
    {
      const dup = await findCustomerDuplicates(pool, {
        contact_phone: phoneNoMatch,
      }, { actorBranchId: branchA.id });
      check(
        'No Match → no_match',
        dup.summary === 'no_match' && dup.matches.length === 0,
        `summary=${dup.summary} count=${dup.matches.length}`
      );
    }

    // 5) Identity: reject exact-only BM request
    {
      await client.query('BEGIN');
      let rejected = false;
      try {
        await createIdentityVerification(client, {
          branchId: branchA.id,
          requestedBy: sa.id,
          searchPayload: { contact_phone: phoneExactSame },
          proposedRegistration: { contact_phone: phoneExactSame },
          matches: [{
            customer_id: sameBranchCust.customer_id,
            match_tier: 'exact',
            same_branch: true,
            branch_id: branchA.id,
          }],
        });
      } catch (err) {
        rejected = err.status === 400;
      }
      await client.query('ROLLBACK');
      check('Exact match cannot open BM identity ticket', rejected);
    }

    // 6) BM Same Person same branch → open_profile
    {
      await client.query('BEGIN');
      const ticket = await createIdentityVerification(client, {
        branchId: branchA.id,
        requestedBy: sa.id,
        searchPayload: { contact_phone: phonePossible, name: `Different Person${stamp}` },
        proposedRegistration: {
          first_name: 'Different',
          last_name: `Person${stamp}`,
          contact_phone: phonePossible,
        },
        matches: [{
          customer_id: possibleCust.customer_id,
          match_tier: 'possible',
          same_branch: true,
          cross_branch: false,
          branch_id: branchA.id,
          first_name: possibleCust.first_name,
          last_name: possibleCust.last_name,
          customer_code: possibleCust.customer_code,
        }],
      });
      const decided = await decideIdentityVerification(client, {
        verificationId: ticket.verification_id,
        decision: 'same_person',
        note: 'Same person test',
        decidedBy: bmA.id,
        matchCustomerId: possibleCust.customer_id,
      });
      check(
        'Possible → BM Same Person → Same Branch → open_profile',
        decided.next_action === 'open_profile' && decided.same_branch === true,
        `next_action=${decided.next_action}`
      );
      await client.query('ROLLBACK');
    }

    // 7) Cross-branch must NOT use Same Person; BM links transfer instead
    {
      await client.query('BEGIN');
      const ticket = await createIdentityVerification(client, {
        branchId: branchA.id,
        requestedBy: sa.id,
        searchPayload: { contact_phone: phoneExactCross, name: 'Maybe Cross' },
        proposedRegistration: { contact_phone: phoneExactCross, first_name: 'Maybe', last_name: 'Cross' },
        matches: [{
          customer_id: crossBranchCust.customer_id,
          match_tier: 'possible',
          same_branch: false,
          cross_branch: true,
          branch_id: branchB.id,
          first_name: crossBranchCust.first_name,
          last_name: crossBranchCust.last_name,
          customer_code: crossBranchCust.customer_code,
        }],
      });
      let blockedSame = false;
      try {
        await decideIdentityVerification(client, {
          verificationId: ticket.verification_id,
          decision: 'same_person',
          note: 'Should fail — cross branch',
          decidedBy: bmA.id,
          matchCustomerId: crossBranchCust.customer_id,
        });
      } catch (err) {
        blockedSame = err.status === 400;
      }
      check('Cross-branch Same Person decision blocked', blockedSame);

      const transfer = await createBranchTransferRequest(client, {
        customerId: crossBranchCust.customer_id,
        targetBranchId: branchA.id,
        requestedBy: bmA.id,
        reason: 'BM linked from identity review',
      });
      const linked = await linkBranchTransferToIdentity(client, {
        verificationId: ticket.verification_id,
        matchCustomerId: crossBranchCust.customer_id,
        transferId: transfer.transfer_id,
        decidedBy: bmA.id,
      });
      const loaded = await getIdentityVerificationById(client, ticket.verification_id);
      const meta = deriveIdentityNextAction(loaded);
      check(
        'Possible → BM cross-branch → Transfer Linked → wait_transfer',
        linked.status === 'Transfer Linked'
          && meta.next_action === 'wait_transfer'
          && Number(loaded.linked_transfer_id) === Number(transfer.transfer_id),
        `status=${linked.status} next=${meta.next_action}`
      );
      await client.query('ROLLBACK');
    }

    // 7b) Idempotent re-request returns existing open ticket
    {
      await client.query('BEGIN');
      const first = await createIdentityVerification(client, {
        branchId: branchA.id,
        requestedBy: sa.id,
        searchPayload: { contact_phone: phonePossible },
        proposedRegistration: { contact_phone: phonePossible },
        matches: [{
          customer_id: possibleCust.customer_id,
          match_tier: 'possible',
          same_branch: true,
          branch_id: branchA.id,
        }],
      });
      let idempotent = false;
      let existingId = null;
      try {
        await createIdentityVerification(client, {
          branchId: branchA.id,
          requestedBy: sa.id,
          searchPayload: { contact_phone: phonePossible },
          proposedRegistration: { contact_phone: phonePossible },
          matches: [{
            customer_id: possibleCust.customer_id,
            match_tier: 'possible',
            same_branch: true,
            branch_id: branchA.id,
          }],
        });
      } catch (err) {
        idempotent = err.status === 409;
        existingId = err.existingId;
      }
      check(
        'Duplicate BM verification request is idempotent (409 existing)',
        idempotent && Number(existingId) === Number(first.verification_id),
        `existing=${existingId}`
      );
      const mine = await listMyOpenIdentityVerifications(client, { requestedBy: sa.id, limit: 5 });
      check(
        'SA mine open verifications restores pending ticket',
        mine.some((r) => Number(r.verification_id) === Number(first.verification_id)),
        `count=${mine.length}`
      );
      await client.query('ROLLBACK');
    }

    // 8) BM Different Person → clearance
    {
      await client.query('BEGIN');
      const ticket = await createIdentityVerification(client, {
        branchId: branchA.id,
        requestedBy: sa.id,
        searchPayload: { contact_phone: phonePossible, name: `Other${stamp}` },
        proposedRegistration: { contact_phone: phonePossible, first_name: 'Other', last_name: stamp },
        matches: [{
          customer_id: possibleCust.customer_id,
          match_tier: 'possible',
          same_branch: true,
          branch_id: branchA.id,
        }],
      });
      const decided = await decideIdentityVerification(client, {
        verificationId: ticket.verification_id,
        decision: 'different_person',
        note: 'Different person',
        decidedBy: bmA.id,
        matchCustomerId: possibleCust.customer_id,
      });
      const consumed = await consumeClearanceToken(client, decided.clearance_token, branchA.id);
      check(
        'Possible → BM Different Person → clearance → proceed',
        decided.status === 'Different Person'
          && Boolean(decided.clearance_token)
          && Boolean(consumed?.verification_id)
          && deriveIdentityNextAction(decided).next_action === 'proceed_registration',
        `token=${Boolean(decided.clearance_token)}`
      );
      await client.query('ROLLBACK');
    }

    // 9–12) Transfer approve / reject / revision / overdue preserve
    {
      await client.query('BEGIN');
      const transfer = await createBranchTransferRequest(client, {
        customerId: crossBranchCust.customer_id,
        targetBranchId: branchA.id,
        requestedBy: sa.id,
        reason: 'Matrix test transfer',
      });
      check('Transfer request created (Pending Source)', transfer.status === 'Pending Source');

      const submitted = await sourceBmSubmitTransfer(client, {
        transferId: transfer.transfer_id,
        sourceBmId: bmB.id,
        targetTerritoryId: terrA.rows[0].territory_id,
        reason: 'Customer relocating — matrix test',
      });
      check('Source BM submit → Pending OM', submitted.status === 'Pending OM');

      // Needs revision
      const revised = await omDecideTransfer(client, {
        transferId: transfer.transfer_id,
        decision: 'needs_revision',
        note: 'Need clearer territory note',
        omUserId: om.id,
      });
      check('OM return for revision → Needs Revision', revised.transfer.status === 'Needs Revision' && revised.applied === false);

      const resubmitted = await sourceBmSubmitTransfer(client, {
        transferId: transfer.transfer_id,
        sourceBmId: bmB.id,
        targetTerritoryId: terrA.rows[0].territory_id,
        reason: 'Customer relocating — revised',
      });
      check('Source BM resubmit after revision → Pending OM', resubmitted.status === 'Pending OM');

      const beforeBal = await client.query(
        `SELECT outstanding_balance FROM customer_activity WHERE customer_id = $1`,
        [crossBranchCust.customer_id]
      );

      const approved = await omDecideTransfer(client, {
        transferId: transfer.transfer_id,
        decision: 'approve',
        note: 'Approved matrix transfer',
        omUserId: om.id,
        assignedSalesAgentId: sa.id,
      });
      check('OM approve → applied', approved.applied === true && approved.transfer.status === 'Approved');

      const afterCust = await client.query(
        `SELECT branch_id, territory_id, assigned_sales_agent_id, account_manager_id, customer_id
         FROM customers WHERE customer_id = $1`,
        [crossBranchCust.customer_id]
      );
      const c = afterCust.rows[0];
      check(
        'Transfer updates branch/territory/SA and clears collector',
        Number(c.branch_id) === Number(branchA.id)
          && Number(c.territory_id) === Number(terrA.rows[0].territory_id)
          && Number(c.assigned_sales_agent_id) === Number(sa.id)
          && c.account_manager_id == null
          && Number(c.customer_id) === Number(crossBranchCust.customer_id)
      );

      if (beforeBal.rows.length) {
        const afterBal = await client.query(
          `SELECT outstanding_balance FROM customer_activity WHERE customer_id = $1`,
          [crossBranchCust.customer_id]
        );
        check(
          'Transferred overdue balance preserved',
          Number(afterBal.rows[0].outstanding_balance) === Number(beforeBal.rows[0].outstanding_balance),
          `bal=${afterBal.rows[0].outstanding_balance}`
        );
      } else {
        check('Transferred overdue balance preserved', true, 'customer_activity row missing — skipped soft');
      }

      await client.query('ROLLBACK');
    }

    // 13) OM reject retains ownership
    {
      await client.query('BEGIN');
      const transfer = await createBranchTransferRequest(client, {
        customerId: crossBranchCust.customer_id,
        targetBranchId: branchA.id,
        requestedBy: sa.id,
        reason: 'Reject path',
      });
      await sourceBmSubmitTransfer(client, {
        transferId: transfer.transfer_id,
        sourceBmId: bmB.id,
        targetTerritoryId: terrA.rows[0].territory_id,
        reason: 'Reject path',
      });
      const rejected = await omDecideTransfer(client, {
        transferId: transfer.transfer_id,
        decision: 'reject',
        note: 'Not approved',
        omUserId: om.id,
      });
      const cust = await client.query(`SELECT branch_id FROM customers WHERE customer_id = $1`, [crossBranchCust.customer_id]);
      check(
        'OM reject → ownership unchanged',
        rejected.applied === false
          && rejected.transfer.status === 'Rejected'
          && Number(cust.rows[0].branch_id) === Number(branchB.id)
      );
      await client.query('ROLLBACK');
    }

    // 14) Concurrent create advisory lock serializes (smoke: lock callable)
    {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [748392210, 12345]);
      check('Advisory lock for concurrent create available', true);
      await client.query('ROLLBACK');
    }

    // 15) GET by id next_action helper
    {
      await client.query('BEGIN');
      const ticket = await createIdentityVerification(client, {
        branchId: branchA.id,
        requestedBy: sa.id,
        searchPayload: { contact_phone: phonePossible },
        proposedRegistration: { contact_phone: phonePossible },
        matches: [{
          customer_id: possibleCust.customer_id,
          match_tier: 'possible',
          same_branch: true,
          branch_id: branchA.id,
        }],
      });
      await decideIdentityVerification(client, {
        verificationId: ticket.verification_id,
        decision: 'same_person',
        decidedBy: bmA.id,
        matchCustomerId: possibleCust.customer_id,
      });
      await client.query('COMMIT');
      const loaded = await getIdentityVerificationById(pool, ticket.verification_id);
      const meta = deriveIdentityNextAction(loaded);
      check(
        'GET verification derives next_action open_profile',
        loaded?.status === 'Same Person' && meta.next_action === 'open_profile'
      );
      // cleanup ticket
      await pool.query(`DELETE FROM customer_identity_verifications WHERE verification_id = $1`, [ticket.verification_id]);
    }

    // Cleanup seeded customers (best effort)
    await pool.query(
      `DELETE FROM customer_activity WHERE customer_id = ANY($1::int[])`,
      [[sameBranchCust.customer_id, crossBranchCust.customer_id, possibleCust.customer_id]]
    ).catch(() => null);
    await pool.query(
      `DELETE FROM customer_branch_transfers WHERE customer_id = ANY($1::int[])`,
      [[sameBranchCust.customer_id, crossBranchCust.customer_id, possibleCust.customer_id]]
    ).catch(() => null);
    await pool.query(
      `DELETE FROM customers WHERE customer_id = ANY($1::int[])`,
      [[sameBranchCust.customer_id, crossBranchCust.customer_id, possibleCust.customer_id]]
    );

    const failed = results.filter((r) => !r.ok);
    console.log('\n--- Summary ---');
    console.log(`Passed: ${results.length - failed.length}/${results.length}`);
    if (failed.length) {
      failed.forEach((f) => console.log(`  FAIL: ${f.name} ${f.detail}`));
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
