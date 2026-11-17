import { applyCollectionPayment } from './collectionPayment.js';
import { clearOverdueDedup, notifyInvoicePendingReview, notifyOverdueAccounts, publishStockAlerts } from './operationalNotifications.js';
import { applySalesInvoice } from './salesInvoiceWrite.js';
import { createCreditReview } from './creditReview.js';
import { SyncConflict } from './syncErrors.js';

const FIELD_REPORT = 'field_activity_reports';
const COLLECTION = 'collection_payment';
const SALE = 'sales_invoices';
const CUSTOMER_REG = 'customer_registration';
const FIELD_ROLES = new Set(['collector', 'sales_staff']);

function cleanText(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return max ? text.slice(0, max) : text;
}

const COLLECTOR_INCIDENT_ACTIVITIES = new Set([
  'Payment Dispute',
  'Customer Refused',
  'Safety / Aggression',
  'Location Issue',
]);
const COLLECTOR_SEVERITIES = new Set(['Low', 'Medium', 'High', 'Critical']);

function fieldReportError(payload) {
  const visitId = Number(payload?.visit_id);
  const assignmentId = Number(payload?.assignment_id);
  const activity = cleanText(payload?.overall_outcome || payload?.activity_type, 80);
  const remarks = cleanText(payload?.remarks);
  const photo = typeof payload?.photo === 'string' ? payload.photo.trim() : '';
  const photoException = cleanText(payload?.photo_exception_reason, 1000);
  const severity = cleanText(payload?.severity, 20);
  const hasVisit = Number.isFinite(visitId) && visitId > 0;
  const hasAssignment = Number.isFinite(assignmentId) && assignmentId > 0;
  if (!hasVisit && !hasAssignment) return 'assignment_id or visit_id is required.';
  if (!activity) return 'activity_type is required.';
  if (!remarks) return 'remarks are required.';
  if (photo) {
    if (!photo.startsWith('data:image/')) return 'photo must be a valid image upload.';
    if (photo.length > 900_000) return 'photo is too large. Use a smaller image.';
  } else if (!photoException) {
    // Collector visit FARs still require a photo; sales assignment may use exception.
    if (hasVisit || !hasAssignment) return 'photo must be a valid image upload.';
  }
  if (COLLECTOR_INCIDENT_ACTIVITIES.has(activity)) {
    if (!severity || !COLLECTOR_SEVERITIES.has(severity)) {
      return 'severity is required for incident/issue activities.';
    }
  } else if (severity) {
    return 'severity is only allowed for incident/issue activities.';
  }
  return null;
}

async function applyFieldReport(client, user, payload) {
  if (!FIELD_ROLES.has(user.roleSlug)) {
    throw new Error('Only collector and sales reports can be synced.');
  }
  const problem = fieldReportError(payload);
  if (problem) throw new Error(problem);

  const visitId = Number(payload.visit_id);
  const assignmentId = Number(payload.assignment_id);
  const customerId = Number(payload.customer_id);
  const hasVisit = Number.isFinite(visitId) && visitId > 0;
  const hasAssignment = Number.isFinite(assignmentId) && assignmentId > 0;
  const hasCustomer = Number.isFinite(customerId) && customerId > 0;

  if (hasVisit) {
    const visit = await client.query(
      `SELECT visit_id, status FROM field_visits WHERE visit_id = $1 AND user_id = $2`,
      [visitId, user.id]
    );
    if (!visit.rows.length) throw new Error('Visit not found for this user.');
    if (payload.visit_status && visit.rows[0].status !== payload.visit_status) {
      throw new SyncConflict('This visit changed on the server after the report was saved on the device.');
    }
  }

  if (hasAssignment) {
    const assignment = await client.query(
      `SELECT assignment_id, status FROM sales_area_assignments
       WHERE assignment_id = $1 AND sales_agent_id = $2
       FOR UPDATE`,
      [assignmentId, user.id]
    );
    if (!assignment.rows.length) throw new Error('Area assignment not found for this user.');
  }

  if (hasCustomer && !hasAssignment) {
    const customer = await client.query(
      `SELECT customer_id FROM customers WHERE customer_id = $1 AND branch_id = $2`,
      [customerId, user.branchId]
    );
    if (!customer.rows.length) throw new Error('Customer not found in your branch.');
  }

  const activity = cleanText(payload.overall_outcome || payload.activity_type, 80);
  const severityRaw = cleanText(payload.severity, 20);
  const severity = COLLECTOR_INCIDENT_ACTIVITIES.has(activity) ? severityRaw : null;
  const photoException = cleanText(payload.photo_exception_reason, 1000);
  const photoValue = typeof payload.photo === 'string' ? payload.photo.trim() : '';
  if (!photoValue && !photoException && hasAssignment && user.roleSlug === 'sales_staff') {
    throw new Error('Photo evidence or photo exception reason is required.');
  }

  // Sales assignment FAR: upsert one active report per assignment (no duplicates).
  if (hasAssignment && user.roleSlug === 'sales_staff' && !hasVisit) {
    const existing = await client.query(
      `SELECT report_id, activity_type, remarks, photo, photo_exception_reason, review_status, revision_history_json
       FROM field_activity_reports
       WHERE assignment_id = $1 AND COALESCE(is_superseded, FALSE) = FALSE
       LIMIT 1
       FOR UPDATE`,
      [assignmentId]
    );
    if (existing.rows.length) {
      const row = existing.rows[0];
      const history = Array.isArray(row.revision_history_json) ? row.revision_history_json : [];
      history.push({
        at: new Date().toISOString(),
        edited_by: user.id,
        activity_type: row.activity_type,
        remarks: row.remarks,
        has_photo: Boolean(row.photo),
        photo_exception_reason: row.photo_exception_reason || null,
        review_status: row.review_status || 'Submitted',
        source: 'offline_sync',
      });
      const updated = await client.query(
        `UPDATE field_activity_reports
         SET activity_type = $1,
             remarks = $2,
             photo = COALESCE($3, photo),
             photo_exception_reason = $4,
             revision_history_json = $5::jsonb,
             review_status = 'Submitted',
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $6,
             sync_status = 'Synced'
         WHERE report_id = $7
         RETURNING report_id`,
        [
          activity,
          cleanText(payload.remarks),
          photoValue || null,
          photoException || null,
          JSON.stringify(history.slice(-50)),
          user.id,
          row.report_id,
        ]
      );
      await client.query(
        `UPDATE sales_area_assignments
         SET closeout_report_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE assignment_id = $2`,
        [updated.rows[0].report_id, assignmentId]
      );
      return updated.rows[0].report_id;
    }

    const inserted = await client.query(
      `INSERT INTO field_activity_reports
         (visit_id, assignment_id, customer_id, user_id, activity_type, severity, remarks, photo,
          photo_exception_reason, sync_status, review_status, updated_at, updated_by)
       VALUES (NULL, $1, NULL, $2, $3, NULL, $4, $5, $6, 'Synced', 'Submitted', CURRENT_TIMESTAMP, $2)
       RETURNING report_id`,
      [
        assignmentId,
        user.id,
        activity,
        cleanText(payload.remarks),
        photoValue || null,
        photoException || null,
      ]
    );
    await client.query(
      `UPDATE sales_area_assignments
       SET closeout_report_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE assignment_id = $2`,
      [inserted.rows[0].report_id, assignmentId]
    );
    return inserted.rows[0].report_id;
  }

  let resolvedCustomerId = hasCustomer ? customerId : null;
  if (!resolvedCustomerId && hasVisit) {
    const visitCustomer = await client.query(
      `SELECT customer_id FROM field_visits WHERE visit_id = $1`,
      [visitId]
    );
    resolvedCustomerId = visitCustomer.rows[0]?.customer_id ?? null;
  }

  const inserted = await client.query(
    `INSERT INTO field_activity_reports
       (visit_id, assignment_id, customer_id, user_id, activity_type, severity, remarks, photo, sync_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Synced')
     RETURNING report_id`,
    [
      hasVisit ? visitId : null,
      hasAssignment ? assignmentId : null,
      resolvedCustomerId,
      user.id,
      activity,
      severity || null,
      cleanText(payload.remarks),
      photoValue,
    ]
  );
  return inserted.rows[0].report_id;
}

async function findExisting(client, userId, tableName, reference) {
  const found = await client.query(
    `SELECT sync_queue_id, sync_status
     FROM offline_sync_queue
     WHERE user_id = $1 AND table_name = $2 AND record_reference = $3
     ORDER BY sync_queue_id DESC
     LIMIT 1`,
    [userId, tableName, reference]
  );
  return found.rows[0] || null;
}

async function insertQueueRow(client, { userId, deviceId, tableName, reference, payload, status }) {
  const syncedAt = status === 'Synced' ? new Date() : null;
  const inserted = await client.query(
    `INSERT INTO offline_sync_queue (
       user_id, device_id, table_name, record_reference, payload, sync_status, attempted_at, synced_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
     RETURNING sync_queue_id, sync_status`,
    [userId, deviceId, tableName, reference, JSON.stringify(payload ?? {}), status, syncedAt]
  );
  return inserted.rows[0];
}

async function markFailed(pool, user, deviceId, tableName, localId, payload, message) {
  const existing = await findExisting(pool, user.id, tableName, localId);
  if (existing?.sync_status === 'Synced') {
    return {
      localId,
      syncQueueId: existing.sync_queue_id,
      syncStatus: 'Synced',
      message: 'Already synced.',
    };
  }
  if (existing) {
    await pool.query(
      `UPDATE offline_sync_queue
       SET sync_status = 'Failed', attempted_at = CURRENT_TIMESTAMP, device_id = COALESCE($2, device_id)
       WHERE sync_queue_id = $1`,
      [existing.sync_queue_id, deviceId]
    );
    return {
      localId,
      syncQueueId: existing.sync_queue_id,
      syncStatus: 'Failed',
      message,
    };
  }
  const failed = await insertQueueRow(pool, {
    userId: user.id,
    deviceId,
    tableName,
    reference: localId,
    payload,
    status: 'Failed',
  });
  return {
    localId,
    syncQueueId: failed.sync_queue_id,
    syncStatus: 'Failed',
    message,
  };
}

async function finishSynced(client, queueId, deviceId, payload) {
  await client.query(
    `UPDATE offline_sync_queue
     SET sync_status = 'Synced',
         attempted_at = CURRENT_TIMESTAMP,
         synced_at = CURRENT_TIMESTAMP,
         payload = $2,
         device_id = COALESCE($3, device_id)
     WHERE sync_queue_id = $1`,
    [queueId, JSON.stringify(payload), deviceId]
  );
}

async function claimQueueRow(client, user, deviceId, tableName, localId, payload) {
  const inserted = await client.query(
    `INSERT INTO offline_sync_queue (
       user_id, device_id, table_name, record_reference, payload, sync_status, attempted_at, synced_at
     )
     VALUES ($1, $2, $3, $4, $5, 'Pending', CURRENT_TIMESTAMP, NULL)
     ON CONFLICT (user_id, table_name, record_reference) DO NOTHING
     RETURNING sync_queue_id`,
    [user.id, deviceId, tableName, localId, JSON.stringify(payload ?? {})]
  );
  if (inserted.rows[0]?.sync_queue_id) {
    return { queueId: inserted.rows[0].sync_queue_id, alreadySynced: false };
  }
  const existing = await client.query(
    `SELECT sync_queue_id, sync_status
     FROM offline_sync_queue
     WHERE user_id = $1 AND table_name = $2 AND record_reference = $3
     FOR UPDATE`,
    [user.id, tableName, localId]
  );
  const row = existing.rows[0];
  if (!row) return { queueId: null, alreadySynced: false };
  return { queueId: row.sync_queue_id, alreadySynced: row.sync_status === 'Synced' };
}

async function applyCustomerRegistration(client, user, payload) {
  if (user.roleSlug !== 'sales_staff') {
    throw new Error('Only sales agents can sync customer registrations.');
  }
  if (!user.branchId) throw new Error('No branch assigned.');

  const phone = cleanText(payload?.contact_phone, 40);
  const first = cleanText(payload?.first_name, 80);
  const last = cleanText(payload?.last_name, 80);
  if (!phone || !first || !last) {
    throw new Error('Customer registration payload is incomplete.');
  }

  // Authoritative duplicate check on sync
  const phoneDigits = phone.replace(/\D/g, '');
  const dupes = await client.query(
    `SELECT customer_id, customer_code, branch_id, first_name, last_name, contact_phone
     FROM customers
     WHERE contact_phone = $1
        OR regexp_replace(COALESCE(contact_phone, ''), '\\D', '', 'g') = $2
     LIMIT 5`,
    [phone, phoneDigits]
  );
  if (dupes.rows.length && !payload?.acknowledge_duplicate) {
    throw new SyncConflict(
      `Possible duplicate customer(s) found (${dupes.rows.map((r) => r.customer_code || r.customer_id).join(', ')}). Review and acknowledge before syncing as new.`
    );
  }

  const territoryId = Number(payload.territory_id);
  if (!Number.isInteger(territoryId) || territoryId <= 0) {
    throw new Error('territory_id is required.');
  }

  const inserted = await client.query(
    `INSERT INTO customers (
       branch_id, assigned_sales_agent_id, territory_id,
       first_name, middle_name, last_name, mothers_maiden_name, civil_status, address,
       address_region, address_province, address_city, address_barangay, address_street, address_zip,
       latitude, longitude, contact_phone,
       contact_person_fname, contact_person_mname, contact_person_lname, contact_person_phone, contact_person_relationship,
       status, id_type, id_number, id_photo, id_verification_status,
       customer_type, business_name, registration_profile_json, source_assignment_id,
       territory_override_note, estimated_monthly_revenue, estimated_monthly_expenses, existing_obligations
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
       'Active',$24,$25,$26,'Unverified',$27,$28,$29::jsonb,$30,$31,$32,$33,$34
     )
     RETURNING customer_id, created_at`,
    [
      user.branchId,
      user.id,
      territoryId,
      first,
      cleanText(payload.middle_name, 80) || null,
      last,
      cleanText(payload.mothers_maiden_name, 120) || null,
      cleanText(payload.civil_status, 30) || null,
      cleanText(payload.address, 500),
      cleanText(payload.address_region, 100) || null,
      cleanText(payload.address_province, 100) || null,
      cleanText(payload.address_city, 100) || null,
      cleanText(payload.address_barangay, 100) || null,
      cleanText(payload.address_street, 150) || null,
      cleanText(payload.address_zip, 20) || null,
      payload.latitude != null ? Number(payload.latitude) : null,
      payload.longitude != null ? Number(payload.longitude) : null,
      phone,
      cleanText(payload.contact_person_fname, 80),
      cleanText(payload.contact_person_mname, 80) || null,
      cleanText(payload.contact_person_lname, 80),
      cleanText(payload.contact_person_phone, 40),
      cleanText(payload.contact_person_relationship, 80),
      cleanText(payload.id_type, 80) || null,
      cleanText(payload.id_number, 80) || null,
      typeof payload.id_photo === 'string' ? payload.id_photo : null,
      cleanText(payload.customer_type, 20) || 'Individual',
      cleanText(payload.business_name, 200) || null,
      JSON.stringify(payload.registration_profile || {}),
      Number(payload.source_assignment_id) > 0 ? Number(payload.source_assignment_id) : null,
      cleanText(payload.territory_override_note, 500) || null,
      payload.estimated_monthly_revenue != null ? Number(payload.estimated_monthly_revenue) : null,
      payload.estimated_monthly_expenses != null ? Number(payload.estimated_monthly_expenses) : null,
      payload.existing_obligations != null ? Number(payload.existing_obligations) : null,
    ]
  );

  const customerId = inserted.rows[0].customer_id;
  const code = `C-${String(customerId).padStart(3, '0')}-${new Date(inserted.rows[0].created_at).getFullYear()}`;
  await client.query(`UPDATE customers SET customer_code = $1 WHERE customer_id = $2`, [code, customerId]);
  await client.query(
    `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume)
     VALUES ($1, 0, 0) ON CONFLICT (customer_id) DO NOTHING`,
    [customerId]
  );

  let ciId = null;
  if (payload.request_credit) {
    const created = await createCreditReview(client, {
      customerId,
      branchId: user.branchId,
      submittedBy: user.id,
      requestReason: cleanText(payload.credit_request_reason, 120) || 'First installment',
      requestedCreditLimit: payload.requested_credit_limit,
      requestRemarks: cleanText(payload.credit_request_remarks) || 'Synced offline registration credit request.',
    });
    ciId = created.row?.ci_id || null;
  }

  return {
    kind: 'customer',
    customerId,
    ciId,
    summary: { ...payload, customer_id: customerId, customer_code: code, ci_id: ciId },
    message: ciId
      ? `Customer synced. Credit investigation #${ciId} submitted for Branch Manager review.`
      : 'Customer registration synced.',
  };
}

async function applyRecord(client, user, tableName, payload) {
  if (tableName === FIELD_REPORT) {
    const reportId = await applyFieldReport(client, user, payload);
    return { kind: 'report', reportId, summary: { ...payload, report_id: reportId }, message: 'Field report synced.' };
  }
  if (tableName === COLLECTION) {
    const applied = await applyCollectionPayment(client, user, payload);
    return {
      kind: 'payment',
      ...applied,
      summary: { ...payload, collectionpayment_id: applied.payment.collectionpayment_id },
      message: 'Collection synced.',
    };
  }
  if (tableName === SALE) {
    const applied = await applySalesInvoice(client, user, payload);
    return {
      kind: 'invoice',
      ...applied,
      summary: { ...payload, sales_invoices_id: applied.invoiceId, invoice_number: applied.invoiceNumber },
      message: 'Sale synced.',
    };
  }
  if (tableName === CUSTOMER_REG) {
    return applyCustomerRegistration(client, user, payload);
  }
  throw new Error('This record type is not accepted by the sync queue.');
}

async function afterCommit(pool, applied) {
  if (!applied) return;
  if (applied.kind === 'payment') {
    if (applied.remainingBalance === 0) await clearOverdueDedup(pool, applied.customerId);
    await notifyOverdueAccounts(pool);
  }
  if (applied.kind === 'invoice') {
    await publishStockAlerts(pool, applied.stockAlerts);
    await notifyOverdueAccounts(pool);
    await notifyInvoicePendingReview(pool, {
      branchId: applied.branchId,
      invoiceNumber: applied.invoiceNumber,
      customerId: applied.customerId,
      agentId: applied.agentId,
    });
  }
}

async function acceptOne(pool, user, deviceId, record) {
  const localId = cleanText(record?.localId, 100);
  const tableName = cleanText(record?.tableName, 50);
  if (!localId || !tableName) {
    return { localId: localId || null, syncStatus: 'Failed', message: 'localId and tableName are required.' };
  }
  if (![FIELD_REPORT, COLLECTION, SALE, CUSTOMER_REG].includes(tableName)) {
    const failed = await markFailed(pool, user, deviceId, tableName, localId, record.payload, 'This record type is not accepted by the sync queue.');
    return failed;
  }

  const client = await pool.connect();
  let applied = null;
  try {
    await client.query('BEGIN');
    const claim = await claimQueueRow(client, user, deviceId, tableName, localId, record.payload);
    if (claim.alreadySynced) {
      await client.query('COMMIT');
      return {
        localId,
        syncQueueId: claim.queueId,
        syncStatus: 'Synced',
        message: 'Already synced.',
      };
    }
    if (!claim.queueId) throw new Error('The sync queue could not store this record.');
    applied = await applyRecord(client, user, tableName, record.payload);
    await finishSynced(client, claim.queueId, deviceId, applied.summary);
    await client.query('COMMIT');
    try {
      await afterCommit(pool, applied);
    } catch (notifyError) {
      console.error('[Sync] post-commit notice failed:', notifyError.message);
    }
    return {
      localId,
      syncQueueId: claim.queueId,
      syncStatus: 'Synced',
      reportId: applied.reportId,
      collectionPaymentId: applied.payment?.collectionpayment_id,
      invoiceNumber: applied.invoiceNumber,
      message: applied.message,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
    if (error.code === '23505') {
      const existing = await findExisting(pool, user.id, tableName, localId);
      if (existing?.sync_status === 'Synced') {
        return { localId, syncQueueId: existing.sync_queue_id, syncStatus: 'Synced', message: 'Already synced.' };
      }
      return {
        localId,
        syncQueueId: existing?.sync_queue_id,
        syncStatus: 'Pending',
        message: 'This record is already syncing.',
      };
    }
    try {
      const failed = await markFailed(
        pool,
        user,
        deviceId,
        tableName,
        localId,
        record.payload,
        error.message || 'Sync failed.'
      );
      return { ...failed, conflict: Boolean(error.conflict) };
    } catch (writeError) {
      return {
        localId,
        syncStatus: 'Failed',
        conflict: Boolean(error.conflict),
        message: writeError.message || error.message || 'Sync failed.',
      };
    }
  } finally {
    client.release();
  }
}

export async function acceptOfflineBatch(pool, user, { deviceId, records }) {
  const safeDevice = cleanText(deviceId, 100) || null;
  const batch = Array.isArray(records) ? records.slice(0, 20) : [];
  const results = [];
  for (const record of batch) {
    results.push(await acceptOne(pool, user, safeDevice, record));
  }
  return results;
}

export async function listOfflineQueue(pool, userId) {
  const result = await pool.query(
    `SELECT sync_queue_id, table_name, record_reference, sync_status,
            attempted_at, synced_at, created_at, device_id
     FROM offline_sync_queue
     WHERE user_id = $1
     ORDER BY sync_queue_id DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows.map((row) => ({
    syncQueueId: row.sync_queue_id,
    tableName: row.table_name,
    recordReference: row.record_reference,
    syncStatus: row.sync_status,
    attemptedAt: row.attempted_at,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    deviceId: row.device_id,
  }));
}
