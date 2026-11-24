/**
 * Key/value detail table used for account info, activity summaries, and record details.
 * Matches Corvex corvex-table styling used across modules.
 */
export function DetailRowsTable({
  rows = [],
  fieldHeader = 'Field',
  detailsHeader = 'Details',
  fieldWidth = '36%',
  dense = false,
}) {
  if (!rows.length) return null;

  const cellPad = dense ? '6px 10px' : undefined;

  return (
    <div className={`corvex-table-wrapper${dense ? ' detail-rows-dense' : ''}`}>
      <table className="corvex-table">
        <thead>
          <tr>
            <th style={{ width: fieldWidth, ...(cellPad ? { padding: cellPad } : {}) }}>{fieldHeader}</th>
            <th style={cellPad ? { padding: cellPad } : undefined}>{detailsHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || row.label}>
              <td style={{ fontWeight: 600, color: '#5F7385', ...(cellPad ? { padding: cellPad } : {}) }}>{row.label}</td>
              <td style={cellPad ? { padding: cellPad } : undefined}>{row.value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
