import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NavIcon } from '../../navIcons.jsx';
import {
  NOTIFICATIONS_EVENT,
  countUnreadNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationNavForRole,
} from '../../api/notificationService.js';
import { useSelectedNotificationFlash } from '../../hooks/useNotificationHighlight.js';
import { navigateWithHighlight } from '../../utils/notificationHighlight.js';
import { AccountMenuPopover } from './AccountMenuPopover.jsx';
import { NotificationsPopover } from './NotificationsPopover.jsx';
import { initialsFrom } from './profileParts.jsx';

export function TopNavbar({
  currentRole,
  currentUser,
  userAssignedLocation,
  pageTitle,
  breadcrumbs = [],
  avatarSrc,
  isProfileActive = false,
  accountMenuActiveId = null,
  notificationsPath = null,
  isNotificationsPage = false,
  onSelectAccountItem,
  onLogout,
  onOpenMobileSidebar,
  isMobileSidebarOpen = false,
  pathname = '',
  search = '',
  navigate,
  showToast,
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useSelectedNotificationFlash(650);

  const profileAnchorRef = useRef(null);
  const bellAnchorRef = useRef(null);

  const userName = currentUser?.fullName || currentUser?.name || 'User';
  const userRole = currentRole?.label || currentUser?.role?.name || 'Staff';
  const userEmail = currentUser?.email || '';
  const userInitials = useMemo(() => initialsFrom(userName), [userName]);

  const loadNotifications = useCallback(async ({ silent = true } = {}) => {
    const token = localStorage.getItem('corvex_token');
    if (!token || !currentUser) return;
    if (!silent) setLoadingNotifications(true);
    const res = await fetchNotifications();
    if (res.success && Array.isArray(res.data)) {
      setNotifications(res.data);
    }
    if (!silent) setLoadingNotifications(false);
  }, [currentUser]);

  useEffect(() => {
    loadNotifications({ silent: false });
  }, [loadNotifications, pathname]);

  useEffect(() => {
    const refresh = () => loadNotifications({ silent: true });
    window.addEventListener(NOTIFICATIONS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('corvex-session-ready', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('corvex-session-ready', refresh);
    };
  }, [loadNotifications]);

  // Close popovers on route change
  useEffect(() => {
    setAccountMenuOpen(false);
    setNotificationsOpen(false);
  }, [pathname, search]);

  const unreadCount = useMemo(
    () => countUnreadNotifications(notifications),
    [notifications]
  );

  const toggleNotifications = useCallback(() => {
    setAccountMenuOpen(false);
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (next) loadNotifications({ silent: true });
      return next;
    });
  }, [loadNotifications]);

  const toggleAccountMenu = useCallback(() => {
    setNotificationsOpen(false);
    setAccountMenuOpen((prev) => !prev);
  }, []);

  const closeAccountMenu = useCallback(() => setAccountMenuOpen(false), []);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  const handleMarkRead = useCallback(async (id) => {
    if (!id) return;
    setNotifications((prev) =>
      prev.map((item) => (item.notification_id === id ? { ...item, status: 'Read', read: true } : item))
    );
    const res = await markNotificationRead(id);
    if (!res.success) {
      loadNotifications({ silent: true });
    }
  }, [loadNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, status: 'Read', read: true })));
    const res = await markAllNotificationsRead();
    if (res.success) {
      showToast?.('All notifications marked as read.', 'success');
    } else {
      loadNotifications({ silent: true });
    }
  }, [loadNotifications, showToast]);

  const handleSelectNotification = useCallback(async (item) => {
    if (!item) return;
    const id = item.notification_id ?? item.id;
    if (id) setSelectedNotificationId(String(id));
    const isUnread = item.status !== 'Read' && !item.read;
    if (isUnread && id) {
      setNotifications((prev) =>
        prev.map((row) => (row.notification_id === id ? { ...row, status: 'Read', read: true } : row))
      );
      markNotificationRead(id);
    }
    const resolved = resolveNotificationNavForRole(item, currentRole?.key);
    window.setTimeout(() => {
      setNotificationsOpen(false);
      if (resolved?.path && navigate) {
        navigateWithHighlight(navigate, resolved.path, {
          id: resolved.id,
          notificationId: id,
        });
        return;
      }
      showToast?.('No related record is available for this notification.', 'info');
    }, 180);
  }, [currentRole?.key, navigate, setSelectedNotificationId, showToast]);

  const handleViewAllNotifications = useCallback(() => {
    setNotificationsOpen(false);
    if (notificationsPath && navigate) {
      navigate(notificationsPath);
    }
  }, [navigate, notificationsPath]);

  return (
    <header className="top-navbar" role="banner">
      <div className="top-navbar__start">
        <button
          type="button"
          className="top-navbar__menu-btn"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          aria-expanded={isMobileSidebarOpen}
          aria-controls="corvex-sidebar"
        >
          <NavIcon name="menu" />
        </button>

        <div className="top-navbar__context">
          <h1 className="top-navbar__title">{pageTitle || userRole || 'CORVEX'}</h1>
        </div>
      </div>

      <div className="top-navbar__actions">
        <button
          ref={bellAnchorRef}
          type="button"
          className={`top-navbar__icon-btn${notificationsOpen || isNotificationsPage ? ' is-active' : ''}`}
          onClick={toggleNotifications}
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          aria-haspopup="dialog"
          aria-expanded={notificationsOpen}
          title="Notifications"
        >
          <NavIcon name="bell" />
          {unreadCount > 0 ? (
            <span className="top-navbar__badge" aria-hidden="true">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>

        <button
          ref={profileAnchorRef}
          type="button"
          className={`top-navbar__profile-btn${accountMenuOpen || isProfileActive ? ' is-active' : ''}`}
          onClick={toggleAccountMenu}
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          title={`${userName} · Account menu`}
        >
          <span className="top-navbar__avatar">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" />
            ) : (
              <span className="top-navbar__avatar-initials">{userInitials}</span>
            )}
          </span>
          <span className="top-navbar__avatar-chevron" aria-hidden="true">
            <ChevronDown size={11} strokeWidth={2.6} />
          </span>
        </button>
      </div>

      <NotificationsPopover
        open={notificationsOpen}
        onClose={closeNotifications}
        notifications={notifications}
        loading={loadingNotifications}
        unreadCount={unreadCount}
        selectedNotificationId={selectedNotificationId}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        onSelectNotification={handleSelectNotification}
        onViewAll={notificationsPath ? handleViewAllNotifications : null}
        anchorRef={bellAnchorRef}
      />

      <AccountMenuPopover
        open={accountMenuOpen}
        onClose={closeAccountMenu}
        onSelect={(itemId) => {
          closeAccountMenu();
          onSelectAccountItem?.(itemId);
        }}
        onLogout={() => {
          closeAccountMenu();
          onLogout?.();
        }}
        activeItemId={accountMenuActiveId}
        userName={userName}
        userRole={userRole}
        userLocation={userAssignedLocation !== 'No Branch Assigned' ? userAssignedLocation : ''}
        userEmail={userEmail}
        avatarSrc={avatarSrc}
        avatarFallback={<span className="top-navbar__avatar-initials">{userInitials}</span>}
        anchorRef={profileAnchorRef}
      />
    </header>
  );
}
