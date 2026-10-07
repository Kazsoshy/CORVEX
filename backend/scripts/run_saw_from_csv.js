/**
 * Run the same SAW pipeline as sawmodel.ipynb against backend/data/saw_data_1000.csv
 *   node backend/scripts/run_saw_from_csv.js [collector_id] [as_of YYYY-MM-DD]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  filterEligibleRows,
  runSawPipeline,
} from '../lib/sawCollection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '..', 'data', 'saw_data_1000.csv');

const collectorId = Number(process.argv[2] || 7);
const asOf = process.argv[3] || '2026-09-28';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = cols[i]?.trim();
    });
    row.customer_id = Number(row.customer_id);
    row.collector_id = Number(row.collector_id);
    row.outstanding_balance = Number(row.outstanding_balance);
    row.cust_lat = Number(row.cust_lat);
    row.cust_lon = Number(row.cust_lon);
    row.branch_lat = Number(row.branch_lat);
    row.branch_lon = Number(row.branch_lon);
    row.invoice_status = row.invoices_status;
    row.due_date = row.due_date;
    return row;
  });
}

if (!fs.existsSync(csvPath)) {
  console.error('Missing', csvPath);
  process.exit(1);
}

const raw = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const eligible = filterEligibleRows(raw, collectorId);
const ranked = runSawPipeline(eligible, { asOfDate: asOf });

console.log('Collector', collectorId, '| AS_OF', asOf);
console.log('Raw:', raw.length, '| Eligible:', eligible.length, '| Ranked:', ranked.length);
console.log('Top 10:');
console.table(
  ranked.slice(0, 10).map((r) => ({
    rank: r.rank,
    customer_id: r.customer_id,
    balance: r.outstanding_balance,
    days_overdue: r.days_overdue,
    distance_km: r.distance_km,
    score: r.score,
  }))
);
