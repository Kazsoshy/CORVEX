const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(path.join(__dirname, '..', 'src/components/warehouse/WarehousePageBody.jsx'), 'utf8');
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<button') && !lines[i].includes('onClick') && !lines[i].includes('type="submit"') && !lines[i].includes("type='submit'")) {
    console.log('Line ' + (i+1) + ': ' + lines[i].trim());
  }
}
