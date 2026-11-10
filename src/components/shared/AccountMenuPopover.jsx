import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Lock, LogOut, MonitorSmartphone, Settings, UserRound } from 'lucide-react';

const MENU_ITEMS = [
  { id: 'account', label: 'Account', detail: 'Profile and personal details', icon: UserRound },
  { id: 'security', label: 'Security', detail: 'Password and account security', icon: Lock },
  { id: 'session', label: 'Session', detail: 'Sign-in and session details', icon: MonitorSmartphone },
  { id: 'settings', label: 'Settings', detail: 'Display, reading, and alerts', icon: Settings },
];

const MENU_WIDTH = 310;
const GAP = 10;
const VIEWPORT_PAD = 12;

function computePosition(anchorEl, menuEl) {
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = menuEl?.offsetWidth || MENU_WIDTH;
  const menuHeight = menuEl?.offsetHeight || 380;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // When anchored in the top navbar (top half of viewport), open below & right-align to anchor
  if (rect.top < vh / 2) {
    const left = Math.min(
      Math.max(VIEWPORT_PAD, rect.right - menuWidth),
      vw - VIEWPORT_PAD - menuWidth
    );
    let top = rect.bottom + GAP;
    if (top + menuHeight > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - menuHeight);
    }
    return { top, left, placement: 'below' };
  }

  let left;
  let top;
  let placement = 'right';

  const canPlaceRight = rect.right + GAP + menuWidth <= vw - VIEWPORT_PAD;
  if (canPlaceRight) {
    left = rect.right + GAP;
    top = rect.bottom - menuHeight;
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
    if (top + menuHeight > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - menuHeight);
    }
  } else {
    placement = 'above';
    left = Math.min(Math.max(VIEWPORT_PAD, rect.right - menuWidth), vw - VIEWPORT_PAD - menuWidth);
    top = rect.top - GAP - menuHeight;
    if (top < VIEWPORT_PAD) {
      placement = 'below';
      top = rect.bottom + GAP;
      if (top + menuHeight > vh - VIEWPORT_PAD) {
        top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - menuHeight);
      }
    }
  }

  return { top, left, placement };
}

/**
 * Enterprise Account Menu Popover anchored to the top navbar profile button.
 * Rendered via portal so it is never clipped by container overflow.
 */
export function AccountMenuPopover({
  open,
  onClose,
  onSelect,
  onLogout,
  activeItemId = null,
  userName,
  userRole,
  userLocation,
  userEmail,
  avatarSrc,
  avatarFallback = null,
  anchorRef,
}) {
  const menuId = useId();
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'below' });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    setCoords(computePosition(anchor, menu));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition, userName, userRole, userLocation, userEmail, avatarSrc]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (menuRef.current?.contains(target)) return;
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

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      className={`account-menu-popover account-menu-popover--${coords.placement}`}
      role="menu"
      aria-label="Account menu"
      style={{ top: coords.top, left: coords.left }}
    >
      <button
        type="button"
        role="menuitem"
        className="account-menu-profile-card"
        onClick={() => onSelect?.('account')}
        title="View your account profile"
      >
        <div className="account-menu-avatar" aria-hidden="true">
          {avatarSrc ? <img src={avatarSrc} alt="" /> : avatarFallback}
        </div>
        <div className="account-menu-identity">
          <div className="account-menu-name">{userName || 'User'}</div>
          {userRole ? <div className="account-menu-role">{userRole}</div> : null}
          {userLocation || userEmail ? (
            <div className="account-menu-meta">{userLocation || userEmail}</div>
          ) : null}
        </div>
      </button>

      <div className="account-menu-divider" role="separator" />

      <div className="account-menu-list">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeItemId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={active ? 'account-menu-item active' : 'account-menu-item'}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect?.(item.id)}
            >
              <span className="account-menu-item-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.85} />
              </span>
              <span className="account-menu-item-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <span className="account-menu-item-chevron" aria-hidden="true">
                <ChevronRight size={16} strokeWidth={1.85} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="account-menu-divider" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="account-menu-item account-menu-item--danger"
        onClick={() => onLogout?.()}
      >
        <span className="account-menu-item-icon" aria-hidden="true">
          <LogOut size={18} strokeWidth={1.85} />
        </span>
        <span className="account-menu-item-copy">
          <strong>Log out</strong>
          <small>End this CORVEX session</small>
        </span>
      </button>
    </div>,
    document.body
  );
}
