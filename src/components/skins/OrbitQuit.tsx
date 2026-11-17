import { useEffect, useRef } from 'react';
import { EarthCanvas, easeOut, type EarthHandle, type EarthViewSpec } from './EarthCanvas';
import { GOODBYE_TITLE, goodbyeMessage, prefersReducedMotion, useQuitFlow, useSessionSummary, type QuitProps } from './shared';

/** Timeline in ms. The CSS under `.orbit.quit` uses the same numbers. */
const OUTRO_MS = 10000;
const PULL_BACK_MS = 8500;

/** Just above the surface, where the start screen's dive ended. */
const LIFT_OFF: EarthViewSpec = { x: 1.2, y: -2, r: 4 };
/** A pale blue dot above the goodbye text. */
const PALE_DOT: EarthViewSpec = (aspect) => ({ x: 0, y: aspect >= 1 ? 0.3 : 0.52, r: 0.045 });

/** Orbit skin goodbye: the camera lifts off through a flash and leaves Earth behind as a small blue dot. */
export function OrbitQuit({ onReturn }: QuitProps) {
  const session = useSessionSummary();
  const earth = useRef<EarthHandle>(null);
  const reduced = prefersReducedMotion();
  const done = useQuitFlow(reduced ? 5000 : OUTRO_MS);

  useEffect(() => {
    earth.current?.animateTo(PALE_DOT, PULL_BACK_MS, easeOut);
  }, []);

  return (
    <div className="orbit quit" data-screen="quit" role="dialog" aria-modal="true" aria-label="Goodbye">
      <EarthCanvas ref={earth} initial={reduced ? PALE_DOT : LIFT_OFF} />

      <div className="orbit-center orbit-goodbye">
        <ul className="orbit-log">
          <li>
            <span>Saving progress</span>
            <b>OK</b>
          </li>
          <li>
            <span>
              Day {session.day} · {session.title}
            </span>
            <b>logged out</b>
          </li>
          <li>
            <span>This week</span>
            <b>{session.weekChange}</b>
          </li>
        </ul>

        <h1 className="orbit-title orbit-thanks">{GOODBYE_TITLE}</h1>
        <p className="orbit-message">{goodbyeMessage(session.name)}</p>

        <div className={`orbit-after ${done ? 'done' : ''}`}>
          <span className="orbit-prompt">You can close this tab now.</span>
          <button className="orbit-return" data-action="return" onClick={onReturn} disabled={!done}>
            Back to the game
          </button>
        </div>
      </div>

      <div className="orbit-flash" aria-hidden />
    </div>
  );
}
