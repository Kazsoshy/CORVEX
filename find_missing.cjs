const fs = require('fs');
let content = fs.readFileSync('src/components/warehouse/WarehousePageBody.jsx', 'utf8');
let idx = -1;
while ((idx = content.indexOf('<button', idx + 1)) !== -1) {
  let endIdx = content.indexOf('>', idx);
  let tag = content.substring(idx, endIdx + 1);
  if (!tag.includes('onClick') && !tag.includes('type="submit"') && !tag.includes("type='submit'")) {
    console.log('Found missing onClick at char ' + idx + ': ', tag);
  }
}
