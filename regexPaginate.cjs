const fs = require('fs');
const path = require('path');

const files = [
  'src/components/admin/AdminPageBody.jsx',
  'src/components/branchManager/BranchManagerPageBody.jsx',
  'src/components/collector/CollectorPageBody.jsx',
  'src/components/customer/CustomerPageBody.jsx',
  'src/components/operatingManager/OperatingManagerPageBody.jsx',
  'src/components/sales/InvoiceDetailsPage.jsx',
  'src/components/sales/SalesPageBody.jsx',
  'src/components/shared/CreditHistoryPages.jsx',
  'src/components/superAdmin/SuperAdminPageBody.jsx',
  'src/components/warehouse/WarehousePageBody.jsx',
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let code = fs.readFileSync(filePath, 'utf8');
  let originalCode = code;
  let modified = false;

  const functionRegex = /function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
  let match;
  
  const parts = [];
  while ((match = functionRegex.exec(code)) !== null) {
    parts.push({
      name: match[1],
      start: match.index,
      declarationLength: match[0].length
    });
  }

  if (parts.length === 0) return;

  for (let i = 0; i < parts.length; i++) {
    const start = parts[i].start;
    const end = i < parts.length - 1 ? parts[i+1].start : code.length;
    let funcBody = code.substring(start, end);
    let originalFuncBody = funcBody;

    const tbodyRegex = /<tbody>([\s\S]*?)<\/tbody>/g;
    let tbodyMatch;
    let arraysToPaginate = [];
    
    while ((tbodyMatch = tbodyRegex.exec(funcBody)) !== null) {
      const tbodyContent = tbodyMatch[1];
      const mapRegex = /\{?([a-zA-Z0-9_]+)\.map\s*\(/;
      const mapMatch = mapRegex.exec(tbodyContent);
      
      if (mapMatch) {
        const arrayName = mapMatch[1];
        if (arrayName.startsWith('paginated') && arrayName !== 'paginatedData') continue;
        
        arraysToPaginate.push(arrayName);
        const newTbodyContent = tbodyContent.replace(new RegExp(`\\b${arrayName}\\.map\\s*\\(`, 'g'), `paginated_${arrayName}.map(`);
        funcBody = funcBody.replace(tbodyContent, newTbodyContent);
      }
    }
    
    arraysToPaginate = [...new Set(arraysToPaginate)];
    
    arraysToPaginate.forEach(arrayName => {
      const wrapperRegex = new RegExp(`(<div className="corvex-table-wrapper">[\\s\\S]*?paginated_${arrayName}\\.map[\\s\\S]*?</table>\\s*</div>)`, 'g');
      funcBody = funcBody.replace(wrapperRegex, (match) => {
        return `${match}\n        <Pagination {...pagination_${arrayName}} />`;
      });
      
      // FIX: Inject exactly after `) {` of the function signature!
      const sigMatch = funcBody.match(/function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{/);
      if (sigMatch) {
        const insertIdx = sigMatch.index + sigMatch[0].length;
        const hookCode = `\n  const pagination_${arrayName} = usePagination(${arrayName});\n  const paginated_${arrayName} = pagination_${arrayName}.paginatedData;`;
        funcBody = funcBody.slice(0, insertIdx) + hookCode + funcBody.slice(insertIdx);
      }
    });

    if (funcBody !== originalFuncBody) {
      modified = true;
      code = code.replace(originalFuncBody, funcBody);
    }
  }

  if (modified) {
    if (!code.includes('usePagination')) {
      code = `import { usePagination } from '../../hooks/usePagination';\nimport { Pagination } from '../shared/Pagination';\n` + code;
    }
    fs.writeFileSync(filePath, code);
    console.log(`Updated ${file}`);
  }
});
