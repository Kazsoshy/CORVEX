export const CREDIT_POLICY_KEY = 'credit_suggestion_policies';

export const DEFAULT_CREDIT_POLICIES = {
  revenue_fraction: 0.3,
  income_fraction: 0.3,
  max_first_limit: 50000,
  min_first_limit: 1000,
  require_evidence_for_suggestion: false,
  territory_buffer_meters: 250,
  offline_credit_max_age_hours: 24,
};

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizeFraction(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    const err = new Error(`${fieldName} must be between 0 exclusive and 1 inclusive.`);
    err.status = 400;
    throw err;
  }
  return n;
}

export function normalizeCreditPolicies(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const revenueFraction = normalizeFraction(
    src.revenue_fraction ?? src.revenueFraction ?? DEFAULT_CREDIT_POLICIES.revenue_fraction,
    'revenue_fraction'
  );
  const incomeFraction = normalizeFraction(
    src.income_fraction
      ?? src.incomeFraction
      ?? src.revenue_fraction
      ?? src.revenueFraction
      ?? DEFAULT_CREDIT_POLICIES.income_fraction,
    'income_fraction'
  );
  const maxFirst = money(src.max_first_limit ?? src.maxFirstLimit ?? DEFAULT_CREDIT_POLICIES.max_first_limit);
  const minFirst = money(src.min_first_limit ?? src.minFirstLimit ?? DEFAULT_CREDIT_POLICIES.min_first_limit);
  const buffer = Number(src.territory_buffer_meters ?? src.territoryBufferMeters ?? DEFAULT_CREDIT_POLICIES.territory_buffer_meters);
  const offlineAge = Number(
    src.offline_credit_max_age_hours ?? src.offlineCreditMaxAgeHours ?? DEFAULT_CREDIT_POLICIES.offline_credit_max_age_hours
  );

  if (maxFirst == null || maxFirst <= 0) {
    const err = new Error('max_first_limit must be a positive amount.');
    err.status = 400;
    throw err;
  }
  if (minFirst == null || minFirst < 0) {
    const err = new Error('min_first_limit must be zero or greater.');
    err.status = 400;
    throw err;
  }
  if (minFirst > maxFirst) {
    const err = new Error('min_first_limit cannot exceed max_first_limit.');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 5000) {
    const err = new Error('territory_buffer_meters must be between 0 and 5000.');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(offlineAge) || offlineAge < 1 || offlineAge > 168) {
    const err = new Error('offline_credit_max_age_hours must be between 1 and 168.');
    err.status = 400;
    throw err;
  }

  return {
    revenue_fraction: revenueFraction,
    income_fraction: incomeFraction,
    max_first_limit: maxFirst,
    min_first_limit: minFirst,
    require_evidence_for_suggestion: Boolean(
      src.require_evidence_for_suggestion ?? src.requireEvidenceForSuggestion
      ?? DEFAULT_CREDIT_POLICIES.require_evidence_for_suggestion
    ),
    territory_buffer_meters: Math.round(buffer),
    offline_credit_max_age_hours: Math.round(offlineAge),
  };
}

export async function loadCreditPolicies(db) {
  try {
    const result = await db.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1`,
      [CREDIT_POLICY_KEY]
    );
    if (!result.rows.length) return { ...DEFAULT_CREDIT_POLICIES };
    const raw = result.rows[0].setting_value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeCreditPolicies({ ...DEFAULT_CREDIT_POLICIES, ...parsed });
  } catch {
    return { ...DEFAULT_CREDIT_POLICIES };
  }
}

export async function saveCreditPolicies(db, policies) {
  const normalized = normalizeCreditPolicies(policies);
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value,
           updated_at = CURRENT_TIMESTAMP`,
    [CREDIT_POLICY_KEY, JSON.stringify(normalized)]
  );
  return normalized;
}

/**
 * First-credit suggestion from registration financials + OM policy.
 * Business: revenue_fraction × revenue − obligations
 * Employed: income_fraction × monthly income − obligations
 * Returns null amount when inputs/policy insufficient (no invented formula).
 */
export function suggestFirstCreditLimit({
  policies = DEFAULT_CREDIT_POLICIES,
  estimatedMonthlyRevenue = null,
  monthlyIncome = null,
  existingObligations = null,
  requestedCreditLimit = null,
  classification = null,
  hasEvidence = false,
} = {}) {
  const policy = normalizeCreditPolicies(policies);
  const obligations = money(existingObligations) || 0;
  const classLabel = String(classification || '').toLowerCase();
  const isEmployed = classLabel.includes('employ')
    || (monthlyIncome != null && Number(monthlyIncome) > 0
      && !(estimatedMonthlyRevenue != null && Number(estimatedMonthlyRevenue) > 0));

  if (policy.require_evidence_for_suggestion && !hasEvidence) {
    return {
      eligible: true,
      suggested_limit: null,
      message: 'Supporting evidence is required by policy before a numeric credit suggestion can be generated. Branch Manager review required.',
      policy,
      path: isEmployed ? 'income' : 'revenue',
    };
  }

  const baseAmount = isEmployed
    ? money(monthlyIncome)
    : money(estimatedMonthlyRevenue);
  const fraction = isEmployed ? policy.income_fraction : policy.revenue_fraction;
  const path = isEmployed ? 'income' : 'revenue';

  if (baseAmount == null || baseAmount <= 0 || !Number.isFinite(fraction) || fraction <= 0) {
    return {
      eligible: true,
      suggested_limit: null,
      message: isEmployed
        ? 'Insufficient employment income for a reliable suggestion. Configure OM income policy and ensure monthly income is provided, or Branch Manager sets the approved limit.'
        : 'Insufficient financial information for a reliable suggestion. Branch Manager should set the approved limit after review.',
      policy,
      path,
    };
  }

  let suggested = Math.max(0, (baseAmount * fraction) - obligations);
  suggested = Math.min(suggested, policy.max_first_limit);
  if (suggested < policy.min_first_limit) {
    return {
      eligible: true,
      suggested_limit: null,
      message: `Computed capacity is below the policy minimum (₱${policy.min_first_limit.toLocaleString('en-PH')}). Needs further Branch Manager review.`,
      policy,
      path,
    };
  }

  suggested = money(suggested);
  const requested = money(requestedCreditLimit);
  return {
    eligible: true,
    suggested_limit: suggested,
    requested_credit_limit: requested,
    message: isEmployed
      ? `Suggested from ${Math.round(fraction * 100)}% of monthly income minus obligations, capped by Operating Manager policy.`
      : `Suggested from ${Math.round(fraction * 100)}% of estimated monthly revenue minus obligations, capped by Operating Manager policy.`,
    policy,
    path,
  };
}
