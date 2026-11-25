import { formatCurrency, formatDisplayDate, formatPaymentTimestamp } from '../../utils/formatters.js';

export function paymentStatus(record) {
  return record?.display_status || record?.payment_status || '—';
}

export function receivedByLabel(record) {
  return record?.received_by_name || record?.collector_name || '—';
}

export function receivedByRole(record) {
  return record?.received_by_role_label
    || (record?.received_by_role_slug === 'sales_staff'
      ? 'Sales Agent'
      : record?.received_by_role_slug === 'collector'
        ? 'Collector'
        : null);
}

export function paymentSourceLabel(record) {
  return record?.payment_source || 'Field collection';
}

export function paymentWhen(record) {
  if (record?.payment_date) {
    return formatPaymentTimestamp(record.payment_date, record.payment_time);
  }
  return formatDisplayDate(record?.transaction_date);
}

/** Prefer structured spot-cash fields; fall back to raw notes for older records. */
export function parsePaymentRemarks(record) {
  const raw = String(record?.collection_notes || '').trim();
  const structured = {
    paymentType: paymentSourceLabel(record),
    paymentMethod: record?.payment_method || null,
    referenceNumber: record?.reference_number || null,
    hasProof: Boolean(record?.has_payment_proof || record?.payment_proof_image),
    invoiceNumber: record?.invoice_number || null,
    freeText: null,
    raw: raw || null,
  };

  if (record?.reference_number) {
    // Prefer DB column over notes scrape.
  } else {
    const refMatch = raw.match(/Ref:\s*([^\n·]+)/i);
    if (refMatch) structured.referenceNumber = refMatch[1].trim();
  }

  // Strip known machine-generated fragments; leftover is free-text remarks.
  let leftover = raw
    .replace(/Spot Cash GCash[^·\n]*/gi, '')
    .replace(/Spot Cash Cash[^·\n]*/gi, '')
    .replace(/Invoice\s+INV-[0-9-]+/gi, '')
    .replace(/Ref:\s*[^\n·]+/gi, '')
    .replace(/Proof attached/gi, '')
    .replace(/GCash payment recorded[^\n]*/gi, '')
    .replace(/Receipt\s+RCP-[0-9-]+/gi, '')
    .replace(/[·|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  structured.freeText = leftover || null;
  return structured;
}

export function invoiceDiscountLabel(record) {
  const rate = Number(record?.discount_rate);
  const amount = Number(record?.discount_amount);
  if (Number.isFinite(rate) && rate > 0) {
    const pct = Math.round(rate * 100);
    return amount > 0
      ? `Spot cash ${pct}% (−${formatCurrency(amount)})`
      : `Spot cash ${pct}%`;
  }
  if (Number.isFinite(amount) && amount > 0) {
    return `Discount (−${formatCurrency(amount)})`;
  }
  return null;
}

export function copyText(value) {
  const text = String(value || '').trim();
  if (!text || !navigator?.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}

export function toCsv(records) {
  const headers = [
    'Customer',
    'Customer Code',
    'Receipt',
    'Invoice',
    'Paid',
    'Remaining',
    'Status',
    'Payment Method',
    'Source',
    'Received By',
    'Role',
    'Payment Date',
    'Reference',
  ];
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of records || []) {
    lines.push([
      r.customer_name,
      r.customer_code,
      r.receipt_number,
      r.invoice_number,
      r.payment_amount,
      r.remaining_balance,
      paymentStatus(r),
      r.payment_method,
      paymentSourceLabel(r),
      receivedByLabel(r),
      receivedByRole(r),
      paymentWhen(r),
      r.reference_number,
    ].map(escape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function downloadCsv(records, filename = 'payment-history.csv') {
  const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
