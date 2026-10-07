import { useEffect, useMemo, useState } from 'react';
import { fetchNotifications, markNotificationRead } from '../../api/notificationService';
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
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

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

  if (loading) return <LoadingState message="Loading notifications..." />;

  return (
    <div className="relative z-10 grid gap-[22px] w-full">
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
          <button className="button secondary" type="button" onClick={markAllRead}>
            Mark All as Read
          </button>
        </div>
      </section>

      {filtered.length ? (
        <>
        <div className="notification-list">
          {pageItems.map((item) => {
            const isUnread = item.status === 'Unread';
            const relatedPath = resolveRelatedPath?.(item);
            return (
              <article
                key={item.notification_id}
                className={`notification-item${isUnread ? ' unread' : ''}`}
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
                <div className="notification-actions">
                  {isUnread ? (
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
                      onClick={() => navigate(relatedPath)}
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
