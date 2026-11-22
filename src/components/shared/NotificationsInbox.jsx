import { useEffect, useMemo, useState } from 'react';
import {
  fetchNotifications,
  markNotificationRead,
  resolveNotificationNavForRole,
  resolveNotificationTargetForRole,
} from '../../api/notificationService';
import { useSelectedNotificationFlash } from '../../hooks/useNotificationHighlight.js';
import { navigateWithHighlight } from '../../utils/notificationHighlight.js';
import { formatDisplayDate } from '../../utils/formatters';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { Pagination } from './Pagination';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../StatusBadge';

/**
 * Card-style notifications inbox (category filters + unread styling).
 * Used across roles that load notifications from the API.
 */
export function NotificationsInbox({
  showToast,
  navigate,
  resolveRelatedPath,
  roleKey = null,
  canManage = true,
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [selectedNotificationId, setSelectedNotificationId] = useSelectedNotificationFlash(650);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const result = await fetchNotifications();
      if (!active) return;
      if (result.success) {
        setNotifications(result.data || []);
      } else if (showToast) {
        showToast('Failed to load notifications.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [showToast]);

  const categories = useMemo(() => {
    const fromData = [...new Set(notifications.map((n) => n.category).filter(Boolean))];
    return ['All', 'Unread', 'Read', ...fromData.sort((a, b) => String(a).localeCompare(String(b)))];
  }, [notifications]);

  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter((n) => n.status === 'Unread');
    if (filter === 'Read') return notifications.filter((n) => n.status === 'Read');
    if (filter === 'All') return notifications;
    return notifications.filter((n) => n.category === filter);
  }, [notifications, filter]);
  const pagination = usePagination(filtered, { resetKey: filter });
  const pageItems = pagination.paginatedData;

  const resolvePath = (item) => {
    if (typeof resolveRelatedPath === 'function') {
      const custom = resolveRelatedPath(item);
      if (custom) return custom;
    }
    if (roleKey) return resolveNotificationTargetForRole(item, roleKey);
    return null;
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => n.status === 'Unread');
    await Promise.all(unread.map((n) => markNotificationRead(n.notification_id)));
    setNotifications((items) => items.map((n) => ({ ...n, status: 'Read' })));
    showToast?.('All notifications marked as read.', 'success');
  };

  const markOneRead = async (id) => {
    const result = await markNotificationRead(id);
    if (result.success) {
      setNotifications((items) => items.map((n) => (
        n.notification_id === id ? { ...n, status: 'Read' } : n
      )));
      showToast?.('Marked as read.', 'success');
    }
  };

  const openNotification = async (item) => {
    if (!item) return;
    const id = item.notification_id ?? item.id;
    if (id) setSelectedNotificationId(String(id));
    const isUnread = item.status === 'Unread' || (item.status !== 'Read' && !item.read);
    if (isUnread && id && canManage) {
      setNotifications((items) => items.map((n) => (
        n.notification_id === id ? { ...n, status: 'Read' } : n
      )));
      markNotificationRead(id);
    }
    const resolved = roleKey
      ? resolveNotificationNavForRole(item, roleKey)
      : { path: resolvePath(item), id: item.related_id || item.relatedId || item.highlightId || null };
    window.setTimeout(() => {
      if (resolved?.path && navigate) {
        navigateWithHighlight(navigate, resolved.path, {
          id: resolved.id,
          notificationId: id,
        });
      } else {
        showToast?.('No related record is available for this notification.', 'info');
      }
    }, 180);
  };

  if (loading) return <LoadingState message="Loading notifications..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
            {categories.map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? 'segment active' : 'segment'}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          {canManage ? (
            <button className="button secondary" type="button" onClick={markAllRead}>
              Mark All as Read
            </button>
          ) : null}
        </div>
      </section>

      {filtered.length ? (
        <>
        <div className="notification-list">
          {pageItems.map((item) => {
            const isUnread = item.status === 'Unread';
            const relatedPath = resolvePath(item);
            const itemId = item.notification_id ?? item.id;
            const isSelected = selectedNotificationId != null && String(selectedNotificationId) === String(itemId);
            return (
              <article
                key={item.notification_id}
                className={`notification-item${isUnread ? ' unread' : ''}${relatedPath ? ' is-clickable' : ''}${isSelected ? ' is-selected' : ''}`}
                role={relatedPath ? 'link' : undefined}
                tabIndex={relatedPath ? 0 : undefined}
                onClick={() => openNotification(item)}
                onKeyDown={(event) => {
                  if (!relatedPath) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openNotification(item);
                  }
                }}
              >
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <h4 style={{ margin: 0 }}>{item.title}</h4>
                    {item.category ? <StatusBadge status={item.category} /> : null}
                  </div>
                  <p className="muted">{item.message}</p>
                  <span className="notification-time">
                    {[item.category, formatDisplayDate(item.created_at)].filter(Boolean).join(' · ')}
                    {isUnread ? ' · Unread' : ''}
                  </span>
                </div>
                <div className="notification-actions" onClick={(event) => event.stopPropagation()}>
                  {isUnread && canManage ? (
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => markOneRead(item.notification_id)}
                    >
                      Mark Read
                    </button>
                  ) : null}
                  {relatedPath && navigate ? (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => openNotification(item)}
                    >
                      Open
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <Pagination {...pagination} />
        </>
      ) : (
        <EmptyState title="No notifications" description="You're all caught up." />
      )}
    </div>
  );
}
