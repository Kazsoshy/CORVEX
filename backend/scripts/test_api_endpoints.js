const userId = process.argv[2] || '4';

const endpoints = [
  '/api/branch-manager/staff',
  '/api/branch-manager/customers',
  '/api/branch-manager/analytics',
  '/api/branch-manager/alerts',
  '/api/reports/collection',
  '/api/reports/sales',
  '/api/reports/inventory',
  '/api/reports/delinquency',
  '/api/reports/compliance',
  '/api/reports/kpi',
  '/api/reports/invoices',
  '/api/territories?search=',
];

for (const path of endpoints) {
  try {
    const res = await fetch(`http://localhost:5000${path}`, {
      headers: { 'X-User-Id': userId },
    });
    const body = await res.text();
    console.log(`${res.status} ${path}${res.status >= 400 ? ` -> ${body.slice(0, 120)}` : ''}`);
  } catch (err) {
    console.log(`ERR ${path} -> ${err.message}`);
  }
}
