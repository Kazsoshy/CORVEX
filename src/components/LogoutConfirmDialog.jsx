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
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#093850' }}>Logout Confirmation</h3>
        </div>
        <div style={{ padding: '0 4px' }}>
          <p style={{ margin: 0, color: '#334155', fontSize: '0.95rem' }}>Are you sure you want to log out?</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={onCancel}>No</button>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }} onClick={onConfirm}>Yes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
