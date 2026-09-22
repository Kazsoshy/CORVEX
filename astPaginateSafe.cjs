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
      plugins: [
        'jsx',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
        'classProperties'
      ]
    });

    let modified = false;

    // Track components and the arrays they need to paginate
    const componentToArrays = new Map();

    traverse(ast, {
      JSXElement(jsxPath) {
        const opening = jsxPath.node.openingElement;
        
        if (opening.name.name === 'div') {
          const classNameAttr = opening.attributes.find(attr => attr.name && attr.name.name === 'className');
          if (classNameAttr && classNameAttr.value && classNameAttr.value.value === 'corvex-table-wrapper') {
            
            let fullExpression = null;
            let cleanName = null;
            let mapCallPath = null;
            
            jsxPath.traverse({
              CallExpression(callPath) {
                const callee = callPath.node.callee;
                if (t.isMemberExpression(callee) && t.isIdentifier(callee.property, { name: 'map' })) {
                  const parentJSX = callPath.findParent(p => p.isJSXElement());
                  if (parentJSX && parentJSX.node.openingElement.name.name === 'tbody') {
                    
                    fullExpression = code.substring(callee.object.start, callee.object.end);
                    cleanName = fullExpression.replace(/[^a-zA-Z0-9_]/g, '_');
                    
                    if (cleanName.startsWith('paginated_')) return; // already paginated
                    
                    mapCallPath = callPath;
                    callPath.stop();
                  }
                }
              }
            });

            if (fullExpression && cleanName && mapCallPath) {
              modified = true;

              const componentPath = jsxPath.findParent(p => p.isFunctionDeclaration() || p.isArrowFunctionExpression());
              if (componentPath) {
                if (!componentToArrays.has(componentPath.node)) {
                  componentToArrays.set(componentPath.node, {
                    path: componentPath,
                    arrays: new Map()
                  });
                }
                componentToArrays.get(componentPath.node).arrays.set(cleanName, fullExpression);
              }

              // Replace array.map with paginated_array.map
              mapCallPath.get('callee.object').replaceWith(t.identifier(`paginated_${cleanName}`));

              const paginationElem = t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier('Pagination'), [
                  t.jsxSpreadAttribute(t.identifier(`pagination_${cleanName}`))
                ], true),
                null,
                []
              );
              
              const fragment = t.jsxFragment(
                t.jsxOpeningFragment(),
                t.jsxClosingFragment(),
                [
                  jsxPath.node,
                  paginationElem
                ]
              );
              
              jsxPath.replaceWith(fragment);
              jsxPath.skip(); 
            }
          }
        }
      }
    });

    if (modified) {
      componentToArrays.forEach((data, componentNode) => {
        const { path: componentPath, arrays } = data;
        const bodyPath = componentPath.get('body');
        
        if (bodyPath.isBlockStatement()) {
          const bodyArr = bodyPath.node.body;
          const hookStmts = [];
          
          arrays.forEach((expr, cleanName) => {
            const hook1 = parser.parse(`const pagination_${cleanName} = usePagination(${expr});`).program.body[0];
            const hook2 = parser.parse(`const paginated_${cleanName} = pagination_${cleanName}.paginatedData;`).program.body[0];
            hookStmts.push(hook1, hook2);
          });
          
          let insertIdx = bodyArr.length;
          for (let i = 0; i < bodyArr.length; i++) {
            const stmt = bodyArr[i];
            // Insert before first return, if, loop, switch
            if (t.isReturnStatement(stmt) || t.isIfStatement(stmt) || t.isSwitchStatement(stmt) || t.isForStatement(stmt) || t.isWhileStatement(stmt)) {
              insertIdx = i;
              break;
            }
          }
          
          bodyArr.splice(insertIdx, 0, ...hookStmts);
        }
      });

      let hasUsePagination = false;
      let hasPagination = false;
      traverse(ast, {
        ImportDeclaration(p) {
          if (p.node.source.value.includes('usePagination')) hasUsePagination = true;
          if (p.node.source.value.includes('Pagination')) hasPagination = true;
        }
      });

      if (!hasUsePagination) {
        const imp = parser.parse(`import { usePagination } from '../../hooks/usePagination';`, { sourceType: 'module' }).program.body[0];
        ast.program.body.unshift(imp);
      }
      if (!hasPagination) {
        const imp = parser.parse(`import { Pagination } from '../shared/Pagination';`, { sourceType: 'module' }).program.body[0];
        ast.program.body.unshift(imp);
      }

      const output = generate(ast, {}, code);
      fs.writeFileSync(filePath, output.code);
      console.log(`Successfully AST-paginated ${file}`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err);
  }
});
