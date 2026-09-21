const fs = require('fs');
let content = fs.readFileSync('src/components/sales/SalesPageBody.jsx', 'utf8');
let newContent = content.replace(/<button className="button secondary" type="button" onClick=\{\(\) => \{\}\}>Export Data<\/button>/g, '<button className="button secondary" type="button" onClick={() => showToast(\'Export initiated.\', \'success\')}>Export Data</button>');
if (content !== newContent) {
  fs.writeFileSync('src/components/sales/SalesPageBody.jsx', newContent);
  console.log('Successfully replaced Export Data buttons');
} else {
  console.log('No matches found for Export Data replacement.');
}
