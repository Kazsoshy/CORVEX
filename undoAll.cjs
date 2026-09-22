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

  // 1. Remove imports
  code = code.replace(/import \{ usePagination \} from '\.\.\/\.\.\/hooks\/usePagination';\r?\n/g, '');
  code = code.replace(/import \{ Pagination \} from '\.\.\/shared\/Pagination';\r?\n/g, '');

  // 2. Remove injected hooks
  const hookRegex = /\s*const pagination_[a-zA-Z0-9_]+ = usePagination\([a-zA-Z0-9_]+\);\r?\n\s*const paginated_[a-zA-Z0-9_]+ = pagination_[a-zA-Z0-9_]+\.paginatedData;/g;
  code = code.replace(hookRegex, '');

  // 3. Revert paginated_ARRAY.map( to ARRAY.map(
  const mapRegex = /paginated_([a-zA-Z0-9_]+)\.map\(/g;
  code = code.replace(mapRegex, '$1.map(');

  // 4. Remove <Pagination {...pagination_ARRAY} />
  const paginationRegex = /\s*<Pagination \{\.\.\.pagination_[a-zA-Z0-9_]+\} \/>/g;
  code = code.replace(paginationRegex, '');

  // 5. Remove `<><div className="corvex-table-wrapper">` -> `<div className="corvex-table-wrapper">`
  code = code.replace(/<><div className="corvex-table-wrapper">/g, '<div className="corvex-table-wrapper">');

  // 6. Remove the trailing `</>` from the fragment wrap
  // Wait, I already ran undoFragment.cjs. But safeFragment.cjs might have left some `</>` behind?
  // Let's find any `</div></>` that shouldn't be there.
  // Actually, safeFragment.cjs wrapped the whole thing: `<><div...</div> <Pagination /></>`
  // Since we removed `<Pagination />`, we might have left `</>` behind.
  code = code.replace(/<\/div><\/>/g, '</div>');

  if (code !== originalCode) {
    fs.writeFileSync(filePath, code);
    console.log(`Restored ${file}`);
  }
});
