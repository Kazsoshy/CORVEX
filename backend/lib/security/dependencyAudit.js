/**
 * Scheduled dependency vulnerability assessment via `npm audit --json`.
 * Uses the real npm advisory database — not fabricated CVEs.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { recordSecurityEvent, updateMonitorHealth } from './eventStore.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function runNpmAudit() {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['audit', '--json', '--omit=dev'],
      {
        cwd: PROJECT_ROOT,
        env: process.env,
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: 'npm audit timed out', data: null });
    }, 90_000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message, data: null });
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(stdout || '{}');
        resolve({ ok: true, error: null, data, stderr });
      } catch (err) {
        resolve({ ok: false, error: `Failed to parse npm audit JSON: ${err.message}`, data: null, stderr });
      }
    });
  });
}

function severityLabel(npmSeverity) {
  const s = String(npmSeverity || '').toLowerCase();
  if (s === 'critical') return 'Critical';
  if (s === 'high') return 'High';
  if (s === 'moderate' || s === 'medium') return 'Medium';
  return 'Low';
}

export async function runDependencyVulnerabilityAudit(pool) {
  await updateMonitorHealth(pool, 'dependency_audit', 'Active', 'Running npm audit…');

  const result = await runNpmAudit();
  if (!result.ok) {
    await updateMonitorHealth(pool, 'dependency_audit', 'Unavailable', result.error || 'npm audit failed');
    await recordSecurityEvent(pool, {
      eventKey: `dep-audit-failure:${new Date().toISOString().slice(0, 13)}`,
      threatType: 'Vulnerable or Outdated Dependencies',
      severity: 'Medium',
      title: 'Dependency vulnerability scan unavailable',
      description: `Scheduled npm audit could not complete: ${result.error}`,
      detectionMethod: 'npm audit integration',
      evidence: { error: result.error, stderr: result.stderr || null },
      affectedResource: 'package.json',
      autoAction: 'alerted',
    });
    return { ok: false, created: 0 };
  }

  const data = result.data || {};
  const vulns = data.vulnerabilities || {};
  const meta = data.metadata?.vulnerabilities || {};
  let created = 0;

  const entries = Object.entries(vulns).slice(0, 40);
  for (const [name, info] of entries) {
    const via = Array.isArray(info?.via) ? info.via : [];
    const advisory = via.find((v) => v && typeof v === 'object') || null;
    const sev = severityLabel(info?.severity || advisory?.severity);
    const title = advisory?.title || `Vulnerable dependency: ${name}`;
    const url = advisory?.url || null;
    const range = info?.range || advisory?.range || '';

    const out = await recordSecurityEvent(pool, {
      eventKey: `npm-vuln:${name}:${advisory?.source || info?.severity || 'x'}:${range}`.slice(0, 240),
      threatType: 'Vulnerable or Outdated Dependencies',
      severity: sev,
      title: String(title).slice(0, 200),
      description: `npm audit reported a ${sev.toLowerCase()} vulnerability in “${name}”${range ? ` (${range})` : ''}.${url ? ` Advisory: ${url}` : ''}`,
      detectionMethod: 'npm audit (advisory database)',
      evidence: {
        package: name,
        severity: info?.severity,
        range,
        via: via.slice(0, 5),
        fixAvailable: info?.fixAvailable || false,
        url,
      },
      affectedResource: name,
      autoAction: 'alerted',
    });
    if (out.created) created += 1;
  }

  const summary = `npm audit: critical=${meta.critical || 0}, high=${meta.high || 0}, moderate=${meta.moderate || 0}, low=${meta.low || 0}`;
  await updateMonitorHealth(pool, 'dependency_audit', 'Active', summary);
  return { ok: true, created, meta };
}
