const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = [
  path.join(root, 'src/components/warehouse/WarehousePageBody.jsx'),
  path.join(root, 'src/components/superAdmin/SuperAdminPageBody.jsx'),
  path.join(root, 'src/components/sales/SalesPageBody.jsx'),
  path.join(root, 'src/components/customer/CustomerPageBody.jsx'),
  path.join(root, 'src/components/operatingManager/OperatingManagerPageBody.jsx'),
  path.join(root, 'src/components/branchManager/BranchManagerPageBody.jsx'),
  path.join(root, 'src/components/admin/AdminPageBody.jsx')
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('requestLogout')) {
    // Insert import at the top
    content = content.replace(/import.*?['"].*?['"];\n/, match => match + 'import { requestLogout } from \'../../api/authService\';\n');
  }

  // Find logout handlers
  content = content.replace(/else if\s*\(\s*a\.action\s*===\s*'logout'\s*\)\s*\{\s*showToast\('Logged out\.',\s*'success'\);\s*navigate\('\/login'\);\s*\}/g, 
    "else if (a.action === 'logout') { requestLogout(); }");
    
  content = content.replace(/if\s*\(\s*a\.action\s*===\s*'logout'\s*\)\s*navigate\('\/login'\);/g, 
    "if (a.action === 'logout') requestLogout();");
    
  content = content.replace(/if\s*\(\s*a\.label\s*===\s*'Logout'\s*\)\s*navigate\('\/login'\);/g, 
    "if (a.label === 'Logout') requestLogout();");

  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
}
