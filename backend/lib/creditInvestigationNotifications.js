export async function insertUserNotification(pool, { userId, title, message, category = 'General', status = 'Unread' }) {
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, status, category, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [userId, title, message, status, category]
  );
}

/** Notify branch managers (branch) and operating managers (org) when sales submits a CI. */
export async function notifyCreditInvestigationSubmitted(pool, { branchId, ciId, customerName, submitterName }) {
  const approvers = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.status = 'Active'
       AND r.slug IN ('branch_manager', 'operating_manager')
       AND (r.slug = 'operating_manager' OR u.branch_id = $1)`,
    [branchId]
  );

  const title = 'New credit investigation';
  const message = `${submitterName} submitted a CI for ${customerName} (CI #${ciId}). Open Credit Investigation Approvals to review.`;

  await Promise.all(
    approvers.rows.map((row) =>
      insertUserNotification(pool, { userId: row.id, title, message, category: 'CI' })
    )
  );
}

/** Notify the sales agent who submitted the CI when it is approved, rejected, or sent back. */
export async function notifyCreditInvestigationDecision(pool, {
  submitterId,
  ciId,
  customerName,
  status,
  rejectionReason,
}) {
  if (!submitterId) return;

  const title =
    status === 'Approved'
      ? 'CI approved'
      : status === 'Rejected'
        ? 'CI rejected'
        : 'CI revision requested';

  let message = `Your credit investigation for ${customerName} (CI #${ciId}) was ${status.toLowerCase()}.`;
  if (status === 'Rejected' && rejectionReason) {
    message += ` Reason: ${rejectionReason}`;
  } else if (status === 'Revision Requested') {
    message += ' Update the form and submit again if needed.';
  }

  await insertUserNotification(pool, {
    userId: submitterId,
    title,
    message,
    category: 'CI',
  });
}
