/**
 * Key/value detail table used for account info, activity summaries, and record details.
 * Matches Corvex corvex-table styling used across modules.
 */
export function DetailRowsTable({
  rows = [],
  fieldHeader = 'Field',
  detailsHeader = 'Details',
  fieldWidth = '36%',
}) {
  if (!rows.length) return null;

  return (
    <div className="corvex-table-wrapper">
      <table className="corvex-table">
        <thead>
          <tr>
            <th style={{ width: fieldWidth }}>{fieldHeader}</th>
            <th>{detailsHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || row.label}>
              <td style={{ fontWeight: 600, color: '#5F7385' }}>{row.label}</td>
              <td>{row.value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
