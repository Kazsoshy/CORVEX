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

  // We look for the mistaken injection:
  // function Name({
  //   const pagination_array = usePagination(array);
  //   const paginated_array = pagination_array.paginatedData; prop1... }) {
  
  // The regex to find this mistake:
  // It matches the exact strings we injected.
  
  const mistakeRegex = /\{\r?\n\s*const pagination_([a-zA-Z0-9_]+) = usePagination\([a-zA-Z0-9_]+\);\r?\n\s*const paginated_[a-zA-Z0-9_]+ = pagination_[a-zA-Z0-9_]+\.paginatedData;/g;
  
  let match;
  while ((match = mistakeRegex.exec(code)) !== null) {
    const injectedCode = match[0].substring(1); // Keep the { but remove it from extracted
    
    // We want to remove this injected block from where it is
    code = code.replace(match[0], '{');
    
    // Now we must find the end of the function signature `) {` that follows this `{`
    // Since we just replaced it, the `{` is at match.index
    const afterOpenBrace = match.index;
    const endOfSignature = code.indexOf(') {', afterOpenBrace);
    if (endOfSignature !== -1) {
      const insertPos = endOfSignature + 3; // after `) {`
      code = code.slice(0, insertPos) + injectedCode + code.slice(insertPos);
    }
  }

  // Also we might have injected multiple times for the same function, but `indexOf(') {')` would find the first one.
  // Wait, if a function had multiple arrays, `indexOf('{')` in my previous script found the FIRST `{` every time.
  // So all of them piled up at the first `{`.
  // The while loop will process them one by one, moving them to `) {`.
  // This should work perfectly.

  if (code !== originalCode) {
    fs.writeFileSync(filePath, code);
    console.log(`Fixed ${file}`);
  }
});
