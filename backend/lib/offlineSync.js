import { applyCollectionPayment } from './collectionPayment.js';
import { clearOverdueDedup, notifyInvoicePendingReview, notifyOverdueAccounts, publishStockAlerts } from './operationalNotifications.js';
import { applySalesInvoice } from './salesInvoiceWrite.js';
import { SyncConflict } from './syncErrors.js';

const FIELD_REPORT = 'field_activity_reports';
const COLLECTION = 'collection_payment';
const SALE = 'sales_invoices';
const FIELD_ROLES = new Set(['collector', 'sales_staff']);

function cleanText(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return max ? text.slice(0, max) : text;
}

function fieldReportError(payload) {
  const visitId = Number(payload?.visit_id);
  const activity = cleanText(payload?.activity_type, 50);
  const remarks = cleanText(payload?.remarks);
  const photo = typeof payload?.photo === 'string' ? payload.photo.trim() : '';
  if (!Number.isFinite(visitId) || visitId <= 0) return 'visit_id is required.';
  if (!activity) return 'activity_type is required.';
  if (!remarks) return 'remarks are required.';
  if (!photo.startsWith('data:image/')) return 'photo must be a valid image upload.';
  if (photo.length > 900_000) return 'photo is too large. Use a smaller image.';
  return null;
}

async function applyFieldReport(client, user, payload) {
  if (!FIELD_ROLES.has(user.roleSlug)) {
    throw new Error('Only collector and sales reports can be synced.');
  }
  const problem = fieldReportError(payload);
  if (problem) throw new Error(problem);

  const visitId = Number(payload.visit_id);
  const visit = await client.query(
    `SELECT visit_id, status FROM field_visits WHERE visit_id = $1 AND user_id = $2`,
    [visitId, user.id]
  );
  if (!visit.rows.length) throw new Error('Visit not found for this user.');
  if (payload.visit_status && visit.rows[0].status !== payload.visit_status) {
    throw new SyncConflict('This visit changed on the server after the report was saved on the device.');
  }

  const inserted = await client.query(
    `INSERT INTO field_activity_reports (visit_id, user_id, activity_type, remarks, photo, sync_status)
     VALUES ($1, $2, $3, $4, $5, 'Synced')
     RETURNING report_id`,
    [
      visitId,
      user.id,
      cleanText(payload.activity_type, 50),
      cleanText(payload.remarks),
      payload.photo.trim(),
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
  if (![FIELD_REPORT, COLLECTION, SALE].includes(tableName)) {
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
