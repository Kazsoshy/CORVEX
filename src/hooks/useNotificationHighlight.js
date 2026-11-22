import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  applyTemporaryHighlight,
  HIGHLIGHT_DURATION_MS,
  idsMatch,
  readHighlightId,
  recordKey,
} from '../utils/notificationHighlight.js';

function findHighlightElement(entity, highlightId) {
  if (!highlightId) return null;
  const key = entity ? recordKey(entity, highlightId) : null;
  if (key) {
    const byKey = document.querySelector(`[data-record-key="${CSS.escape(key)}"]`);
    if (byKey) return byKey;
  }

  const nodes = document.querySelectorAll('[data-record-key], [data-highlight-alt]');
  for (const el of nodes) {
    const alt = el.getAttribute('data-highlight-alt');
    if (alt && idsMatch(alt, highlightId)) return el;
    const record = el.getAttribute('data-record-key');
    if (!record) continue;
    const suffix = record.includes(':') ? record.slice(record.lastIndexOf(':') + 1) : record;
    if (idsMatch(suffix, highlightId)) return el;
    if (entity && idsMatch(record, recordKey(entity, highlightId))) return el;
  }
  return null;
}

/**
 * When the current route carries a notification highlight id, find the matching
 * record node, scroll it into view, and flash a temporary highlight.
 *
 * Polls / observes the DOM long enough for async loads, pagination jumps, and modals.
 */
export function useNotificationHighlight(entity, {
  enabled = true,
  durationMs = HIGHLIGHT_DURATION_MS,
  ready = true,
  maxWaitMs = 10000,
} = {}) {
  const location = useLocation();
  const highlightId = enabled ? readHighlightId(location.search, location.state) : null;

  useLayoutEffect(() => {
    if (!enabled || !ready || !highlightId) return undefined;

    let cleanup = () => {};
    let done = false;
    let raf = 0;
    let poll = 0;
    let observer = null;
    const startedAt = Date.now();

    const tryApply = () => {
      if (done) return true;
      const el = findHighlightElement(entity, highlightId);
      if (!el) return false;
      done = true;
      cleanup = applyTemporaryHighlight(el, { durationMs });
      if (observer) observer.disconnect();
      if (poll) window.clearInterval(poll);
      return true;
    };

    raf = window.requestAnimationFrame(() => {
      if (tryApply()) return;

      poll = window.setInterval(() => {
        if (tryApply() || Date.now() - startedAt > maxWaitMs) {
          window.clearInterval(poll);
          poll = 0;
          if (observer) observer.disconnect();
        }
      }, 100);

      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => {
          tryApply();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (poll) window.clearInterval(poll);
      if (observer) observer.disconnect();
      cleanup();
    };
  }, [enabled, ready, entity, highlightId, location.key, location.search, durationMs, maxWaitMs]);

  return highlightId;
}

/**
 * Local selected-notification flash in popover/inbox (does not change read state).
 */
export function useSelectedNotificationFlash(durationMs = 700) {
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = window.setTimeout(() => setSelectedId(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [selectedId, durationMs]);

  return [selectedId, setSelectedId];
}
