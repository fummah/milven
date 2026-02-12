import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const SettingsContext = createContext({ settings: {}, refresh: async () => {}, setPartial: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
  const refresh = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      // unauthenticated users get defaults
      setSettings((prev) => prev && Object.keys(prev).length ? prev : {});
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        // non-admins will get 403; keep current settings
        return;
      }
      const data = await res.json();
      setSettings(data.settings || {});
    } catch {
      // ignore network errors
    }
  };
  useEffect(() => {
    refresh();
    const onAuth = () => refresh();
    window.addEventListener('auth:changed', onAuth);
    window.addEventListener('storage', onAuth);
    return () => {
      window.removeEventListener('auth:changed', onAuth);
      window.removeEventListener('storage', onAuth);
    };
  }, []);
  const setPartial = (partial) => setSettings(prev => ({ ...prev, ...partial }));
  const value = useMemo(() => ({ settings, refresh, setPartial }), [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

