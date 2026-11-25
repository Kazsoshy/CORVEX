import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reports = fs.readFileSync(path.join(__dirname, '../routes/reports.js'), 'utf8');

test('payment detail returns proof only through branch-scoped credit history query', () => {
  assert.ok(reports.includes('CREDIT_HISTORY_DETAIL_SELECT'), 'detail select exists');
  assert.ok(reports.includes('cp.payment_proof_image'), 'proof column selected on detail');
  assert.ok(reports.includes("router.get('/credit-history/:id'"), 'detail route exists');
  assert.ok(reports.includes('creditHistoryScope(user'), 'detail uses creditHistoryScope');
  assert.ok(
    reports.includes('c.branch_id = $') || reports.includes('c.branch_id = ${'),
    'branch customers are scoped'
  );
  assert.ok(
    reports.includes('(cp.collectionpayment_id IS NULL OR cp.branch_id = $'),
    'payment branch must match customer/caller branch'
  );
});

test('BM proof access endpoints re-check branch scope before audit', () => {
  assert.ok(reports.includes("router.post('/credit-history/:id/proof-access'"));
  assert.ok(reports.includes("router.post('/credit-history/:id/void-request'"));
  const proofAccessBlock = reports.slice(
    reports.indexOf("router.post('/credit-history/:id/proof-access'"),
    reports.indexOf("router.post('/credit-history/:id/void-request'")
  );
  assert.ok(proofAccessBlock.includes('creditHistoryScope(user'), 'proof-access uses scope');
  assert.ok(proofAccessBlock.includes('Payment record not found'), 'cross-branch returns not found');
});

test('list endpoint uses list select, not detail proof payload select', () => {
  const listStart = reports.indexOf("router.get('/credit-history'");
  const detailStart = reports.indexOf("router.get('/credit-history/:id'");
  const listBlock = reports.slice(listStart, detailStart);
  const detailBlock = reports.slice(detailStart, reports.indexOf("router.post('/credit-history/:id/proof-access'"));
  assert.ok(listBlock.includes('CREDIT_HISTORY_SELECT'));
  assert.ok(!listBlock.includes('CREDIT_HISTORY_DETAIL_SELECT'));
  assert.ok(detailBlock.includes('CREDIT_HISTORY_DETAIL_SELECT'), 'detail route uses proof payload select');
});
