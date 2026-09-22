const fs = require('fs');
const path = require('path');

const files = [
  'src/components/admin/AdminPageBody.jsx',
  'src/components/branchManager/BranchManagerPageBody.jsx',
  'src/components/collector/CollectorPageBody.jsx',
  'src/components/customer/CustomerPageBody.jsx',
  'src/components/operatingManager/OperatingManagerPageBody.jsx',
  'src/components/sales/InvoiceDetailsPage.jsx',
  'src/components/sales/SalesPageBody.jsx',
  'src/components/shared/CreditHistoryPages.jsx',
  'src/components/superAdmin/SuperAdminPageBody.jsx',
  'src/components/warehouse/WarehousePageBody.jsx',
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let code = fs.readFileSync(filePath, 'utf8');
  let originalCode = code;

  // We want to safely wrap ONLY the table and its adjacent Pagination.
  // Using a negative lookahead ensures we don't swallow multiple tables.
  const safePattern = /(<div className="corvex-table-wrapper">(?:(?!<div className="corvex-table-wrapper">)[\s\S])*?<\/div>\s*<Pagination \{\.\.\.pagination_[a-zA-Z0-9_]+\} \/>)/g;
  
  code = code.replace(safePattern, (match) => {
    // Avoid double wrapping
    if (match.includes('<><div')) return match;
    return `<>${match}</>`;
  });

  if (code !== originalCode) {
    fs.writeFileSync(filePath, code);
    console.log(`Safely wrapped fragments in ${file}`);
  }
});
