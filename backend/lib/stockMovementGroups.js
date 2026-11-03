/**
 * Group stock_movements rows into source documents (restock / transfer / stock count / sale).
 * Individual movement rows stay in the DB; grouping is for list/detail presentation.
 */

export function parseMovementDocument(movement) {
  const ref = String(movement?.movement_ref || '').trim();
  const type = String(movement?.type || '').trim();
  const movementId = movement?.movement_id ?? movement?.id;

  // Restock:
  //   MOV-RST-2026-0001-12
  //   MOV-RST-LEGACY-3-12
  //   RST-0001 / RST-2026-0001 (legacy or simplified refs)
  let match = ref.match(/^MOV-(RST-.+)-(\d+)$/i)
    || ref.match(/^(RST-.+)$/i);
  if (match) {
    return {
      kind: 'restock',
      document_ref: match[1],
      group_key: `restock:${match[1]}`,
      display_type: 'Restock',
    };
  }
  if (type === 'Restock') {
    const documentRef = ref || `restock-${movementId}`;
    return {
      kind: 'restock',
      document_ref: documentRef,
      group_key: `restock:${documentRef}`,
      display_type: 'Restock',
    };
  }

  // Transfer:
  //   MOV-TRF-2026-0001-OUT-12 / MOV-TRF-2026-0001-IN-12
  //   MOV-TRF-2026-0001-OUT (seed without product id)
  match = ref.match(/^MOV-(TRF-.+)-(OUT|IN)-(\d+)$/i)
    || ref.match(/^MOV-(TRF-.+)-(OUT|IN)$/i);
  if (match) {
    const direction = match[2].toUpperCase();
    return {
      kind: 'transfer',
      document_ref: match[1],
      direction,
      group_key: `transfer:${match[1]}:${direction}`,
      display_type: direction === 'OUT' ? 'Transfer Out' : 'Transfer In',
    };
  }
  if (type === 'Transfer Out' || type === 'Transfer In') {
    const direction = type === 'Transfer Out' ? 'OUT' : 'IN';
    const documentRef = ref || `transfer-${movementId}`;
    return {
      kind: 'transfer',
      document_ref: documentRef,
      direction,
      group_key: `transfer:${documentRef}:${direction}`,
      display_type: type,
    };
  }

  // Stock count: MOV-SC-2026-0001-12  or legacy shared SC-2026-0001
  match = ref.match(/^MOV-(SC-\d{4}-\d+)-(\d+)$/i)
    || ref.match(/^(SC-\d{4}-\d+)$/i);
  if (match) {
    return {
      kind: 'stock_count',
      document_ref: match[1],
      group_key: `stock_count:${match[1]}`,
      display_type: 'Stock Count Adjustment',
    };
  }
  if (type === 'Stock Count Adjustment') {
    const documentRef = ref || `count-${movementId}`;
    return {
      kind: 'stock_count',
      document_ref: documentRef,
      group_key: `stock_count:${documentRef}`,
      display_type: 'Stock Count Adjustment',
    };
  }

  // Sale / reversal: SALE-INV-…-product-index  or  REV-…
  match = ref.match(/^(SALE-.+)-\d+-\d+$/i)
    || ref.match(/^(REV-.+)-\d+-\d+$/i);
  if (match) {
    return {
      kind: type === 'Sale Reversal' ? 'sale_reversal' : 'sale',
      document_ref: match[1],
      group_key: `${type === 'Sale Reversal' ? 'sale_reversal' : 'sale'}:${match[1]}`,
      display_type: type || 'Sale Deduction',
    };
  }

  return {
    kind: 'single',
    document_ref: ref || `MOV-${movementId}`,
    group_key: `single:${movementId}`,
    display_type: type || 'Adjustment',
  };
}

function sortLines(a, b) {
  return String(a.product_name || '').localeCompare(String(b.product_name || ''))
    || Number(a.movement_id) - Number(b.movement_id);
}

export function groupStockMovements(rows) {
  const map = new Map();

  for (const row of rows) {
    const parsed = parseMovementDocument(row);
    let group = map.get(parsed.group_key);
    if (!group) {
      group = {
        group_key: parsed.group_key,
        kind: parsed.kind,
        document_ref: parsed.document_ref,
        direction: parsed.direction || null,
        type: parsed.display_type || row.type,
        movement_date: row.movement_date,
        created_at: row.created_at,
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        performed_by: row.performed_by,
        performed_by_name: row.performed_by_name,
        representative_movement_id: row.movement_id,
        lines: [],
      };
      map.set(parsed.group_key, group);
    }

    group.lines.push(row);

    const rowDate = String(row.movement_date || '');
    const groupDate = String(group.movement_date || '');
    if (rowDate > groupDate
      || (rowDate === groupDate && Number(row.movement_id) < Number(group.representative_movement_id))) {
      group.movement_date = row.movement_date;
      group.created_at = row.created_at || group.created_at;
      group.representative_movement_id = row.movement_id;
      group.performed_by = row.performed_by ?? group.performed_by;
      group.performed_by_name = row.performed_by_name || group.performed_by_name;
      group.branch_id = row.branch_id ?? group.branch_id;
      group.branch_name = row.branch_name || group.branch_name;
    }
  }

  const groups = [...map.values()].map((group) => {
    const lines = [...group.lines].sort(sortLines);
    const unitTypes = [...new Set(lines.map((l) => String(l.unit_type || 'Unit').trim() || 'Unit'))];
    const totalQuantity = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
    const mixedUnits = unitTypes.length > 1;

    return {
      group_key: group.group_key,
      kind: group.kind,
      document_ref: group.document_ref,
      direction: group.direction,
      type: group.type,
      movement_date: group.movement_date,
      created_at: group.created_at,
      branch_id: group.branch_id,
      branch_name: group.branch_name,
      performed_by: group.performed_by,
      performed_by_name: group.performed_by_name,
      representative_movement_id: group.representative_movement_id,
      product_count: lines.length,
      total_quantity: totalQuantity,
      mixed_units: mixedUnits,
      unit_type: mixedUnits ? null : unitTypes[0],
      unit_types: unitTypes,
      product_preview: lines.slice(0, 2).map((l) => l.product_name).filter(Boolean),
    };
  });

  groups.sort((a, b) => {
    const da = String(a.movement_date || '');
    const db = String(b.movement_date || '');
    if (da !== db) return db.localeCompare(da);
    const ca = String(a.created_at || '');
    const cb = String(b.created_at || '');
    if (ca !== cb) return cb.localeCompare(ca);
    return Number(b.representative_movement_id) - Number(a.representative_movement_id);
  });

  return groups;
}

/** Keep whole groups that contain a matching product/search hit. */
export function selectMatchingGroups(flatRows, { search = '', productId = null } = {}) {
  const q = String(search || '').trim().toLowerCase();
  const pid = productId != null && Number.isFinite(Number(productId)) ? Number(productId) : null;

  if (!q && pid == null) {
    return groupStockMovements(flatRows);
  }

  const matchingKeys = new Set();
  for (const row of flatRows) {
    const parsed = parseMovementDocument(row);
    const hitProduct = pid != null && Number(row.product_id) === pid;
    const hitSearch = q && (
      String(row.product_name || '').toLowerCase().includes(q)
      || String(row.sku || '').toLowerCase().includes(q)
      || String(row.movement_ref || '').toLowerCase().includes(q)
      || String(parsed.document_ref || '').toLowerCase().includes(q)
    );
    if (hitProduct || hitSearch) matchingKeys.add(parsed.group_key);
  }

  const scopedRows = flatRows.filter((row) => matchingKeys.has(parseMovementDocument(row).group_key));
  return groupStockMovements(scopedRows);
}
