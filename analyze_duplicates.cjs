const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('src/components', (filePath) => {
  if (filePath.endsWith('.jsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find all <button> elements. Using a regex that captures the inner content as well is tricky.
    let buttonRegex = /<button[^>]*>(.*?)<\/button>/gs;
    let match;
    let localLabels = [];
    while ((match = buttonRegex.exec(content)) !== null) {
      let label = match[1].replace(/<[^>]+>/g, '').trim(); // strip inner HTML like icons
      if (label && label.length > 1) {
        localLabels.push(label);
      }
    }
    
    let counts = {};
    localLabels.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    let duplicates = [];
    for (let l in counts) {
      if (counts[l] > 1) {
        if (l !== 'Cancel' && l !== 'Save' && l !== 'Close' && l !== 'Logout' && l !== 'Edit' && l !== 'Delete' && l !== 'Submit' && l !== 'Search' && l !== 'View Details') {
           duplicates.push(`${l} (${counts[l]} times)`);
        }
      }
    }
    if (duplicates.length > 0) {
      console.log(`\n${filePath}:`);
      console.log(duplicates.join(', '));
    }
  }
});
