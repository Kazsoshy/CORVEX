/**
 * Smoke checks for shared operational-alert helpers (no DB required for unit bits).
 * Run: node backend/scripts/test_operational_alerts_desk.js
 */
import {
  categorizeAlertType,
  sortAlertsForDashboard,
  ALERT_CATEGORIES,
} from '../lib/operationalAlerts.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(categorizeAlertType('Field Incident') === 'Field Incident', 'field');
assert(categorizeAlertType('Inventory Stockout') === 'Inventory', 'stockout');
assert(categorizeAlertType('Inventory Stock Count Variance') === 'Inventory', 'count');
assert(categorizeAlertType('Delinquency Growth') === 'Delinquency', 'delinq');
assert(categorizeAlertType('Collection Disruption') === 'Collection', 'collection');
assert(categorizeAlertType('Sales Completion Decline') === 'Route Operations', 'route');
assert(categorizeAlertType('Mystery') === 'Other', 'other');
assert(ALERT_CATEGORIES.includes('Inventory'), 'categories');

const sorted = sortAlertsForDashboard([
  { severity: 'Warning', created_at: '2026-01-02' },
  { severity: 'Critical', created_at: '2026-01-03' },
  { severity: 'Critical', created_at: '2026-01-01' },
  { severity: 'Informational', created_at: '2026-01-01' },
]);
assert(sorted[0].severity === 'Critical' && sorted[0].created_at === '2026-01-01', 'critical oldest first');
assert(sorted[1].severity === 'Critical', 'second critical');
assert(sorted[2].severity === 'Warning', 'warning after critical');
assert(sorted[3].severity === 'Informational', 'info last');

console.log('operational alerts desk smoke checks passed');
