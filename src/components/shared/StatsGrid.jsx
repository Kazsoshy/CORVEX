import { NavIcon } from '../../navIcons';

/** Infer a secondary icon from the stat label when none is provided. */
export function resolveStatIcon(label = '', explicitIcon) {
  if (explicitIcon) return explicitIcon;
  const text = String(label).toLowerCase();

  if (/(transfer)/.test(text)) return 'transfer';
  if (/(restock|replenish)/.test(text)) return 'restock';
  if (/(stock|inventory|sku|product|tracked|catalog)/.test(text)) return 'inventory';
  if (/(movement|sales|sold|invoice|order|cart)/.test(text)) return 'shopping-cart';
  if (/(collection|collected|payment|paid|receipt|amount|balance|revenue|₱|php|peso|credit)/.test(text)) return 'dollar-sign';
  if (/(customer|account|user|staff|agent|collector)/.test(text)) return 'users';
  if (/(alert|critical|low|warning|overdue|risk)/.test(text)) return 'alert-triangle';
  if (/(pending|await|queue|today|schedule|visit|clock)/.test(text)) return 'clock';
  if (/(branch|location|territory)/.test(text)) return 'building-2';
  if (/(route|map|distance)/.test(text)) return 'route';
  if (/(performance|score|rank|growth|efficiency)/.test(text)) return 'trending-up';
  if (/(report|audit|log)/.test(text)) return 'file-text';
  if (/(notification|unread)/.test(text)) return 'bell';
  if (/(health|status)/.test(text)) return 'shield-check';
  return 'bar-chart-2';
}

/**
 * Shared CORVEX KPI / summary cards.
 * Layout: label (top-left) · value (right, vertically centered) · icon (bottom-left)
 *
 * @param {{ stats: Array<{ label: string, value: any, icon?: string }>, className?: string }} props
 */
export function StatsGrid({ stats, className = '' }) {
  if (!stats?.length) return null;

  return (
    <section className={`stats-grid ${className}`.trim()}>
      {stats.map((stat, index) => {
        const icon = resolveStatIcon(stat.label, stat.icon);
        return (
          <article
            key={`${stat.label}-${index}`}
            className="stat-card"
            style={{ '--stat-index': index }}
            title={stat.title || undefined}
          >
            <span className="stat-label">{stat.label}</span>
            <strong className="stat-value">{stat.value}</strong>
            <div className="stat-card-icon" aria-hidden="true">
              <NavIcon name={icon} />
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** Alias used by some modules */
export function Stats(props) {
  return <StatsGrid {...props} />;
}
