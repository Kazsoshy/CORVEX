const DB_NAME = 'corvex-offline';
const DB_VERSION = 1;
const STORE = 'records';

export function openOfflineDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'localId' });
        store.createIndex('byStatus', 'status');
        store.createIndex('byTable', 'tableName');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finish(db, tx, resolve, reject, value) {
  tx.oncomplete = () => {
    db.close();
    resolve(value);
  };
  tx.onerror = () => {
    db.close();
    reject(tx.error);
  };
  tx.onabort = () => {
    db.close();
    reject(tx.error || new Error('IndexedDB transaction aborted.'));
  };
}

export function saveOfflineRecord({ tableName, payload, localId }) {
  const record = {
    localId: localId || (globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`),
    tableName: String(tableName || ''),
    payload: payload ?? null,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };

  return openOfflineDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    finish(db, tx, resolve, reject, record);
  }));
}

export function updateOfflineRecord(localId, patch) {
  return openOfflineDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.get(localId);
    request.onsuccess = () => {
      const row = request.result;
      if (!row) {
        finish(db, tx, resolve, reject, null);
        return;
      }
      const next = { ...row, ...patch, localId: row.localId, updatedAt: new Date().toISOString() };
      store.put(next);
      finish(db, tx, resolve, reject, next);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  }));
}

export function updateOfflineRecordStatus(localId, status) {
  return updateOfflineRecord(localId, { status });
}

export function listOfflineRecords() {
  return openOfflineDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => finish(db, tx, resolve, reject, request.result || []);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  }));
}
