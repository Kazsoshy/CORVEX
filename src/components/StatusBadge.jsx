export function StatusBadge({ status }) {
  if (!status) return null;

  // Determine standard states
  const s = status.toLowerCase();
  let state = 'default';
  
  if (s.includes('active') || s.includes('success') || s.includes('completed') || s.includes('approved') || s.includes('sufficient') || s === 'online') {
    state = 'success';
  } else if (s.includes('inactive') || s.includes('fail') || s.includes('reject') || s.includes('critical') || s.includes('out of stock') || s.includes('overdue') || s.includes('late') || s.includes('offline')) {
    state = 'error';
  } else if (s.includes('pending') || s.includes('low') || s.includes('warn')) {
    state = 'warning';
  }

  const stateColors = {
    success: 'badge-success',
    error: 'badge-error',
    warning: 'badge-warning',
    default: 'badge-default'
  };

  return (
    <span className={`modern-badge ${stateColors[state]}`}>
      <span className="badge-dot" aria-hidden="true" />
      {status}
    </span>
  );
}
