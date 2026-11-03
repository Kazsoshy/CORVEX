/**
 * CORVEX automatic security monitor.
 * Runs in the API process so detection continues whether or not an admin
 * has the Security Monitoring page open (and while admins are logged out).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeFailedLogins,
  assessInsecureConfiguration,
} from './detectors.js';
import { runDependencyVulnerabilityAudit } from './dependencyAudit.js';
import { scanUploadDirectory } from './malwareScanner.js';
import { updateMonitorHealth } from './eventStore.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function ensureSecurityTables(pool) {
  const migrationPath = path.join(ROOT, 'migrations', '051_security_monitoring.sql');
  if (!fs.existsSync(migrationPath)) return;
  const sql = fs.readFileSync(migrationPath, 'utf8');
  // Strip BEGIN/COMMIT for idempotent ensure
  const body = sql.replace(/^\s*BEGIN\s*;/i, '').replace(/\s*COMMIT\s*;\s*$/i, '');
  await pool.query(body);
}

function schedule(label, intervalMs, work, { runImmediately = true } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await work();
    } catch (err) {
      console.error(`[SecurityMonitor] ${label}:`, err.message);
    } finally {
      running = false;
    }
  };
  if (runImmediately) run();
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

export async function startSecurityMonitor(pool) {
  try {
    await ensureSecurityTables(pool);
  } catch (err) {
    console.error('[SecurityMonitor] Failed to ensure schema:', err.message);
  }

  console.log('🛡️  CORVEX Security Monitor started (background)');

  const stoppers = [];

  // Auth / audit correlation every 2 minutes
  stoppers.push(
    schedule('auth-audit', 2 * 60 * 1000, async () => {
      try {
        await analyzeFailedLogins(pool);
      } catch (err) {
        await updateMonitorHealth(pool, 'audit_analyzer', 'Unavailable', err.message);
        await updateMonitorHealth(pool, 'auth_monitor', 'Unavailable', err.message);
        throw err;
      }
    })
  );

  // Upload directory malware sweep every 10 minutes
  stoppers.push(
    schedule('file-scan', 10 * 60 * 1000, async () => {
      try {
        await scanUploadDirectory(pool);
      } catch (err) {
        await updateMonitorHealth(pool, 'file_scanner', 'Unavailable', err.message);
        throw err;
      }
    })
  );

  // Configuration assessment every 30 minutes
  stoppers.push(
    schedule('config', 30 * 60 * 1000, async () => {
      try {
        await assessInsecureConfiguration(pool);
      } catch (err) {
        await updateMonitorHealth(pool, 'config_assessment', 'Unavailable', err.message);
        throw err;
      }
    })
  );

  // Dependency vulnerability audit every 6 hours (also once shortly after boot)
  stoppers.push(
    schedule(
      'deps',
      6 * 60 * 60 * 1000,
      async () => {
        try {
          await runDependencyVulnerabilityAudit(pool);
        } catch (err) {
          await updateMonitorHealth(pool, 'dependency_audit', 'Unavailable', err.message);
          throw err;
        }
      },
      { runImmediately: false }
    )
  );
  // Delay first npm audit so boot is not blocked
  setTimeout(() => {
    runDependencyVulnerabilityAudit(pool).catch((err) => {
      console.error('[SecurityMonitor] initial dependency audit:', err.message);
    });
  }, 20_000).unref?.();

  return () => stoppers.forEach((stop) => stop());
}
