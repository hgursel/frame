import React, { useEffect, useState } from 'react';
import { AccountSettings } from './Accounts.js';

type Appearance = 'light' | 'dark' | 'system';

export function useAppearance() {
  const [theme, setTheme] = useState<Appearance>(() => {
    const saved = localStorage.getItem('frame-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (system.matches ? 'dark' : 'light') : theme;
    };
    apply();
    localStorage.setItem('frame-theme', theme);
    system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [theme]);
  return [theme, setTheme] as const;
}

export function UserSettings({
  theme,
  onThemeChange,
}: {
  theme: Appearance;
  onThemeChange: (theme: Appearance) => void;
}) {
  return (
    <section className="settings-panel settings-page user-settings">
      <h1>Settings</h1>
      <p className="muted">Manage your appearance and account.</p>
      <div className="settings-content">
        <section className="appearance-settings">
          <h2>Appearance</h2>
          <label>
            Color theme
            <select
              value={theme}
              onChange={(event) => onThemeChange(event.target.value as Appearance)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <p className="muted">
            System follows your device’s appearance. Your choice is saved in this browser.
          </p>
        </section>
        <AccountSettings />
      </div>
    </section>
  );
}
