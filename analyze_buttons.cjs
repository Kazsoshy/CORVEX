const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let emptyOnClick = 0;
let missingOnClick = 0;
let duplicateLabels = 0;
let totalButtons = 0;
let filesWithIssues = new Set();
let allButtonLabels = {};

walkDir('src/components', (filePath) => {
  if (filePath.endsWith('.jsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find all <button> elements. Using a regex that captures the inner content as well is tricky.
    // Let's just find the tags first.
    let buttons = content.match(/<button[^>]*>/g) || [];
    totalButtons += buttons.length;
    
    buttons.forEach(btn => {
      if (!btn.includes('onClick=')) {
        if (!btn.includes('type="submit"') && !btn.includes("type='submit'")) {
          missingOnClick++;
          filesWithIssues.add(filePath);
        }
      } else {
        if (btn.match(/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/) || 
            btn.match(/onClick=\{[^}]*console\.log[^}]*\}/) || 
            btn.match(/onClick=\{[^}]*alert\([^}]*\)\s*\}/) ||
            btn.match(/onClick=\{[^}]*\/\*[^}]*\*\/[^}]*\}/)) { // empty comment block
          emptyOnClick++;
          filesWithIssues.add(filePath);
        }
      }
    });

    // Let's try to find obvious duplicate button texts in the same file
    // Match <button ...>TEXT</button>
    let buttonRegex = /<button[^>]*>([^<]+)<\/button>/g;
    let match;
    let localLabels = [];
    while ((match = buttonRegex.exec(content)) !== null) {
      let label = match[1].trim();
      if (label && label.length > 1) {
        localLabels.push(label);
      }
    }
    
    // Check for duplicates in localLabels
    let counts = {};
    localLabels.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    for (let l in counts) {
      if (counts[l] > 1) {
        if (l !== 'Cancel' && l !== 'Save' && l !== 'Close' && l !== 'Logout' && l !== 'Edit' && l !== 'Delete' && l !== 'Submit') {
           // Common buttons might be repeated in different rows. 
           // But if it's "Add New Product" repeated, it's weird.
           // console.log(`Duplicate label '${l}' in ${filePath}`);
        }
      }
    }
  }
});

console.log(`Total buttons found: ${totalButtons}`);
console.log(`Buttons with missing onClick (and not type=submit): ${missingOnClick}`);
console.log(`Buttons with empty/console/alert onClick: ${emptyOnClick}`);
console.log('Files with potential missing/empty handlers:', Array.from(filesWithIssues));
