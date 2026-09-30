function escapeCsvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Download rows (array of plain objects) as a UTF-8 CSV file. */
export function downloadCsv(rows, filename = 'export.csv') {
  if (!rows?.length) return false;
  const keys = Object.keys(rows[0]);
  const header = keys.map(escapeCsvCell).join(',');
  const body = rows.map((row) => keys.map((k) => escapeCsvCell(row[k])).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
