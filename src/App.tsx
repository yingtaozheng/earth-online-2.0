import { useEffect, useState } from 'react';
import { GameClock } from './components/GameClock';
import { QuitScreen } from './components/QuitScreen';
import { StartScreen } from './components/StartScreen';
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

  // The start screen covers the app on every launch; the app mounts underneath as it fades out.
  // Quitting swaps the app for the goodbye screen; coming back replays the start screen.
  const [intro, setIntro] = useState<'showing' | 'leaving' | 'gone' | 'quit'>('showing');
  if (intro === 'quit') return <QuitScreen onReturn={() => setIntro('showing')} />;
  return (
    <>
      {intro !== 'gone' && <StartScreen onEnter={() => setIntro('leaving')} onDone={() => setIntro('gone')} />}
      {intro !== 'showing' && <Shell tab={tab} go={go} onQuit={() => setIntro('quit')} />}
    </>
  );
}

function Shell({ tab, go, onQuit }: { tab: Tab; go: (tab: Tab) => void; onQuit: () => void }) {
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
        <div className="row">
          <GameClock />
          <button className="btn quit-btn" onClick={onQuit} title="Quit Earth Online">
            <span aria-hidden>⏻</span> Quit
          </button>
        </div>
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
        {tab === 'quests' && <QuestsPage go={go} />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'rules' && <RulesPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
