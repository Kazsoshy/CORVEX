const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

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
  
  const code = fs.readFileSync(filePath, 'utf8');

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });

    let modified = false;

    traverse(ast, {
      BlockStatement(path) {
        // We only care about function bodies
        if (!path.parentPath.isFunction()) return;

        const body = path.node.body;
        
        // Find all VariableDeclarations that call usePagination
        // or access .paginatedData
        const hookDecls = [];
        const nonHookDecls = [];

        for (let i = 0; i < body.length; i++) {
          const stmt = body[i];
          if (t.isVariableDeclaration(stmt)) {
            let isHook = false;
            for (const dec of stmt.declarations) {
              if (
                (t.isCallExpression(dec.init) && t.isIdentifier(dec.init.callee, { name: 'usePagination' })) ||
                (t.isMemberExpression(dec.init) && t.isIdentifier(dec.init.property, { name: 'paginatedData' }))
              ) {
                isHook = true;
                break;
              }
            }
            if (isHook) {
              hookDecls.push(stmt);
            } else {
              nonHookDecls.push(stmt);
            }
          } else {
            nonHookDecls.push(stmt);
          }
        }

        if (hookDecls.length > 0) {
          // We found pagination hooks!
          // We need to move them down past any useState, but before any useEffect, if, or return.
          // Let's find the optimal insertion index in the nonHookDecls.
          
          let insertIndex = 0;
          for (let i = 0; i < nonHookDecls.length; i++) {
            const stmt = nonHookDecls[i];
            
            // If we hit an if, return, loop, or useEffect/useCallback/useMemo, we MUST insert before it.
            if (
              t.isIfStatement(stmt) ||
              t.isReturnStatement(stmt) ||
              t.isForStatement(stmt) ||
              t.isWhileStatement(stmt) ||
              t.isExpressionStatement(stmt) // e.g. useEffect(...)
            ) {
              insertIndex = i;
              break;
            }
            
            // If it's a variable declaration, check if it's useState
            if (t.isVariableDeclaration(stmt)) {
              let isStateOrEffect = false;
              for (const dec of stmt.declarations) {
                if (t.isCallExpression(dec.init)) {
                  const calleeName = dec.init.callee.name;
                  if (calleeName && (calleeName === 'useEffect' || calleeName === 'useCallback' || calleeName === 'useMemo')) {
                    isStateOrEffect = true;
                    break;
                  }
                }
              }
              if (isStateOrEffect) {
                insertIndex = i;
                break;
              }
              
              // If it's just useState, we can safely insert AFTER it
              insertIndex = i + 1;
            }
          }

          // Rebuild the body array
          nonHookDecls.splice(insertIndex, 0, ...hookDecls);
          
          // Did it change?
          let changed = false;
          for (let i = 0; i < body.length; i++) {
            if (body[i] !== nonHookDecls[i]) {
              changed = true;
              break;
            }
          }

          if (changed) {
            path.node.body = nonHookDecls;
            modified = true;
          }
        }
      }
    });

    if (modified) {
      const output = generate(ast, {}, code);
      fs.writeFileSync(filePath, output.code);
      console.log(`Fixed TDZ in ${file}`);
    }
  } catch (err) {
    console.error(`Error in ${file}:`, err);
  }
});
