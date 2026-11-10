import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/authService.js';
import {
  confirmStillHere,
  endIdleSession,
  IDLE_CLEARED_EVENT,
  IDLE_PROMPT_EVENT,
  startIdleSessionWatch,
} from '../api/sessionActivity.js';
import { StillHereDialog } from './StillHereDialog.jsx';

/** One inactivity monitor for every signed-in page and role. */
export function IdleSessionMonitor() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const show = () => setOpen(true);
    const hide = () => setOpen(false);
    const ended = () => {
      setOpen(false);
      if (window.location.pathname !== '/login') {
        navigateRef.current('/login', { replace: true });
      }
    };
    window.addEventListener(IDLE_PROMPT_EVENT, show);
    window.addEventListener(IDLE_CLEARED_EVENT, hide);
    window.addEventListener('session-ended', ended);
    const stop = startIdleSessionWatch();
    return () => {
      window.removeEventListener(IDLE_PROMPT_EVENT, show);
      window.removeEventListener(IDLE_CLEARED_EVENT, hide);
      window.removeEventListener('session-ended', ended);
      stop();
      setOpen(false);
    };
  }, []);

  const stay = useCallback(() => {
    confirmStillHere();
    setOpen(false);
  }, []);

  const signOut = useCallback(() => {
    setOpen(false);
    logout();
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <StillHereDialog
      isOpen={open}
      onStay={stay}
      onLogout={signOut}
      onExpire={endIdleSession}
    />
  );
}
