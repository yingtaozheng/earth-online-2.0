import { GOODBYE_TITLE, goodbyeMessage, prefersReducedMotion, useQuitFlow, useSessionSummary, type QuitProps } from './shared';

/** How long the goodbye plays before the tab tries to close. Matches the CSS delays under `.splash.quit`. */
const OUTRO_MS = 9000;

/** Classic skin goodbye: the same stage as the start screen, played as a sign-off. */
export function ClassicQuit({ onReturn }: QuitProps) {
  const session = useSessionSummary();
  const done = useQuitFlow(prefersReducedMotion() ? 5000 : OUTRO_MS);

  return (
    <div className="splash quit" data-screen="quit" role="dialog" aria-modal="true" aria-label="Goodbye">
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
              Day {session.day} · {session.title}
            </span>
            <b>logged out</b>
          </li>
          <li>
            <span>This week</span>
            <b>{session.weekChange}</b>
          </li>
        </ul>

        <h1 className="splash-title quit-title">{GOODBYE_TITLE}</h1>
        <p className="splash-tagline quit-message">{goodbyeMessage(session.name)}</p>

        <div className={`splash-action quit-action ${done ? 'done' : ''}`}>
          <span className="splash-hint">You can close this tab now.</span>
          <button className="btn small ghost quit-return" data-action="return" onClick={onReturn} disabled={!done}>
            Back to the game
          </button>
        </div>
      </div>
    </div>
  );
}
