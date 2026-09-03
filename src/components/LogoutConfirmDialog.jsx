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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div className="panel form-panel" style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <div className="panel-section-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Logout Confirmation</h3>
        </div>
        <div style={{ padding: '0 4px' }}>
          <p style={{ margin: 0, color: '#334155', fontSize: '0.95rem' }}>Are you sure you want to log out?</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="button secondary" type="button" onClick={onCancel}>No</button>
            <button className="button" type="button" style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }} onClick={onConfirm}>Yes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
