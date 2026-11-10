/**
 * Smoke checks for BM inventory approval controls (auth matrix + status gates).
 * Run: node backend/scripts/test_inventory_approval_controls.js
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inventorySrc = fs.readFileSync(path.join(__dirname, '../routes/inventory.js'), 'utf8');

assert.match(inventorySrc, /INVENTORY_WRITER_ROLES\s*=\s*\['inventory_staff',\s*'super_admin'\]/);
assert.doesNotMatch(
  inventorySrc,
  /INVENTORY_WRITER_ROLES\s*=\s*\[[^\]]*operating_manager/
);
assert.match(inventorySrc, /Only warehouse staff at the source branch can ship/);
assert.match(inventorySrc, /Only warehouse staff at the destination branch can receive/);
assert.match(inventorySrc, /Managers approve only/);
assert.match(inventorySrc, /status === 'Shipped'/);
assert.match(inventorySrc, /'Received'/);

const approvalsSrc = fs.readFileSync(path.join(__dirname, '../routes/approvals.js'), 'utf8');
assert.match(approvalsSrc, /router\.get\('\/restocks'/);
assert.match(approvalsSrc, /router\.patch\('\/restocks\/:id'/);
assert.match(approvalsSrc, /router\.get\('\/stock-counts'/);
assert.match(approvalsSrc, /router\.patch\('\/stock-counts\/:id'/);
assert.match(approvalsSrc, /restocks_pending/);
assert.match(approvalsSrc, /stock_counts_pending/);
assert.match(approvalsSrc, /You cannot approve a restock you submitted/);
assert.match(approvalsSrc, /You cannot approve a stock count you submitted/);
assert.match(approvalsSrc, /postRestockStock/);
assert.match(approvalsSrc, /postStockCountAdjustments/);

const docsSrc = fs.readFileSync(path.join(__dirname, '../lib/inventoryDocuments.js'), 'utf8');
assert.match(docsSrc, /export async function shipTransferStock/);
assert.match(docsSrc, /export async function receiveTransferStock/);
assert.match(docsSrc, /export async function postRestockStock/);
assert.match(docsSrc, /export async function postStockCountAdjustments/);

const migrationPath = path.join(__dirname, '../migrations/065_inventory_approval_controls.sql');
assert.ok(fs.existsSync(migrationPath), 'migration 065 missing');

console.log('inventory approval controls smoke checks passed');
