const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('c:/Users/ASUS/OneDrive/Documents/CORVEX/src/components');
let updatedCount = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const target = 'bg-mint rounded-[20px] p-[28px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-surface-2';
  const replacement = 'bg-mint rounded-xl p-[28px] shadow-card border border-surface-2 relative overflow-hidden';
  if (content.includes(target)) {
    content = content.split(target).join(replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
    updatedCount++;
  }
});
console.log(`Total files updated: ${updatedCount}`);
