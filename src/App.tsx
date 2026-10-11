import { useEffect, useState } from 'react';
import { GameClock } from './components/GameClock';
import { CharacterPage } from './pages/CharacterPage';
import { CheckInPage } from './pages/CheckInPage';
import { HistoryPage } from './pages/HistoryPage';
import { QuestsPage } from './pages/QuestsPage';
import { RulesPage } from './pages/RulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useGame } from './state/store';

const TABS = [
  { id: 'character', label: 'Character', icon: '⚔️' },
  { id: 'checkin', label: 'Check-in', icon: '🧙' },
  { id: 'quests', label: 'Quests', icon: '📜' },
  { id: 'history', label: 'History', icon: '📈' },
  { id: 'rules', label: 'Rules', icon: '📖' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
] as const;

export type Tab = (typeof TABS)[number]['id'];

const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'character';
};

export function App() {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  const go = (next: Tab) => {
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          <div>
            EARTH ONLINE 2.0
            <small>Level up your real life</small>
          </div>
        </div>
        <GameClock />
      </header>

      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <span className="icon" aria-hidden>
              {t.icon}
            </span>{' '}
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'character' && <CharacterPage go={go} />}
        {tab === 'checkin' && <CheckInPage go={go} />}
        {tab === 'quests' && <QuestsPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'rules' && <RulesPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
