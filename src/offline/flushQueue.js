import apiClient from '../api/apiClient.js';
import { isBrowserOnline } from './connection.js';
import { listOfflineRecords, updateOfflineRecord } from './db.js';
import { isAutoSyncEnabledForCurrentUser } from './prefs.js';

const DEVICE_KEY = 'corvex_device_id';

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function flushOfflineQueue({ manual = false } = {}) {
  if (!isBrowserOnline()) return { skipped: true, reason: 'offline' };
  if (!localStorage.getItem('corvex_token')) return { skipped: true, reason: 'signed-out' };
  if (!manual && !isAutoSyncEnabledForCurrentUser()) return { skipped: true, reason: 'autosync-off' };

  const pending = (await listOfflineRecords()).filter((row) => {
    if (row.status === 'Pending') return true;
    if (row.status !== 'Failed') return false;
    return manual || (row.attempts || 0) < 3;
  });
  if (!pending.length) return { flushed: 0, results: [] };

  const results = [];
  for (const row of pending) {
    try {
      const response = await apiClient.post('/sync/queue', {
        deviceId: deviceId(),
        records: [{
          localId: row.localId,
          tableName: row.tableName,
          payload: row.payload,
          createdAt: row.createdAt,
        }],
      });
      const outcome = response.data?.results?.[0];
      if (outcome?.syncStatus === 'Failed') {
        await updateOfflineRecord(row.localId, {
          status: 'Failed',
          attempts: (row.attempts || 0) + 1,
          lastError: outcome.message || 'Sync failed.',
        });
      } else if (outcome?.syncStatus && outcome.syncStatus !== 'Pending') {
        await updateOfflineRecord(row.localId, { status: outcome.syncStatus, lastError: '' });
      }
      results.push(outcome || { localId: row.localId, syncStatus: 'Failed' });
    } catch {
      results.push({ localId: row.localId, syncStatus: 'Pending', message: 'Still waiting to reach the server.' });
    }
  }
  return { flushed: results.length, results };
}
