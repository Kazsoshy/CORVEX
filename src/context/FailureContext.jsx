import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export const FailureContext = createContext(null);

export function FailureProvider({ children }) {
  const [systemFailures, setSystemFailures] = useState([]);

  const logFailure = useCallback((failure) => {
    setSystemFailures((prev) => [
      {
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        time: new Date().toLocaleTimeString(),
        ...failure,
      },
      ...prev,
    ].slice(0, 50)); // keep last 50 failures
  }, []);

  const clearFailures = useCallback(() => {
    setSystemFailures([]);
  }, []);

  useEffect(() => {
    const handleApiFailure = (event) => {
      if (event.detail) {
        logFailure(event.detail);
      }
    };
    window.addEventListener('api-failure', handleApiFailure);
    return () => window.removeEventListener('api-failure', handleApiFailure);
  }, [logFailure]);

  return (
    <FailureContext.Provider value={{ systemFailures, logFailure, clearFailures }}>
      {children}
    </FailureContext.Provider>
  );
}

export function useFailures() {
  const context = useContext(FailureContext);
  if (!context) {
    throw new Error('useFailures must be used within a FailureProvider');
  }
  return context;
}
