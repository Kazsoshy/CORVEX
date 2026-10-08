const fs = require('fs');
const path = require('path');
let content = fs.readFileSync(path.join(__dirname, '..', 'src/components/warehouse/WarehousePageBody.jsx'), 'utf8');
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if (line.includes('<button') && !line.includes('onClick') && !line.includes('type="submit"') && !line.includes("type='submit'")) {
    console.log('Line ' + (i+1) + ': ' + line.trim());
  }
}
