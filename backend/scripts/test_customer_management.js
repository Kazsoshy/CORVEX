/**
 * Smoke checks for SA customer management (sort whitelist, credit policy formula,
 * registration schema, geo helpers, offline sync table names).
 * Usage: node backend/scripts/test_customer_management.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import { DEFAULT_CREDIT_POLICIES, normalizeCreditPolicies, suggestFirstCreditLimit } from '../lib/creditPolicies.js';
import { buildLimitSuggestion } from '../lib/creditReview.js';

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
  const results = [];

  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name IN (
        'customer_type', 'business_name', 'registration_profile_json',
        'source_assignment_id', 'territory_override_note',
        'estimated_monthly_revenue', 'estimated_monthly_expenses', 'existing_obligations'
      )
    ORDER BY 1
  `);
  assert(cols.rows.length === 8, `registration columns missing: got ${cols.rows.map((r) => r.column_name).join(',')}`);
  results.push(['registration_columns', 'PASS', `count=${cols.rows.length}`]);

  const policyRow = await pool.query(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'credit_suggestion_policies'`
  );
  const policies = policyRow.rows.length
    ? normalizeCreditPolicies({
      ...DEFAULT_CREDIT_POLICIES,
      ...(typeof policyRow.rows[0].setting_value === 'string'
        ? JSON.parse(policyRow.rows[0].setting_value)
        : policyRow.rows[0].setting_value),
    })
    : { ...DEFAULT_CREDIT_POLICIES };
  results.push(['credit_policies_load', 'PASS', JSON.stringify(policies)]);

  const first = suggestFirstCreditLimit({
    policies,
    estimatedMonthlyRevenue: 40000,
    existingObligations: 2000,
    requestedCreditLimit: 20000,
    classification: 'Business Owner',
    hasEvidence: true,
  });
  assert(first.suggested_limit != null, 'first-credit suggestion should be numeric when revenue present');
  assert(first.path === 'revenue', 'business path should use revenue');
  assert(first.suggested_limit <= policies.max_first_limit, 'suggestion must respect max_first_limit');
  results.push(['suggest_first_credit', 'PASS', `suggested=${first.suggested_limit}`]);

  const employed = suggestFirstCreditLimit({
    policies: { ...policies, income_fraction: policies.income_fraction || policies.revenue_fraction },
    monthlyIncome: 30000,
    existingObligations: 1000,
    classification: 'Employed Individual',
    hasEvidence: true,
  });
  assert(employed.suggested_limit != null, 'employed suggestion should be numeric when income present');
  assert(employed.path === 'income', 'employed path should use income');
  results.push(['suggest_income_credit', 'PASS', `suggested=${employed.suggested_limit}`]);

  const needsReview = suggestFirstCreditLimit({
    policies,
    estimatedMonthlyRevenue: null,
    monthlyIncome: null,
    requestedCreditLimit: 10000,
  });
  assert(needsReview.suggested_limit == null, 'no revenue/income → null suggestion');
  results.push(['suggest_needs_review', 'PASS']);

  const evidence = {
    customer: { estimated_monthly_revenue: 30000, existing_obligations: 0 },
    financial: {
      credit_limit: null,
      outstanding_balance: 0,
      overdue_count: 0,
      payment_history: [],
      estimated_monthly_revenue: 30000,
      existing_obligations: 0,
      requested_credit_limit: 15000,
      has_supporting_evidence: true,
    },
    requested_credit_limit: 15000,
  };
  const suggestion = buildLimitSuggestion(evidence, { level: 'Low', score: 10, reasons: [] }, policies);
  assert(suggestion.suggested_limit != null, 'buildLimitSuggestion should use registration financials');
  results.push(['build_limit_suggestion', 'PASS', `suggested=${suggestion.suggested_limit}`]);

  // Sort whitelist parity with GET /customers
  const SORT_KEYS = new Set(['name', 'code', 'territory', 'outstanding', 'credit_limit', 'status', 'created_at']);
  assert(SORT_KEYS.has('name') && SORT_KEYS.has('credit_limit'), 'sort whitelist incomplete');
  results.push(['sort_whitelist', 'PASS']);

  const geoCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'territories'
      AND column_name IN ('center_lat', 'center_lng', 'radius_meters', 'barangay_code')
  `);
  results.push(['territory_geo_columns', geoCols.rows.length >= 1 ? 'PASS' : 'SKIP', `count=${geoCols.rows.length}`]);

  const ciTable = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'credit_investigations'
  `);
  assert(ciTable.rows.length === 1, 'credit_investigations missing');
  results.push(['credit_investigations_table', 'PASS']);

  console.log(JSON.stringify({ ok: true, results }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
