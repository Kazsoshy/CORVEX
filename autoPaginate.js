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
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file}`);
    return;
  }
  
  let code = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Add imports if needed
  if (!code.includes('usePagination')) {
    code = `import { usePagination } from '../../hooks/usePagination';\nimport { Pagination } from '../shared/Pagination';\n` + code;
    changed = true;
  }

  // Find all arrays being mapped inside tbody
  // Pattern: <tbody> ... {arrayName.map( ... )} ... </tbody>
  // We'll replace {arrayName.map( -> {paginated_arrayName.map(
  // And we need to inject: const pagination_arrayName = usePagination(arrayName); const paginated_arrayName = pagination_arrayName.paginatedData;
  // into the component.
  
  // Actually, doing this with regex is prone to error.
  // Instead, I'll log which arrays are used in which components and generate specific replacements.
});

console.log("Done");
