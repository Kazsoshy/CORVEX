import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { formatDisplayDateTime } from '../../utils/formatters.js';
import { NavIcon } from '../../navIcons.jsx';

const POPOVER_WIDTH = 360;
const GAP = 10;
const VIEWPORT_PAD = 12;

function computePosition(anchorEl, popoverEl) {
  const rect = anchorEl.getBoundingClientRect();
  const width = popoverEl?.offsetWidth || POPOVER_WIDTH;
  const height = popoverEl?.offsetHeight || 420;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const left = Math.min(
    Math.max(VIEWPORT_PAD, rect.right - width),
    vw - VIEWPORT_PAD - width
  );
  let top = rect.bottom + GAP;
  if (top + height > vh - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - height);
  }

  return { top, left };
}

function iconForCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('stock') || c.includes('inventory') || c.includes('restock')) return 'inventory';
  if (c.includes('schedule') || c.includes('route') || c.includes('visit')) return 'route';
  if (c.includes('receipt') || c.includes('collection') || c.includes('payment')) return 'receipt';
  if (c.includes('ci') || c.includes('credit') || c.includes('approval')) return 'queue';
  if (c.includes('security') || c.includes('login')) return 'shield-check';
  if (c.includes('alert') || c.includes('overdue')) return 'alert';
  return 'bell';
}

export function NotificationsPopover({
  open,
  onClose,
  notifications = [],
  loading = false,
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  onSelectNotification,
  onViewAll,
  anchorRef,
}) {
  const popoverId = useId();
  const popoverRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current;
    const pop = popoverRef.current;
    if (!anchor || !pop) return;
    setCoords(computePosition(anchor, pop));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition, notifications.length, filter, loading]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose?.();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    const onReposition = () => updatePosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, onClose, anchorRef, updatePosition]);

  const filteredItems = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((item) => item.status !== 'Read' && !item.read);
    }
    return notifications;
  }, [notifications, filter]);

  const visibleItems = useMemo(() => filteredItems.slice(0, 12), [filteredItems]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      id={popoverId}
      className="notifications-popover"
      role="dialog"
      aria-label="Notifications"
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="notifications-popover__header">
        <div className="notifications-popover__title-row">
          <h3 className="notifications-popover__title">Notifications</h3>
          {unreadCount > 0 ? (
            <span className="notifications-popover__unread-pill">
              {unreadCount} new
            </span>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="notifications-popover__mark-all"
            onClick={() => onMarkAllRead?.()}
          >
            <CheckCheck size={14} strokeWidth={2} />
            <span>Mark all read</span>
          </button>
        ) : null}
      </div>

      <div className="notifications-popover__tabs" role="tablist" aria-label="Filter notifications">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={filter === 'all' ? 'notifications-popover__tab active' : 'notifications-popover__tab'}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'unread'}
          className={filter === 'unread' ? 'notifications-popover__tab active' : 'notifications-popover__tab'}
          onClick={() => setFilter('unread')}
        >
          Unread
          {unreadCount > 0 ? <span className="notifications-popover__tab-count">{unreadCount}</span> : null}
        </button>
      </div>

      <div className="notifications-popover__body">
        {loading && !notifications.length ? (
          <div className="notifications-popover__empty">
            <p>Loading notifications…</p>
          </div>
        ) : visibleItems.length ? (
          <ul className="notifications-popover__list">
            {visibleItems.map((item) => {
              const id = item.notification_id ?? item.id;
              const isUnread = item.status !== 'Read' && !item.read;
              const timestamp = formatDisplayDateTime(item.created_at || item.time);
              const iconName = iconForCategory(item.category);

              return (
                <li
                  key={id}
                  className={isUnread ? 'notifications-popover__item is-unread' : 'notifications-popover__item'}
                >
                  <button
                    type="button"
                    className="notifications-popover__item-main"
                    onClick={() => onSelectNotification?.(item)}
                  >
                    <span
                      className={isUnread ? 'notifications-popover__item-icon is-unread' : 'notifications-popover__item-icon'}
                      aria-hidden="true"
                    >
                      <NavIcon name={iconName} />
                    </span>
                    <span className="notifications-popover__item-content">
                      <span className="notifications-popover__item-top">
                        <strong className="notifications-popover__item-title">
                          {item.title || item.category || 'System notification'}
                        </strong>
                        {isUnread ? (
                          <span className="notifications-popover__unread-dot" aria-label="Unread" />
                        ) : null}
                      </span>
                      {item.message ? (
                        <span className="notifications-popover__item-desc">{item.message}</span>
                      ) : null}
                      <span className="notifications-popover__item-meta">
                        {item.category ? (
                          <span className="notifications-popover__item-cat">{item.category}</span>
                        ) : null}
                        {timestamp && timestamp !== '—' ? <span>{timestamp}</span> : null}
                        <span className={isUnread ? 'notifications-popover__status is-unread' : 'notifications-popover__status'}>
                          {isUnread ? 'Unread' : 'Read'}
                        </span>
                      </span>
                    </span>
                  </button>
                  {isUnread ? (
                    <button
                      type="button"
                      className="notifications-popover__read-btn"
                      title="Mark as read"
                      aria-label={`Mark "${item.title || 'notification'}" as read`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkRead?.(id);
                      }}
                    >
                      <Check size={15} strokeWidth={2.2} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="notifications-popover__empty">
            <span className="notifications-popover__empty-icon" aria-hidden="true">
              <Bell size={22} strokeWidth={1.75} />
            </span>
            <strong>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</strong>
            <p>
              {filter === 'unread'
                ? 'You have read all recent system updates.'
                : 'Operational alerts and system updates will appear here.'}
            </p>
          </div>
        )}
      </div>

      {onViewAll ? (
        <div className="notifications-popover__footer">
          <button
            type="button"
            className="notifications-popover__view-all"
            onClick={() => onViewAll()}
          >
            <span>View all notifications</span>
            <ExternalLink size={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
