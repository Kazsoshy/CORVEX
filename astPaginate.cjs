const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const parser = require('@babel/parser');

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

    let needsPagination = false;
    let hasPaginationImport = false;
    
    // Check existing imports
    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value.includes('usePagination')) {
          hasPaginationImport = true;
        }
      }
    });

    const componentsToPaginate = new Map(); // Map<FunctionPath, Array<String>>

    traverse(ast, {
      JSXElement(jsxPath) {
        const opening = jsxPath.node.openingElement;
        
        // Find <div className="corvex-table-wrapper">
        if (opening.name.name === 'div') {
          const classNameAttr = opening.attributes.find(attr => attr.name && attr.name.name === 'className');
          if (classNameAttr && classNameAttr.value && classNameAttr.value.value === 'corvex-table-wrapper') {
            
            // Search inside for <tbody> and .map
            jsxPath.traverse({
              JSXElement(tbodyPath) {
                if (tbodyPath.node.openingElement.name.name === 'tbody') {
                  
                  // Look for CallExpression .map inside
                  tbodyPath.traverse({
                    CallExpression(callPath) {
                      const callee = callPath.node.callee;
                      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property, { name: 'map' })) {
                        // Found a map call!
                        const arrayNode = callee.object;
                        if (t.isIdentifier(arrayNode)) {
                          const arrayName = arrayNode.name;
                          // If we already manually paginated it (e.g. paginatedUsers), skip it
                          if (arrayName.startsWith('paginated') && arrayName !== 'paginatedData') return;
                          
                          needsPagination = true;

                          // 1. Replace arrayName with paginated_arrayName
                          const paginatedName = `paginated_${arrayName}`;
                          callPath.get('callee.object').replaceWith(t.identifier(paginatedName));

                          // 2. Find parent component function
                          const componentFunc = jsxPath.findParent(p => p.isFunctionDeclaration() || p.isArrowFunctionExpression());
                          if (componentFunc) {
                            if (!componentsToPaginate.has(componentFunc)) {
                              componentsToPaginate.set(componentFunc, new Set());
                            }
                            componentsToPaginate.get(componentFunc).add(arrayName);
                          }

                          // 3. Append <Pagination {...pagination_arrayName} /> after this div
                          jsxPath.insertAfter(
                            t.jsxElement(
                              t.jsxOpeningElement(t.jsxIdentifier('Pagination'), [
                                t.jsxSpreadAttribute(t.identifier(`pagination_${arrayName}`))
                              ], true),
                              null,
                              []
                            )
                          );
                          // Prevent infinite loop by stopping traversal in this tbody
                          callPath.stop();
                        }
                      }
                    }
                  });
                }
              }
            });
          }
        }
      }
    });

    if (needsPagination) {
      // Inject hooks into components
      componentsToPaginate.forEach((arrays, componentFunc) => {
        arrays.forEach(arrayName => {
          const body = componentFunc.get('body');
          if (body.isBlockStatement()) {
            const hookCall1 = parser.parse(`const pagination_${arrayName} = usePagination(${arrayName});`).program.body[0];
            const hookCall2 = parser.parse(`const paginated_${arrayName} = pagination_${arrayName}.paginatedData;`).program.body[0];
            body.unshiftContainer('body', [hookCall1, hookCall2]);
          }
        });
      });

      // Inject imports if not present
      if (!hasPaginationImport) {
        const import1 = parser.parse(`import { usePagination } from '../../hooks/usePagination';`).program.body[0];
        const import2 = parser.parse(`import { Pagination } from '../shared/Pagination';`).program.body[0];
        ast.program.body.unshift(import1, import2);
      }

      const output = generate(ast, {}, code);
      fs.writeFileSync(filePath, output.code);
      console.log(`Updated ${file}`);
    } else {
      console.log(`No pagination needed for ${file}`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err);
  }
});
