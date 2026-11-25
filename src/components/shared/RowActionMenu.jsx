import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Shared ⋮ overflow menu used across CORVEX list tables.
 * Supports screen edge flip (fitsBelow) and keyboard navigation (Escape).
 *
 * @param {{
 *   items: Array<{ key?: string, label: string, onSelect: () => void, disabled?: boolean, title?: string, danger?: boolean }|null|false>,
 *   label?: string
 * }} props
 */
export function RowActionMenu({ items = [], label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || 0;
    const fitsBelow = rect.bottom + menuHeight + 8 < window.innerHeight;
    setPos({
      top: fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const visible = (items || []).filter(Boolean);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button ghost user-row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋮
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="panel user-row-menu"
              style={{ top: pos?.top ?? -9999, right: pos?.right ?? 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              {visible.map((item, idx) => (
                <button
                  key={item.key || item.label || idx}
                  type="button"
                  role="menuitem"
                  className={`button ghost user-row-menu-item${item.danger ? ' danger-text' : ''}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export { RowActionMenu as RowActionsMenu };
export default RowActionMenu;
