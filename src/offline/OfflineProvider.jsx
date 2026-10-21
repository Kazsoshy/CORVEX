import { useEffect, useState } from 'react';
import { isBrowserOnline, subscribeConnection } from './connection.js';
import { openOfflineDatabase } from './db.js';
import { flushOfflineQueue } from './flushQueue.js';
import { registerOfflineWorker } from './registerWorker.js';

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(isBrowserOnline);
  const [dbState, setDbState] = useState('opening');

  useEffect(() => subscribeConnection(setOnline), []);

  useEffect(() => {
    let cancelled = false;
    registerOfflineWorker();
    openOfflineDatabase()
      .then((db) => {
        db.close();
        if (!cancelled) setDbState('ready');
      })
      .catch(() => {
        if (!cancelled) setDbState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dbState !== 'ready' || !online) return undefined;
    const run = () => {
      flushOfflineQueue().catch(() => {});
    };
    run();
    window.addEventListener('focus', run);
    window.addEventListener('corvex-session-ready', run);
    return () => {
      window.removeEventListener('focus', run);
      window.removeEventListener('corvex-session-ready', run);
    };
  }, [dbState, online]);

  return (
    <div
      className={online ? 'offline-root' : 'offline-root is-offline'}
      data-connection={online ? 'online' : 'offline'}
      data-offline-db={dbState}
    >
      {online ? null : (
        <div className="offline-banner" role="status">
          Offline. Saved pages stay on this device, and local records stay in this browser.
        </div>
      )}
      {children}
    </div>
  );
}
