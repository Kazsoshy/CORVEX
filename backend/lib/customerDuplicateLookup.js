/**
 * Cross-branch customer duplicate lookup used by GET /customers/lookup
 * and the authoritative gate inside POST /customers.
 */

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(dela|de la|del|de los|de las|da|do|van|von)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function maskPhone(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function namesLikelySame(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Token overlap for spelling variations (Juan Dela Cruz vs Juan De la Cruz).
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return false;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const minSize = Math.min(leftTokens.size, rightTokens.size);
  return overlap >= Math.max(2, minSize);
}

const SELECT_COLS = `
  c.customer_id, c.customer_code, c.first_name, c.middle_name, c.last_name, c.name_suffix,
  c.business_name, c.customer_type, c.contact_phone, c.portal_email, c.portal_status,
  c.status, c.branch_id, b.name AS branch_name, c.territory_id, t.territory_name,
  c.address, c.address_barangay, c.address_city, c.address_province,
  c.id_number, c.id_verification_status
`;

const FROM_SQL = `
  FROM customers c
  LEFT JOIN branches b ON b.id = c.branch_id
  LEFT JOIN territories t ON t.territory_id = c.territory_id
`;

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} query
 * @param {{ actorBranchId?: number|null }} options
 */
export async function findCustomerDuplicates(db, query = {}, options = {}) {
  const phone = String(query.contact_phone || query.phone || '').trim();
  const email = String(query.portal_email || query.email || '').trim().toLowerCase();
  const name = String(query.name || query.customer_name || '').trim();
  const businessName = String(query.business_name || '').trim();
  const barangay = String(query.address_barangay || query.barangay || '').trim();
  const address = String(query.address || '').trim();
  const customerCode = String(query.customer_code || query.code || '').trim();
  const idNumber = String(query.id_number || '').trim();
  const phoneDigits = digitsOnly(phone);
  const actorBranch = options.actorBranchId != null ? Number(options.actorBranchId) : null;
  const queryName = normalizeName(businessName || name);

  if (!phone && !email && !name && !businessName && !barangay && !address && !customerCode && !idNumber) {
    return { matches: [], error: 'Provide contact_phone, name, customer_code, id_number, address, or portal_email to search.' };
  }

  const byId = new Map();

  const addRows = (rows, reason, tier) => {
    for (const row of rows) {
      const existing = byId.get(row.customer_id);
      if (existing) {
        if (!existing.match_reasons.includes(reason)) existing.match_reasons.push(reason);
        if (tier === 'exact') existing.match_tier = 'exact';
        continue;
      }
      byId.set(row.customer_id, {
        ...row,
        match_reason: reason,
        match_reasons: [reason],
        match_tier: tier,
        same_phone_diff_name: false,
        requires_bm_verification: false,
      });
    }
  };

  if (customerCode) {
    const result = await db.query(
      `SELECT ${SELECT_COLS}
       ${FROM_SQL}
       WHERE UPPER(c.customer_code) = UPPER($1)
       LIMIT 5`,
      [customerCode]
    );
    addRows(result.rows, 'customer_code', 'exact');
  }

  if (idNumber) {
    const result = await db.query(
      `SELECT ${SELECT_COLS}
       ${FROM_SQL}
       WHERE c.id_verification_status = 'Verified'
         AND LOWER(TRIM(c.id_number)) = LOWER(TRIM($1))
       LIMIT 5`,
      [idNumber]
    );
    addRows(result.rows, 'verified_id', 'exact');
  }

  if (phone || phoneDigits.length >= 7) {
    const result = await db.query(
      `SELECT ${SELECT_COLS}
       ${FROM_SQL}
       WHERE c.contact_phone = $1
          OR c.contact_person_phone = $1
          OR regexp_replace(COALESCE(c.contact_phone, ''), '\\D', '', 'g') = $2
          OR regexp_replace(COALESCE(c.contact_person_phone, ''), '\\D', '', 'g') = $2
       LIMIT 8`,
      [phone || phoneDigits, phoneDigits || phone]
    );
    addRows(result.rows, 'phone', 'exact');
  }

  if (email) {
    const result = await db.query(
      `SELECT ${SELECT_COLS}
       ${FROM_SQL}
       WHERE LOWER(c.portal_email) = $1
       LIMIT 5`,
      [email]
    );
    addRows(result.rows, 'email', 'exact');
  }

  if (name.length >= 3 || businessName.length >= 3) {
    const needle = `%${(businessName || name).replace(/\s+/g, '%')}%`;
    const result = await db.query(
      `SELECT ${SELECT_COLS}
       ${FROM_SQL}
       WHERE CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) ILIKE $1
          OR c.business_name ILIKE $1
       LIMIT 8`,
      [needle]
    );
    for (const row of result.rows) {
      const full = normalizeName([row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' '));
      const biz = normalizeName(row.business_name);
      const exactName = (full && full === queryName) || (biz && biz === queryName)
        || namesLikelySame(full, queryName) && full.split(' ').length >= 2 && queryName.split(' ').length >= 2
        && normalizeName([row.first_name, row.last_name].filter(Boolean).join(' '))
          === normalizeName(queryName.split(' ').filter((_, i, arr) => i === 0 || i === arr.length - 1).join(' '));
      // Prefer strict equality for exact; similar tokens alone stay possible unless first+last align.
      const strictExact = (full && full === queryName) || (biz && biz === queryName);
      addRows([row], 'name', strictExact ? 'exact' : 'possible');
    }
  }

  if (barangay || address) {
    const result = await db.query(
      `SELECT ${SELECT_COLS}
       ${FROM_SQL}
       WHERE ($1::text = '' OR c.address_barangay ILIKE $2)
         AND ($3::text = '' OR c.address ILIKE $4 OR c.address_street ILIKE $4)
       LIMIT 8`,
      [
        barangay,
        barangay ? `%${barangay}%` : '',
        address,
        address ? `%${address}%` : '',
      ]
    );
    addRows(result.rows, 'address', 'possible');
  }

  const matches = [...byId.values()]
    .map((row) => {
      const sameBranch = actorBranch == null || Number(row.branch_id) === actorBranch;
      const full = normalizeName([row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' '));
      const reasons = row.match_reasons || [];
      let matchTier = row.match_tier;
      let samePhoneDiffName = false;
      let requiresBmVerification = matchTier === 'possible';

      // D6a: same mobile + different name → possible, force BM (never SA self-confirm).
      if (reasons.includes('phone') && queryName) {
        const nameAligned = namesLikelySame(full, queryName) || namesLikelySame(row.business_name, queryName);
        if (!nameAligned) {
          samePhoneDiffName = true;
          matchTier = 'possible';
          requiresBmVerification = true;
          if (!reasons.includes('same_phone_diff_name')) reasons.push('same_phone_diff_name');
        }
      }

      // Strong identity keys remain exact even if name differs (gov ID / customer code).
      if (reasons.includes('verified_id') || reasons.includes('customer_code')) {
        matchTier = 'exact';
        requiresBmVerification = false;
      }

      if (matchTier === 'possible' || samePhoneDiffName) {
        requiresBmVerification = true;
      }

      return {
        ...row,
        match_tier: matchTier,
        match_reasons: reasons,
        same_phone_diff_name: samePhoneDiffName,
        requires_bm_verification: requiresBmVerification,
        same_branch: sameBranch,
        cross_branch: actorBranch != null && Number(row.branch_id) !== actorBranch,
        contact_phone_masked: maskPhone(row.contact_phone),
      };
    })
    .sort((a, b) => {
      if (a.match_tier !== b.match_tier) return a.match_tier === 'exact' ? -1 : 1;
      return Number(a.customer_id) - Number(b.customer_id);
    })
    .slice(0, 10);

  const hasExact = matches.some((m) => m.match_tier === 'exact');
  const hasPossible = matches.some((m) => m.match_tier === 'possible');
  let summary = 'no_match';
  if (hasExact) summary = 'exact';
  else if (hasPossible) summary = 'possible';

  return {
    matches,
    summary,
    requires_bm_verification: matches.some((m) => m.requires_bm_verification),
  };
}

export function limitedMatchCard(row) {
  return {
    customer_id: row.customer_id,
    customer_code: row.customer_code,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    status: row.status,
    match_tier: row.match_tier,
    match_reasons: row.match_reasons || [row.match_reason],
    same_branch: row.same_branch,
    cross_branch: row.cross_branch,
    same_phone_diff_name: Boolean(row.same_phone_diff_name),
    requires_bm_verification: Boolean(row.requires_bm_verification),
    contact_phone_masked: row.contact_phone_masked || maskPhone(row.contact_phone),
    display_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.business_name || 'Customer',
  };
}

export { maskPhone, digitsOnly, normalizeName, namesLikelySame };
