const fs = require('fs');

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
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Add imports if not present
  if (!content.includes('usePagination')) {
    content = `import { usePagination } from '../../hooks/usePagination';\nimport { Pagination } from '../shared/Pagination';\n` + content;
  }

  // We need to find each function component that contains a table.
  // This is too complex for regex.
});
