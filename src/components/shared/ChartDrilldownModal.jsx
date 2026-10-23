import { useMemo } from 'react';
import { Pagination } from './Pagination';
import { usePagination } from '../../hooks/usePagination';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { downloadPdf } from '../../utils/dataExport.js';

/**
 * Modal that shows underlying records for a clicked chart slice,
 * with a Download PDF action for those records.
 */
export function ChartDrilldownModal({
  open,
  onClose,
  title = 'Chart details',
  category = '',
  dateRange = '',
  subtitle = '',
  columns = [],
  rows = [],
  totals = [],
  loading = false,
  error = '',
  showToast,
  filenameBase = 'chart-details',
}) {
  const tableRows = useMemo(
    () => (Array.isArray(rows) ? rows : []).map((row, index) => ({
      ...row,
      __key: row.id ?? row.sales_invoices_id ?? row.collectionpayment_id ?? row.customer_id ?? index,
    })),
    [rows]
  );
  const pagination = usePagination(tableRows);
  const pageRows = pagination.paginatedData;

  if (!open) return null;

  const resolvedColumns = columns.length
    ? columns
    : tableRows[0]
      ? Object.keys(tableRows[0]).filter((k) => k !== '__key').map((key) => ({ key, label: key.replace(/_/g, ' ') }))
      : [];

  function handleDownloadRecords() {
    const exportRows = tableRows.map(({ __key, ...rest }) => rest);
    const keys = resolvedColumns.map((c) => c.key);
    const slim = exportRows.map((row) => {
      const out = {};
      keys.forEach((key) => { out[key] = row[key]; });
      return out;
    });
    const ok = downloadPdf(slim, {
      filename: `${filenameBase}-records`,
      title,
      category,
      dateRange,
      subtitle,
      columns: resolvedColumns,
      totals,
      allowEmpty: true,
    });
    if (ok) showToast?.('PDF downloaded.', 'success');
    else showToast?.('Unable to generate PDF.', 'error');
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chart-drilldown-title"
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{ maxWidth: 920, width: 'min(920px, 96vw)', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h3 id="chart-drilldown-title" style={{ margin: 0 }}>{title}</h3>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
              {[category, dateRange, subtitle].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button className="toast-dismiss" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? <LoadingState variant="table" rows={5} cols={4} message="Loading records…" /> : null}
        {!loading && error ? <EmptyState title="Unable to load records" description={error} /> : null}

        {!loading && !error ? (
          <>
            {totals.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '8px 0 16px' }}>
                {totals.map((t) => (
                  <div key={t.label} className="panel" style={{ padding: '10px 14px', margin: 0, minWidth: 140 }}>
                    <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>{t.label}</div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{t.value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {pageRows.length ? (
              <>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        {resolvedColumns.map((col) => (
                          <th key={col.key}>{col.label || col.key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={row.__key}>
                          {resolvedColumns.map((col) => (
                            <td key={col.key}>{row[col.key] ?? '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...pagination} />
              </>
            ) : (
              <EmptyState
                title="No matching records"
                description="No underlying records were found for this chart selection and the active filters."
              />
            )}
          </>
        ) : null}

        <div className="modal-actions" style={{ marginTop: 16, flexWrap: 'wrap' }}>
          <button className="button secondary" type="button" onClick={onClose}>Close</button>
          <button className="button" type="button" onClick={handleDownloadRecords} disabled={loading}>
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
