import { useCallback, useEffect, useState } from 'react';
import { notifyDesktop, playToastSound } from '../../settings/feedback.js';
import { getPreferences } from '../../settings/preferences.js';

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return undefined;
    const prefs = getPreferences();
    if (prefs.toastSound) {
      try { playToastSound(); } catch { /* sound is optional */ }
    }
    if (prefs.desktopNotifications && document.hidden) {
      notifyDesktop('CORVEX', toast.message);
    }
    const timer = window.setTimeout(() => setToast(null), prefs.longerToasts ? 8000 : 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, showToast, clearToast };
}

export function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type}`} role="status">
      <span>{toast.message}</span>
      <button className="toast-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}
