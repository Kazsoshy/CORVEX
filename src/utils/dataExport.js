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
 */
export function downloadPdf(rows, options = {}) {
  const {
    filename = 'export.pdf',
    title = 'CORVEX Export',
    subtitle = '',
  } = typeof options === 'string' ? { filename: options } : options;

  if (!rows?.length) return false;

  const keys = Object.keys(rows[0]);
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
  doc.setTextColor(9, 56, 80);
  doc.text('CORVEX', marginX, 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(String(title), marginX, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const meta = [
    `Generated: ${generatedAt}`,
    `Records: ${rows.length}`,
    subtitle ? String(subtitle) : null,
  ].filter(Boolean);
  doc.text(meta.join('  ·  '), marginX, 74);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(marginX, 82, pageWidth - marginX, 82);

  autoTable(doc, {
    startY: 92,
    head: [keys.map(humanizeHeader)],
    body: rows.map((row) => keys.map((key) => formatCell(row[key]))),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 5,
      overflow: 'linebreak',
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [100, 116, 139],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [250, 251, 252],
    },
    margin: { left: marginX, right: marginX, bottom: 40 },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - marginX,
        pageHeight - 18,
        { align: 'right' }
      );
      doc.text('CORVEX Report', marginX, pageHeight - 18);
    },
  });

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
