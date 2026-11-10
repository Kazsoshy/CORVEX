/**
 * Smoke checks for staff performance period helpers + route wiring.
 * Run: node backend/scripts/test_staff_performance_period.js
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { staffPerformancePeriodRange } from '../lib/staffPerformance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const week = staffPerformancePeriodRange('week');
assert.equal(week.period, 'week');
assert.equal(week.label, 'This Week');
assert.ok(week.start <= week.end);

const month = staffPerformancePeriodRange('month');
assert.equal(month.period, 'month');
assert.equal(month.label, 'This Month');
assert.ok(month.start.endsWith('-01'));
assert.ok(month.start <= month.end);

const bmRoutes = fs.readFileSync(path.join(__dirname, '../routes/branchManager.js'), 'utf8');
assert.match(bmRoutes, /router\.get\('\/staff-performance'/);
assert.doesNotMatch(bmRoutes, /avgVisitDuration:\s*'25 min'/);
assert.doesNotMatch(bmRoutes, /gpsAttendance:\s*true/);

const lib = fs.readFileSync(path.join(__dirname, '../lib/staffPerformance.js'), 'utf8');
assert.match(lib, /visit_type = 'Collection'/);
assert.match(lib, /visit_type = 'Sales'/);
assert.match(lib, /status = 'Completed'/);
assert.match(lib, /status = 'Confirmed'/);
assert.match(lib, /pctOrNull/);

console.log('staff performance period smoke checks passed');
