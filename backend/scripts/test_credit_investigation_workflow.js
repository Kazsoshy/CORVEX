/**
 * Smoke tests for CI revision resubmit + recommendation derivation (no DB seed).
 * Run: node backend/scripts/test_credit_investigation_workflow.js
 */
import assert from 'node:assert/strict';
import {
  deriveRecommendationCandidates,
} from '../lib/creditRecommendations.js';
import {
  CREDIT_REVIEW_REASONS,
} from '../lib/creditReview.js';

function baseEvidence(overrides = {}) {
  return {
    customer: {
      customer_id: 1,
      status: 'Active',
      id_verification_status: 'Verified',
      ...(overrides.customer || {}),
    },
    financial: {
      outstanding_balance: 0,
      credit_limit: null,
      overdue_count: 0,
      overdue_amount: 0,
      open_invoices: [],
      ...(overrides.financial || {}),
    },
    risk: { level: 'Low', score: 10, reasons: [] },
    pending_review: null,
    ...overrides,
  };
}

function testRecommendations() {
  const noLimit = deriveRecommendationCandidates(baseEvidence({
    financial: { outstanding_balance: 5000, credit_limit: null, open_invoices: [{ status: 'Unpaid' }] },
  }));
  assert.ok(noLimit.some((r) => r.type === 'First Limit'), 'First Limit expected');

  const util = deriveRecommendationCandidates(baseEvidence({
    financial: { outstanding_balance: 9500, credit_limit: 10000, open_invoices: [] },
  }));
  assert.ok(util.some((r) => r.type === 'Limit Increase'), 'Limit Increase at ≥90% util');

  const overdue = deriveRecommendationCandidates(baseEvidence({
    financial: {
      outstanding_balance: 1000,
      credit_limit: 5000,
      overdue_count: 2,
      overdue_amount: 800,
    },
  }));
  assert.ok(overdue.some((r) => r.type === 'Delinquency'), 'Delinquency expected');

  const kyc = deriveRecommendationCandidates(baseEvidence({
    customer: { status: 'Active', id_verification_status: 'Unverified' },
    financial: { outstanding_balance: 100, credit_limit: 1000 },
  }));
  assert.ok(kyc.some((r) => r.type === 'KYC'), 'KYC recommendation expected');

  const exposure = deriveRecommendationCandidates(baseEvidence({
    financial: { outstanding_balance: 12000, credit_limit: 10000 },
  }));
  assert.ok(exposure.some((r) => r.type === 'Exposure'), 'Exposure expected');

  const installment = deriveRecommendationCandidates(baseEvidence({
    financial: {
      outstanding_balance: 0,
      credit_limit: null,
      open_invoices: [{ pay_type: 'installment', term_months: 6, status: 'Unpaid' }],
    },
  }));
  assert.ok(installment.some((r) => r.type === 'Initial CI'), 'Initial CI for installment intent');

  const skipped = deriveRecommendationCandidates(baseEvidence({
    pending_review: { ci_id: 9, status: 'Pending' },
    financial: { outstanding_balance: 5000, credit_limit: null, open_invoices: [{ status: 'Unpaid' }] },
  }));
  assert.equal(skipped.length, 0, 'Open CI suppresses recommendations');

  const inactive = deriveRecommendationCandidates(baseEvidence({
    customer: { status: 'Inactive' },
    financial: { outstanding_balance: 5000, credit_limit: null, open_invoices: [{ status: 'Unpaid' }] },
  }));
  assert.equal(inactive.length, 0, 'Inactive customers are not recommended');

  console.log('PASS deriveRecommendationCandidates');
}

function testReasons() {
  assert.ok(CREDIT_REVIEW_REASONS.includes('First installment'));
  assert.ok(CREDIT_REVIEW_REASONS.includes('Need higher limit'));
  console.log('PASS CREDIT_REVIEW_REASONS');
}

testRecommendations();
testReasons();
console.log('All CI workflow unit checks passed.');
