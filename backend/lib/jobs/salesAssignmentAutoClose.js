import { autoCloseStaleAssignments } from '../salesAreaAssignments.js';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Periodically auto-close sales area assignments past end_date (Manila calendar).
 * Safe to call alongside on-read auto-close.
 */
export function startSalesAssignmentAutoClose(pool, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (!pool) return () => {};

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await autoCloseStaleAssignments(pool, {});
      if ((result.notStarted || 0) + (result.incomplete || 0) > 0) {
        console.log(
          `[salesAssignmentAutoClose] notStarted=${result.notStarted || 0} incomplete=${result.incomplete || 0}`
        );
      }
    } catch (err) {
      console.error('[salesAssignmentAutoClose]', err.message);
    } finally {
      running = false;
    }
  };

  // Run once shortly after boot, then on interval.
  const bootTimer = setTimeout(tick, 15_000);
  const interval = setInterval(tick, Math.max(60_000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  if (typeof interval.unref === 'function') interval.unref();
  if (typeof bootTimer.unref === 'function') bootTimer.unref();

  return () => {
    clearTimeout(bootTimer);
    clearInterval(interval);
  };
}
