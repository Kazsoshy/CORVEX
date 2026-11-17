import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

/**
 * Shared ⋮ overflow menu used across CORVEX list tables.
 * @param {{ items: Array<{ key: string, label: string, onSelect: () => void, disabled?: boolean, title?: string, danger?: boolean }|null|false>, label?: string }} props
 */
export function RowActionMenu({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    update();
    const onDoc = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', onDoc);
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
        onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}
      >
        ⋮
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="panel user-row-menu"
          style={{ top: pos?.top ?? -9999, right: pos?.right ?? 0 }}
          onClick={(event) => event.stopPropagation()}
        >
          {visible.map((item) => (
            <button
              key={item.key}
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
      ) : null}
    </>
  );
}
