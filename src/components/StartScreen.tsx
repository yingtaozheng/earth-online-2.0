import { useEffect, useRef, useState } from 'react';
import { classTitle, rankTitle } from '../lib/scoring';
import { daysBetween, endOfWeek, toWeekId, weekLabel } from '../lib/week';
import { useCharacter, useGame } from '../state/store';

/** How long the opening animation runs before the Continue button appears. Matches the CSS delays. */
const INTRO_MS = 3000;
const EXIT_MS = 450;

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Title screen shown on every launch. A tap or any key skips the intro;
 * Continue, or Enter at any time, enters the game.
 */
export function StartScreen({ onEnter, onDone }: { onEnter: () => void; onDone: () => void }) {
  const { state } = useGame();
  const { stats, level } = useCharacter();
  const [ready, setReady] = useState(prefersReducedMotion);
  const [leaving, setLeaving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const entered = useRef(false);

  const now = new Date();
  const weekId = toWeekId(now, state.settings.weekStartsOn);
  const daysLeft = daysBetween(now, endOfWeek(now, state.settings.weekStartsOn));
  const checkedIn = state.checkins.some((c) => c.weekId === weekId);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (ready) button.current?.focus();
  }, [ready]);

  function enter() {
    if (entered.current) return;
    entered.current = true;
    setReady(true);
    setLeaving(true);
    onEnter();
    setTimeout(onDone, prefersReducedMotion() ? 0 : EXIT_MS);
  }

  // Enter starts the game at any point, wherever the focus is. Any other key skips the intro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        enter();
      } else if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) {
        setReady(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className={`splash ${ready ? 'ready' : ''} ${leaving ? 'leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Earth Online 2.0"
      onClick={() => !ready && setReady(true)}
    >
      <div className="splash-stars" aria-hidden />
      <div className="splash-inner">
        <div className="splash-globe" aria-hidden>
          <span className="splash-orbit">
            <span className="splash-moon" />
          </span>
          <img src="./icon.svg" alt="" />
        </div>

        <h1 className="splash-title">
          <span>EARTH ONLINE</span> <span className="splash-version">2.0</span>
        </h1>
        <p className="splash-tagline">Level up your real life</p>

        <ul className="splash-boot">
          <li>
            <span>Connecting to server: Earth</span>
            <b>OK</b>
          </li>
          <li>
            <span>Loading character: {state.settings.characterName}</span>
            <b>
              Lv {level} {rankTitle(level)} {classTitle(stats)}
            </b>
          </li>
          <li>
            <span>Week of {weekLabel(weekId)}</span>
            <b>{checkedIn ? 'checked in' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}</b>
          </li>
        </ul>

        <div className="splash-action">
          <button ref={button} className="splash-continue" onClick={enter} disabled={!ready} tabIndex={ready ? 0 : -1}>
            Continue
          </button>
          <span className="splash-hint">{ready ? 'or press Enter' : 'Press Enter to start · tap to skip'}</span>
        </div>
      </div>
    </div>
  );
}
