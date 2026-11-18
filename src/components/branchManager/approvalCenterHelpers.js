/** Resolve branch id from CORVEX session shapes (login uses user.branch.id). */
export function getUserBranchId(user) {
  if (!user) return null;
  const raw = user.branchId ?? user.branch_id ?? user.branch?.id ?? null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function isCrossBranchCandidate(candidate, ticketBranchId) {
  if (!candidate) return false;
  if (candidate.cross_branch) return true;
  if (candidate.same_branch === false) return true;
  if (candidate.branch_id == null || ticketBranchId == null) return false;
  return Number(candidate.branch_id) !== Number(ticketBranchId);
}

export function customerDisplayName(row) {
  if (!row) return 'Customer';
  return row.display_name
    || row.business_name
    || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ')
    || row.customer_code
    || (row.customer_id ? `#${row.customer_id}` : 'Customer');
}
