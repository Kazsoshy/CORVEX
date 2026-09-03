const fs = require('fs');
const path = require('path');

const files = [
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\admin\\AdminPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\branchManager\\BranchManagerPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\collector\\CollectorPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\customer\\CustomerPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\operatingManager\\OperatingManagerPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\sales\\SalesPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\superAdmin\\SuperAdminPageBody.jsx',
  'c:\\Users\\ASUS\\CORVEX\\src\\components\\warehouse\\WarehousePageBody.jsx'
];

const actionMap = {
  'Edit': { icon: 'edit' },
  'Disable': { icon: 'trash', danger: true },
  'Deactivate': { icon: 'trash', danger: true },
  'Remove': { icon: 'trash', danger: true },
  'Reject': { icon: 'close', danger: true },
  'View': { icon: 'view' },
  'Details': { icon: 'view' },
  'Open': { icon: 'view' },
  'Review': { icon: 'view' },
  'Approve': { icon: 'check' },
  'Download': { icon: 'download' },
  'Restore': { icon: 'history' },
  'Reset PW': { icon: 'reset' },
  'Count': { icon: 'count' },
  'Restock': { icon: 'restock' },
  'Transfer': { icon: 'transfer' },
  'Assign Manager': { icon: 'accounts' }
};

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace link-buttons
  content = content.replace(/<button\s+className="link-button"\s+type="button"\s*(style=\{.*?\})?\s*onClick=\{(.*?)\}\s*(disabled=\{.*?\})?\s*>([^<]+)<\/button>/g, (match, style, onClick, disabled, text) => {
    let mapping = actionMap[text] || { icon: 'view' };
    let dangerClass = mapping.danger ? ' danger' : '';
    let disabledAttr = disabled ? ` ${disabled}` : '';
    return `<button className="icon-action-button${dangerClass}" type="button" title="${text}" onClick={${onClick}}${disabledAttr}><NavIcon name="${mapping.icon}" /></button>`;
  });

  // Specifically handle SuperAdminPageBody inline statuses
  content = content.replace(/<span\s+style=\{\{\s*color:\s*(?:l\.status === 'Success' \? '#059669' : '#dc2626'|'#059669')\s*,.*?\s*\}\}\s*>\s*\{?([^}<]+)\}?\s*<\/span>/g, '<StatusBadge status={$1} />');
  
  // Replace <span className={`status-pill ...
  content = content.replace(/<span\s+className=\{`status-pill\s[^`]+`\}>\s*\{u\.status\}\s*<\/span>/g, '<StatusBadge status={u.status} />');
  
  // Replace <span className={`transfer-status ...
  content = content.replace(/<span\s+className=\{`transfer-status\s[^`]+`\}>\s*\{t\.status\}\s*<\/span>/g, '<StatusBadge status={t.status} />');
  
  // Replace StockStatusBadge
  content = content.replace(/<StockStatusBadge\s+status=\{([^}]+)\}\s*\/>/g, '<StatusBadge status={$1} />');

  // Specific hardcoded ones from earlier grep:
  content = content.replace(/<span\s+style=\{\{\s*color:\s*'#059669'.*?\}\}>\s*\{b\.status\}\s*<\/span>/g, '<StatusBadge status={b.status} />');
  content = content.replace(/<td\s+style=\{\{\s*color:\s*p\.status === 'Late' \? '#dc2626' : '#059669'.*?\}\}>\s*\{p\.status\}\s*<\/td>/g, '<td><StatusBadge status={p.status} /></td>');

  // Insert imports if there were changes
  if (content !== original) {
    if (!content.includes('NavIcon')) {
      content = content.replace(/import .*?;\n/, match => match + "import { NavIcon } from '../../navIcons';\n");
    }
    if (!content.includes('StatusBadge')) {
      content = content.replace(/import .*?;\n/, match => match + "import { StatusBadge } from '../StatusBadge';\n");
    }
    fs.writeFileSync(file, content);
    console.log('Refactored ' + file);
  }
}
