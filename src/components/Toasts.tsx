import { useEffect, useRef, useState } from 'react';
import { formatDeltas, rankTitle, unlockedAchievementIds } from '../lib/scoring';
import { useCharacter, useGame } from '../state/store';

interface Toast {
  id: number;
  icon: string;
  title: string;
  detail: string;
}

const SHOW_MS = 6000;
const MAX_AT_ONCE = 4;
let nextId = 1;

/**
 * Announces level-ups and newly unlocked achievements. It compares each state
 * with the one before it, so whatever was already unlocked when the app opened
 * stays quiet.
 */
export function Toasts() {
  const { state } = useGame();
  const { level } = useCharacter();
  const seen = useRef<{ level: number; unlocked: Set<string> } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unlocked = unlockedAchievementIds(state.ledger);
    const before = seen.current;
    seen.current = { level, unlocked };
    if (!before) return;

    const fresh: Toast[] = [];
    if (level > before.level) {
      fresh.push({ id: nextId++, icon: '⭐', title: `Level up! You are now Lv ${level}`, detail: rankTitle(level) });
    }
    for (const a of state.achievements) {
      if (unlocked.has(a.id) && !before.unlocked.has(a.id)) {
        fresh.push({ id: nextId++, icon: a.icon, title: `Achievement unlocked: ${a.title}`, detail: formatDeltas(a.reward) });
      }
    }
    if (fresh.length === 0) return;
    const shown = fresh.slice(0, MAX_AT_ONCE);
    setToasts((list) => [...list, ...shown].slice(-MAX_AT_ONCE));
    const ids = new Set(shown.map((t) => t.id));
    setTimeout(() => setToasts((list) => list.filter((t) => !ids.has(t.id))), SHOW_MS);
  }, [state.ledger, state.achievements, level]);

  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className="toast" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} title="Dismiss">
          <span className="toast-icon" aria-hidden>
            {t.icon}
          </span>
          <span className="stack" style={{ gap: 0 }}>
            <strong>{t.title}</strong>
            <span className="small muted">{t.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
