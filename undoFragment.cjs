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

  // We want to undo what fixFragment.cjs did:
  // It replaced matches of:
  // <div className="corvex-table-wrapper"> ... </div> \s* <Pagination {...pagination_XYZ} />
  // with:
  // <><div className="corvex-table-wrapper"> ... </div> \s* <Pagination {...pagination_XYZ} /></>
  
  // To undo this, we find `<><div className="corvex-table-wrapper">`
  // and remove the leading `<>` and trailing `</>`
  
  // Since we know exactly what it starts and ends with:
  const undoPattern = /<><div className="corvex-table-wrapper">([\s\S]*?)<\/div>\s*<Pagination \{\.\.\.pagination_[a-zA-Z0-9_]+\} \/><\/>/g;
  
  code = code.replace(undoPattern, (match, innerDivContent) => {
    // Remove the first 2 chars `<>` and the last 3 chars `</>`
    return match.slice(2, -3);
  });

  if (code !== originalCode) {
    fs.writeFileSync(filePath, code);
    console.log(`Undid fragments in ${file}`);
  }
});
