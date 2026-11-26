import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * Shared vertical three-dot (⋮) overflow menu used across CORVEX list tables.
 * Portal-rendered to document.body with viewport clamping, flip-above, and keyboard navigation.
 *
 * @param {{
 *   items: Array<{ key?: string, label: string, onSelect?: () => void, onClick?: () => void, disabled?: boolean, title?: string, danger?: boolean, icon?: import('react').ReactNode }|null|false>,
 *   label?: string,
 *   emptyFallback?: import('react').ReactNode
 * }} props
 */
export function RowActionMenu({ items = [], label = 'Actions', emptyFallback = <span className="muted">—</span> }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const visible = (items || []).filter(Boolean);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth || 200;
    const menuHeight = menuRef.current?.offsetHeight || 0;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const fitsBelow = rect.bottom + menuHeight + 8 <= viewportH;
    const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
    const idealLeft = rect.right - menuWidth;
    const left = Math.max(8, Math.min(idealLeft, viewportW - menuWidth - 8));
    setPos({ top, left });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (!menuRef.current) return;
      const buttons = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      if (!buttons.length) return;
      const idx = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        buttons[(idx + 1 + buttons.length) % buttons.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        buttons[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
      }
    };
    const onScroll = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    queueMicrotask(() => {
      menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  if (!visible.length) return emptyFallback;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button ghost user-row-menu-trigger row-action-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <MoreVertical size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="panel user-row-menu row-action-menu"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
              onClick={(event) => event.stopPropagation()}
            >
              {visible.map((item, idx) => {
                const handler = item.onSelect || item.onClick;
                return (
                  <button
                    key={item.key || item.label || idx}
                    type="button"
                    role="menuitem"
                    className={`button ghost user-row-menu-item${item.danger ? ' danger-text' : ''}`}
                    disabled={item.disabled}
                    title={item.title}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (item.disabled) return;
                      setOpen(false);
                      handler?.(event);
                    }}
                  >
                    {item.icon ? <span className="user-row-menu-item-icon" aria-hidden="true">{item.icon}</span> : null}
                    <span className="user-row-menu-item-label">{item.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export { RowActionMenu as RowActionsMenu };
export default RowActionMenu;
