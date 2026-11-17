import { useEffect, useRef } from 'react';
import { prefersReducedMotion, useSessionSummary, useStartFlow, type StartProps } from './shared';

/** How long the opening animation runs before the Continue button appears. Matches the CSS delays under `.splash`. */
const INTRO_MS = 3000;
const EXIT_MS = 450;

/** Classic skin: the app icon in orbit, a title and three boot lines. */
export function ClassicStart({ onEnter, onDone }: StartProps) {
  const session = useSessionSummary();
  const button = useRef<HTMLButtonElement>(null);
  const { ready, leaving, skip, enter } = useStartFlow(INTRO_MS, () => {
    onEnter();
    setTimeout(onDone, prefersReducedMotion() ? 0 : EXIT_MS);
  });

  useEffect(() => {
    if (ready) button.current?.focus();
  }, [ready]);

  return (
    <div
      className={`splash ${ready ? 'ready' : ''} ${leaving ? 'leaving' : ''}`}
      data-screen="start"
      role="dialog"
      aria-modal="true"
      aria-label="Earth Online 2.0"
      onClick={skip}
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
            <span>Loading character: {session.name}</span>
            <b>{session.title}</b>
          </li>
          <li>
            <span>Week of {session.week}</span>
            <b>{session.weekStatus}</b>
          </li>
        </ul>

        <div className="splash-action">
          <button
            ref={button}
            className="splash-continue"
            data-action="continue"
            onClick={enter}
            aria-disabled={!ready}
            tabIndex={ready ? 0 : -1}
          >
            Continue
          </button>
          <span className="splash-hint">{ready ? 'or press Enter' : 'Press Enter to start · tap to skip'}</span>
        </div>
      </div>
    </div>
  );
}
