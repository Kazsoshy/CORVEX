import { useEffect } from 'react';

export function LogoutConfirmDialog({ isOpen, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="logout-dialog-title">Logout Confirmation</h3>
        </div>
        <p className="muted" style={{ margin: 0 }}>Are you sure you want to log out?</p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onCancel}>No</button>
          <button className="button danger" type="button" onClick={onConfirm}>Yes</button>
        </div>
      </div>
    </div>
  );
}
