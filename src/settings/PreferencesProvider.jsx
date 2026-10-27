import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  PREF_EVENT,
  applyPreferences,
  getPreferences,
  resetPreferenceGroup,
  updatePreferences,
} from './preferences.js';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(getPreferences);
  const [mediaTick, setMediaTick] = useState(0);

  useEffect(() => {
    applyPreferences(prefs);
  }, [prefs, mediaTick]);

  useEffect(() => {
    const onChange = (event) => setPrefs(event.detail);
    window.addEventListener(PREF_EVENT, onChange);
    const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMedia = () => {
      applyPreferences(getPreferences());
      setMediaTick((tick) => tick + 1);
    };
    themeQuery.addEventListener('change', onMedia);
    motionQuery.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener(PREF_EVENT, onChange);
      themeQuery.removeEventListener('change', onMedia);
      motionQuery.removeEventListener('change', onMedia);
    };
  }, []);

  useEffect(() => {
    if (!prefs.readingGuide) return undefined;
    const band = document.createElement('div');
    band.className = 'reading-guide';
    band.setAttribute('aria-hidden', 'true');
    document.body.appendChild(band);
    const move = (event) => {
      band.style.transform = `translateY(${Math.max(0, event.clientY - 18)}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      band.remove();
    };
  }, [prefs.readingGuide]);

  const value = useMemo(() => ({
    prefs,
    mediaTick,
    update: updatePreferences,
    resetGroup: resetPreferenceGroup,
  }), [prefs, mediaTick]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (value) return value;
  return {
    prefs: getPreferences(),
    mediaTick: 0,
    update: updatePreferences,
    resetGroup: resetPreferenceGroup,
  };
}
