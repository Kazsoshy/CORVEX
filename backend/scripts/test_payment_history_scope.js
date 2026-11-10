/**
 * Syntax/smoke checks for Payment History API helpers.
 * Run: node backend/scripts/test_payment_history_scope.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsPath = path.join(__dirname, '../routes/reports.js');
const authPath = path.join(__dirname, '../middleware/auth.js');

const reports = fs.readFileSync(reportsPath, 'utf8');
const auth = fs.readFileSync(authPath, 'utf8');

assert.ok(reports.includes('function creditHistoryScope'), 'creditHistoryScope helper present');
assert.ok(reports.includes("router.get('/credit-history/:id'"), 'direct detail endpoint present');
assert.ok(reports.includes('assigned_sales_agent_id'), 'sales portfolio scope present');
assert.ok(reports.includes('cp.branch_id = c.branch_id'), 'payment/customer branch consistency');
assert.ok(!reports.includes('LIMIT 1000`;\n      params\n    );\n\n    const found'), 'no fetch-all detail search');
assert.ok(auth.includes("creditHistory: ['super_admin', 'operating_manager', 'branch_manager', 'sales_staff']"), 'inventory_staff removed from creditHistory');
assert.ok(reports.includes('isCreditHistoryPath'), 'detail path authorized via creditHistory roles');

console.log('PASS payment history scope/security checks');
