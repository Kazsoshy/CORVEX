import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function humanizeHeader(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeFilename(filename, extension) {
  const base = String(filename || 'export').replace(/\.(csv|pdf|xls|xlsx)$/i, '');
  return `${base}.${extension}`;
}

function formatCell(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Download rows (array of plain objects) as a professionally formatted PDF.
 * Handles multi-page tables automatically for large datasets.
 * Empty selections still produce a one-page PDF noting zero records.
 */
export function downloadPdf(rows, options = {}) {
  const {
    filename = 'export.pdf',
    title = 'CORVEX Export',
    subtitle = '',
    category = '',
    dateRange = '',
    columns = null,
    totals = [],
    allowEmpty = false,
  } = typeof options === 'string' ? { filename: options } : options;

  const list = Array.isArray(rows) ? rows : [];
  if (!list.length && !allowEmpty) return false;

  const keys = columns?.length
    ? columns.map((c) => (typeof c === 'string' ? c : c.key)).filter(Boolean)
    : list.length
      ? Object.keys(list[0])
      : ['message'];
  const headers = columns?.length
    ? columns.map((c) => (typeof c === 'string' ? humanizeHeader(c) : (c.label || humanizeHeader(c.key))))
    : keys.map(humanizeHeader);

  const generatedAt = new Date().toLocaleString();
  const doc = new jsPDF({
    orientation: keys.length > 6 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(26, 65, 98);
  doc.text('CORVEX', marginX, 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(11, 30, 48);
  doc.text(String(title), marginX, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(95, 115, 133);
  const meta = [
    `Generated: ${generatedAt}`,
    `Records: ${list.length}`,
    category ? `Category: ${category}` : null,
    dateRange ? `Period: ${dateRange}` : null,
    subtitle ? String(subtitle) : null,
  ].filter(Boolean);
  doc.text(meta.join('  ·  '), marginX, 74);

  doc.setDrawColor(186, 219, 233);
  doc.setLineWidth(1);
  doc.line(marginX, 82, pageWidth - marginX, 82);

  const body = list.length
    ? list.map((row) => keys.map((key) => formatCell(row[key])))
    : [keys.map((key, i) => (i === 0 ? 'No records found for this selection.' : ''))];

  autoTable(doc, {
    startY: 92,
    head: [headers],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 5,
      overflow: 'linebreak',
      valign: 'middle',
      textColor: [11, 30, 48],
      lineColor: [186, 219, 233],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [218, 241, 248],
      textColor: [26, 65, 98],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [245, 248, 250],
    },
    margin: { left: marginX, right: marginX, bottom: 40 },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(95, 115, 133);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - marginX,
        pageHeight - 18,
        { align: 'right' }
      );
      doc.text('CORVEX Report', marginX, pageHeight - 18);
    },
  });

  if (totals?.length) {
    let y = (doc.lastAutoTable?.finalY || 92) + 18;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 65, 98);
    doc.text('Totals', marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(11, 30, 48);
    totals.forEach((item, index) => {
      doc.text(`${item.label}: ${formatCell(item.value)}`, marginX, y + 14 + index * 14);
    });
  }

  doc.save(normalizeFilename(filename, 'pdf'));
  return true;
}

/** Compact PDF summarizing a selected chart slice (title, legend values, totals). */
export function downloadChartSummaryPdf({
  filename = 'chart-summary.pdf',
  title = 'CORVEX Chart',
  subtitle = '',
  category = '',
  dateRange = '',
  legend = [],
  summaryRows = [],
} = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  const generatedAt = new Date().toLocaleString();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(26, 65, 98);
  doc.text('CORVEX', marginX, 36);

  doc.setFontSize(13);
  doc.setTextColor(11, 30, 48);
  doc.text(String(title), marginX, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(95, 115, 133);
  doc.text(
    [`Generated: ${generatedAt}`, category ? `Category: ${category}` : null, dateRange ? `Period: ${dateRange}` : null, subtitle || null]
      .filter(Boolean)
      .join('  ·  '),
    marginX,
    74
  );
  doc.setDrawColor(186, 219, 233);
  doc.line(marginX, 82, pageWidth - marginX, 82);

  const legendBody = (legend || []).map((item) => [item.label, formatCell(item.value)]);
  autoTable(doc, {
    startY: 96,
    head: [['Series / Field', 'Value']],
    body: legendBody.length ? legendBody : [['—', 'No series values']],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 6, textColor: [11, 30, 48], lineColor: [186, 219, 233] },
    headStyles: { fillColor: [218, 241, 248], textColor: [26, 65, 98], fontStyle: 'bold' },
    margin: { left: marginX, right: marginX },
  });

  if (summaryRows?.length) {
    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 96) + 16,
      head: [['Summary', 'Value']],
      body: summaryRows.map((row) => [row.label, formatCell(row.value)]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, textColor: [11, 30, 48], lineColor: [186, 219, 233] },
      headStyles: { fillColor: [206, 243, 223], textColor: [11, 30, 48], fontStyle: 'bold' },
      margin: { left: marginX, right: marginX },
    });
  }

  doc.save(normalizeFilename(filename, 'pdf'));
  return true;
}

/** Excel-compatible HTML table. Opens in Excel without an extra library. */
export function downloadExcel(rows, filename = 'export.xls') {
  if (!rows?.length) return false;
  const keys = Object.keys(rows[0]);
  const head = `<tr>${keys.map((k) => `<th>${escapeHtml(humanizeHeader(k))}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${keys.map((k) => `<td>${escapeHtml(formatCell(row[k]))}</td>`).join('')}</tr>`).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table>${head}${body}</table></body></html>`;
  triggerDownload(
    new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
    normalizeFilename(filename, 'xls')
  );
  return true;
}

/**
 * Unified export helper.
 * @param {Array<object>} rows
 * @param {{ format?: 'pdf'|'excel', filename?: string, title?: string, subtitle?: string }} options
 */
export function exportRows(rows, { format = 'pdf', filename = 'export', title = 'CORVEX Export', subtitle = '' } = {}) {
  if (format === 'excel') return downloadExcel(rows, filename);
  return downloadPdf(rows, { filename, title, subtitle });
}
