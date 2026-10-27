import { useEffect, useRef } from 'react';

const SHORTCUTS = [
  ['?', 'Open or close this list'],
  ['/', 'Move focus to the search box on the current page'],
  ['Esc', 'Close this list and the mobile menu'],
  ['Tab', 'The first stop is Skip to content'],
];

export function ShortcutDialog({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    return undefined;
  }, [open]);

  if (!open) return null;

  return (
    <div className="shortcut-dialog-backdrop" onClick={onClose}>
      <div
        className="shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="settings-kicker">Keyboard</p>
        <h3 id="shortcut-dialog-title">Shortcuts</h3>
        <ul className="shortcut-list">
          {SHORTCUTS.map(([key, description]) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{description}</span>
            </li>
          ))}
        </ul>
        <div className="settings-actions">
          <button ref={closeRef} className="button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
