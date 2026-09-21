const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/components/admin/AdminPageBody.jsx',
  'src/components/branchManager/BranchManagerPageBody.jsx',
  'src/components/collector/CollectorPageBody.jsx',
  'src/components/operatingManager/OperatingManagerPageBody.jsx',
  'src/components/sales/SalesPageBody.jsx',
  'src/components/warehouse/WarehousePageBody.jsx',
  'src/components/customer/CustomerPageBody.jsx',
  'src/components/shared/CreditHistoryPages.jsx',
];

let updatedCount = 0;

for (const file of filesToUpdate) {
  const filePath = path.join('c:/Users/ASUS/OneDrive/Documents/CORVEX', file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Function to replace select inputs
  content = content.replace(/<select([^>]*)>/g, (match, attrs) => {
    // Remove existing inline style
    let newAttrs = attrs.replace(/\sstyle=\{[^}]+\}/g, '');
    newAttrs = newAttrs.replace(/\sstyle=\{\{[^}]+\}\}/g, '');
    
    // Add className="filter-select" if it doesn't exist
    if (!newAttrs.includes('className=')) {
      newAttrs = ' className="filter-select"' + newAttrs;
    } else {
      // If it already has a className, replace it or append to it
      if (newAttrs.includes('className="')) {
        newAttrs = newAttrs.replace(/className="/, 'className="filter-select ');
      } else if (newAttrs.includes("className='")) {
        newAttrs = newAttrs.replace(/className='/, "className='filter-select ");
      }
    }
    return `<select${newAttrs}>`;
  });

  // Function to replace input type="search"
  content = content.replace(/<input([^>]*type=["']search["'][^>]*)>/g, (match, attrs) => {
    let newAttrs = attrs.replace(/\sstyle=\{[^}]+\}/g, '');
    newAttrs = newAttrs.replace(/\sstyle=\{\{[^}]+\}\}/g, '');
    
    if (!newAttrs.includes('className=')) {
      newAttrs = ' className="filter-input search"' + newAttrs;
    } else {
      newAttrs = newAttrs.replace(/className="[^"]*"/, 'className="filter-input search"');
      newAttrs = newAttrs.replace(/className='[^']*'/, "className='filter-input search'");
    }
    return `<input${newAttrs}>`;
  });

  // Function to replace input type="date"
  content = content.replace(/<input([^>]*type=["']date["'][^>]*)>/g, (match, attrs) => {
    let newAttrs = attrs.replace(/\sstyle=\{[^}]+\}/g, '');
    newAttrs = newAttrs.replace(/\sstyle=\{\{[^}]+\}\}/g, '');
    
    if (!newAttrs.includes('className=')) {
      newAttrs = ' className="filter-input"' + newAttrs;
    } else {
      newAttrs = newAttrs.replace(/className="[^"]*"/, 'className="filter-input"');
      newAttrs = newAttrs.replace(/className='[^']*'/, "className='filter-input'");
    }
    return `<input${newAttrs}>`;
  });

  // Since we also want to wrap standalone inputs/selects in .filter-bar,
  // we need to be careful. The previous script already left segmented-controls inside a flex-container or inline-toolbar in some places.
  // We'll leave the wrapping part alone for now because they are already within containers like .inline-toolbar, .filter-bar, or just raw inside a section.
  // The layout will be flex automatically due to `.filter-bar` that was partially addressed.
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    updatedCount++;
    console.log(`Updated ${file}`);
  }
}
console.log(`Successfully refactored inputs in ${updatedCount} files.`);
