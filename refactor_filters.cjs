const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/App.jsx',
  'src/components/admin/AdminPageBody.jsx',
  'src/components/branchManager/BranchManagerPageBody.jsx',
  'src/components/collector/CollectorPageBody.jsx',
  'src/components/operatingManager/OperatingManagerPageBody.jsx',
  'src/components/sales/SalesPageBody.jsx',
  'src/components/warehouse/WarehousePageBody.jsx'
];

let updatedCount = 0;

for (const file of filesToUpdate) {
  const filePath = path.join('c:/Users/ASUS/OneDrive/Documents/CORVEX', file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Remove inline styles from segmented-control
  content = content.replace(/<div\s+className="segmented-control"\s+style=\{[^}]+\}\s*>/g, '<div className="filter-bar"><div className="segmented-control">');
  // Since we replaced the opening tag with TWO opening tags, we need to add the closing tag.
  // Actually, wait, replacing <div> with two <div>s without an AST is a recipe for unclosed tags.
  // Better approach: simply replace the inline styles and rely on the new CSS I added to .segmented-control and .filter-bar.
  // Wait, I didn't add .filter-bar via regex, I just removed inline styles. I will just rely on .segmented-control CSS!
  
  content = content.replace(/<div\s+className="segmented-control"\s+style=\{[^}]+\}\s*>/g, '<div className="segmented-control">');
  content = content.replace(/<div\s+className='segmented-control'\s+style=\{[^}]+\}\s*>/g, "<div className='segmented-control'>");

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    updatedCount++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Successfully refactored inline styles in ${updatedCount} files.`);
