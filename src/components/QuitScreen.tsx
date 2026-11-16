import { useEffect, useState } from 'react';
import { classTitle, formatDeltas, rankTitle, weekDeltas } from '../lib/scoring';
import { daysBetween, toWeekId } from '../lib/week';
import { useCharacter, useGame } from '../state/store';
import { prefersReducedMotion } from './StartScreen';

/** How long the goodbye plays before the tab tries to close. Matches the CSS delays under `.splash.quit`. */
const OUTRO_MS = 4200;

/**
 * Goodbye screen. Nothing needs saving here (every change is already in
 * localStorage); it is a send-off. Browsers only let a page close itself when
 * it runs as an installed app or was opened by script, so in an ordinary tab
 * the screen stays and offers a way back.
 */
export function QuitScreen({ onReturn }: { onReturn: () => void }) {
  const { state } = useGame();
  const { stats, level } = useCharacter();
  const [done, setDone] = useState(false);

  const now = new Date();
  const day = daysBetween(new Date(state.settings.startedAt), now) + 1;
  const week = weekDeltas(state.ledger, toWeekId(now, state.settings.weekStartsOn));

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setDone(true);
        window.close();
      },
      prefersReducedMotion() ? 1500 : OUTRO_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="splash quit" role="dialog" aria-modal="true" aria-label="Goodbye">
      <div className="splash-stars" aria-hidden />
      <div className="splash-inner">
        <div className="splash-globe" aria-hidden>
          <span className="splash-orbit">
            <span className="splash-moon" />
          </span>
          <img src="./icon.svg" alt="" />
        </div>

        <ul className="splash-boot">
          <li>
            <span>Saving progress</span>
            <b>OK</b>
          </li>
          <li>
            <span>
              Day {day} · Lv {level} {rankTitle(level)} {classTitle(stats)}
            </span>
            <b>logged out</b>
          </li>
          <li>
            <span>This week</span>
            <b>{formatDeltas(week)}</b>
          </li>
        </ul>

        <h1 className="splash-title quit-title">Thank you for playing</h1>
        <p className="splash-tagline quit-message">
          The server never shuts down, {state.settings.characterName}. Every hour out there still counts, so go and
          earn it. See you at the next weekly reset.
        </p>

        <div className={`splash-action quit-action ${done ? 'done' : ''}`}>
          <span className="splash-hint">You can close this tab now.</span>
          <button className="btn small ghost quit-return" onClick={onReturn} disabled={!done}>
            Back to the game
          </button>
        </div>
      </div>
    </div>
  );
}
