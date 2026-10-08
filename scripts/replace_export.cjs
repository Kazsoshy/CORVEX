const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, '..', 'src/components/sales/SalesPageBody.jsx');
let content = fs.readFileSync(target, 'utf8');
let newContent = content.replace(/<button className="button secondary" type="button" onClick=\{\(\) => \{\}\}>Export Data<\/button>/g, '<button className="button secondary" type="button" onClick={() => showToast(\'Export initiated.\', \'success\')}>Export Data</button>');
if (content !== newContent) {
  fs.writeFileSync(target, newContent);
  console.log('Successfully replaced Export Data buttons');
} else {
  console.log('No matches found for Export Data replacement.');
}
