function SkeletonBlock({ className = '', style }) {
  return <div className={`skeleton-block ${className}`.trim()} style={style} aria-hidden="true" />;
}

function SkeletonLine({ width = '100%' }) {
  return <SkeletonBlock className="skeleton-line" style={{ width }} />;
}

/** Infer layout from the existing loading message when variant is not set. */
export function inferSkeletonVariant(message = '', { compact = false } = {}) {
  if (compact) return 'compact';
  const m = String(message).toLowerCase();

  if (/redirect/.test(m)) return 'compact';
  if (/dashboard|analytics|executive|system health|performance summary/.test(m)) return 'dashboard';
  if (/map|route|leaflet|osrm|account location/.test(m)) return 'map';
  if (/trend|comparison|saw results|system reports/.test(m)) return 'chart';
  if (/notification|alert/.test(m)) return 'list';
  if (/\bform\b|settings|loading profile|loading user form/.test(m)) return 'form';
  if (
    /details|detail|invoice|investigation|centralization/.test(m)
    || /loading (customer|product|supplier|transfer|restock|movement|user|branch|report|receipt|statement|payment|credit record)\b/.test(m)
  ) {
    return 'detail';
  }
  return 'table';
}

function DashboardSkeleton() {
  return (
    <>
      <div className="skeleton-panel">
        <SkeletonLine width="28%" />
        <div className="skeleton-filter-row">
          <SkeletonBlock className="skeleton-control" />
          <SkeletonBlock className="skeleton-control" />
          <SkeletonBlock className="skeleton-control" />
          <SkeletonBlock className="skeleton-control" />
        </div>
      </div>
      <div className="skeleton-kpi-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={`kpi-${i}`} className="skeleton-kpi-card">
            <SkeletonLine width="42%" />
            <SkeletonLine width="68%" />
            <SkeletonBlock className="skeleton-kpi-icon" />
          </div>
        ))}
      </div>
      <div className="skeleton-panel">
        <SkeletonLine width="34%" />
        <div className="skeleton-pop-grid">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={`pop-${i}`} className="skeleton-pop-card">
              <SkeletonLine width="40%" />
              <SkeletonLine width="72%" />
              <SkeletonLine width="50%" />
              <SkeletonBlock className="skeleton-spark" />
            </div>
          ))}
        </div>
      </div>
      <div className="skeleton-chart-row">
        <div className="skeleton-panel skeleton-chart-panel">
          <SkeletonLine width="36%" />
          <SkeletonBlock className="skeleton-chart" />
        </div>
        <div className="skeleton-panel skeleton-chart-panel">
          <SkeletonLine width="30%" />
          <SkeletonBlock className="skeleton-chart" />
        </div>
      </div>
    </>
  );
}

function TableSkeleton({ rows = 7, cols = 5 }) {
  const rowStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div className="skeleton-panel">
      <div className="skeleton-table-header">
        <SkeletonLine width="26%" />
        <div className="skeleton-filter-row skeleton-filter-row-tight">
          <SkeletonBlock className="skeleton-control" />
          <SkeletonBlock className="skeleton-control short" />
        </div>
      </div>
      <div className="skeleton-table">
        <div className="skeleton-table-row is-head" style={rowStyle}>
          {Array.from({ length: cols }, (_, i) => (
            <SkeletonLine key={`h-${i}`} width={`${55 + (i % 3) * 12}%`} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={`r-${r}`} className="skeleton-table-row" style={rowStyle}>
            {Array.from({ length: cols }, (_, c) => (
              <SkeletonLine key={`c-${r}-${c}`} width={`${48 + ((r + c) % 4) * 10}%`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="skeleton-panel">
      <SkeletonLine width="30%" />
      <div className="skeleton-form-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={`f-${i}`} className="skeleton-form-field">
            <SkeletonLine width="36%" />
            <SkeletonBlock className="skeleton-control" />
          </div>
        ))}
      </div>
      <div className="skeleton-actions">
        <SkeletonBlock className="skeleton-button" />
        <SkeletonBlock className="skeleton-button ghost" />
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="skeleton-panel">
        <SkeletonLine width="38%" />
        <SkeletonLine width="52%" />
        <div className="skeleton-kpi-grid skeleton-kpi-grid-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={`d-${i}`} className="skeleton-kpi-card">
              <SkeletonLine width="44%" />
              <SkeletonLine width="70%" />
            </div>
          ))}
        </div>
      </div>
      <div className="skeleton-panel">
        <SkeletonLine width="24%" />
        <div className="skeleton-detail-lines">
          <SkeletonLine width="92%" />
          <SkeletonLine width="84%" />
          <SkeletonLine width="88%" />
          <SkeletonLine width="76%" />
          <SkeletonLine width="80%" />
        </div>
      </div>
    </>
  );
}

function ListSkeleton({ rows = 6 }) {
  return (
    <div className="skeleton-panel">
      <div className="skeleton-table-header">
        <SkeletonLine width="28%" />
        <SkeletonBlock className="skeleton-button ghost" />
      </div>
      <div className="skeleton-list">
        {Array.from({ length: rows }, (_, i) => (
          <div key={`l-${i}`} className="skeleton-list-item">
            <SkeletonBlock className="skeleton-avatar" />
            <div className="skeleton-list-copy">
              <SkeletonLine width={`${58 + (i % 3) * 8}%`} />
              <SkeletonLine width={`${72 + (i % 2) * 10}%`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <>
      <div className="skeleton-panel">
        <div className="skeleton-filter-row">
          <SkeletonBlock className="skeleton-control" />
          <SkeletonBlock className="skeleton-control" />
          <SkeletonBlock className="skeleton-control short" />
        </div>
      </div>
      <div className="skeleton-chart-row">
        <div className="skeleton-panel skeleton-chart-panel">
          <SkeletonLine width="40%" />
          <SkeletonBlock className="skeleton-chart tall" />
        </div>
        <div className="skeleton-panel skeleton-chart-panel">
          <SkeletonLine width="36%" />
          <SkeletonBlock className="skeleton-chart tall" />
        </div>
      </div>
      <TableSkeleton rows={5} cols={4} />
    </>
  );
}

function MapSkeleton() {
  return (
    <div className="skeleton-panel">
      <div className="skeleton-table-header">
        <SkeletonLine width="24%" />
        <div className="skeleton-filter-row skeleton-filter-row-tight">
          <SkeletonBlock className="skeleton-control short" />
          <SkeletonBlock className="skeleton-control short" />
        </div>
      </div>
      <SkeletonBlock className="skeleton-map" />
    </div>
  );
}

function CompactLoading({ message }) {
  return (
    <section className="panel loading-state loading-state-compact" aria-live="polite" aria-busy="true">
      <div className="loading-spinner" aria-hidden="true" />
      <p>{message}</p>
    </section>
  );
}

function renderVariant(variant, { rows, cols } = {}) {
  switch (variant) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'form':
      return <FormSkeleton />;
    case 'detail':
      return <DetailSkeleton />;
    case 'list':
      return <ListSkeleton rows={rows} />;
    case 'chart':
      return <ChartSkeleton />;
    case 'map':
      return <MapSkeleton />;
    case 'table':
    default:
      return <TableSkeleton rows={rows} cols={cols} />;
  }
}

/**
 * Content-aware loading UI.
 * Visual style follows the skeleton reference; structure follows the page type.
 *
 * @param {{ message?: string, compact?: boolean, variant?: 'dashboard'|'table'|'form'|'detail'|'list'|'chart'|'map'|'compact', rows?: number, cols?: number }} props
 */
export function LoadingState({
  message = 'Loading...',
  compact = false,
  variant,
  rows,
  cols,
}) {
  const resolved = inferSkeletonVariant(message, { compact }) || 'table';
  const layout = variant || resolved;

  if (layout === 'compact') {
    return <CompactLoading message={message} />;
  }

  return (
    <section
      className={`loading-state loading-skeleton loading-skeleton-${layout}`}
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <p className="loading-skeleton-label">{message}</p>
      {renderVariant(layout, { rows, cols })}
    </section>
  );
}
