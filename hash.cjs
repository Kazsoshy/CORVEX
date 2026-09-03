const bcrypt = require('bcryptjs');

const passwords = [
  'SuperAdmin@2026',
  'OpManager@2026',
  'BranchManager@2026',
  'Sales@2026',
  'Collector@2026',
  'Inventory@2026'
];

async function generate() {
  for (const p of passwords) {
    const hash = await bcrypt.hash(p, 12);
    console.log(`${p}: ${hash}`);
  }
}

generate();
