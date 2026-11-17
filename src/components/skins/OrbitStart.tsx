import { useEffect, useRef } from 'react';
import { EarthCanvas, easeIn, easeInOut, type EarthHandle, type EarthViewSpec } from './EarthCanvas';
import { prefersReducedMotion, useSessionSummary, useStartFlow, type StartProps } from './shared';

/** Timeline in ms. The CSS under `.orbit` uses the same numbers. */
const INTRO_MS = 3400; // camera settles, then title and controls fade in
const DIVE_MS = 1300; // Continue: fly into the planet
const FLASH_AT = 950; // the screen is fully white: mount the app underneath
const FADE_MS = 800; // white fades out to reveal the home page

/** Opening shot: the whole planet, small, in the middle of the screen. */
const FAR: EarthViewSpec = { x: 0, y: 0.03, r: 0.17 };
/** Title shot: low orbit, with the limb sweeping up from the bottom-left to the right edge. */
export const LIMB: EarthViewSpec = (aspect) =>
  aspect >= 1 ? { x: 0.55 * aspect, y: -1.3, r: 1.7 } : { x: 0.35, y: -1.35, r: 1.3 };
/** Deep inside the sunlit side: by the time the camera gets here the flash covers the screen. */
export const SURFACE: EarthViewSpec = { x: 5.4, y: -9, r: 18 };

const TIPS = [
  'Every point you gain is 1 XP. Losing points never lowers your level.',
  'Your class follows your highest stat. Your rank follows your level.',
  'Getting every stat to 15 earns a bonus to all six.',
  'The Game Master reads your rule book word for word. Edit a rule and the scoring changes.',
  'One check-in a week. Doing it again replaces the earlier result.',
  'Ask the Game Master for quests when one stat falls behind.',
];

/** Orbit skin: a rotating Earth seen from low orbit. Continue dives into it through a white flash. */
export function OrbitStart({ onEnter, onDone }: StartProps) {
  const session = useSessionSummary();
  const earth = useRef<EarthHandle>(null);
  const button = useRef<HTMLButtonElement>(null);
  const reduced = prefersReducedMotion();

  const { ready, leaving, skip, enter } = useStartFlow(INTRO_MS, () => {
    earth.current?.animateTo(SURFACE, DIVE_MS, easeIn);
    setTimeout(onEnter, reduced ? 0 : FLASH_AT);
    setTimeout(onDone, reduced ? 0 : FLASH_AT + FADE_MS);
  });

  // Fly in from deep space on mount.
  useEffect(() => {
    earth.current?.animateTo(LIMB, INTRO_MS - 800, easeInOut);
  }, []);

  // Skipping the intro hurries the camera to the title shot.
  const skipped = useRef(false);
  const skipIntro = () => {
    if (!ready && !skipped.current) {
      skipped.current = true;
      earth.current?.animateTo(LIMB, 500, easeInOut);
    }
    skip();
  };

  useEffect(() => {
    if (ready) button.current?.focus();
  }, [ready]);

  return (
    <div
      className={`orbit ${ready ? 'ready' : ''} ${leaving ? 'leaving' : ''}`}
      data-screen="start"
      role="dialog"
      aria-modal="true"
      aria-label="Earth Online 2.0"
      onClick={skipIntro}
    >
      <EarthCanvas ref={earth} initial={reduced ? LIMB : FAR} />
      <div className="orbit-shade" aria-hidden />

      <div className="orbit-meta">
        Earth Online · Ver 2.0
        <br />
        <b className="orbit-day">Day {session.day}</b> · Week of {session.week}
      </div>

      <div className="orbit-center">
        <h1 className="orbit-title">
          Earth <span>Online</span>
        </h1>
        <p className="orbit-tagline">Level up your real life</p>

        <div className="orbit-server">
          <span className="orbit-live" aria-hidden />
          <span>Server: Earth</span>
          <span className="orbit-who">
            {session.name} · <b>{session.title}</b>
          </span>
        </div>

        <button
          ref={button}
          className="orbit-continue"
          data-action="continue"
          onClick={enter}
          aria-disabled={!ready}
          tabIndex={ready ? 0 : -1}
        >
          Continue
        </button>
        <span className="orbit-prompt">{ready ? 'or press Enter' : 'Press Enter to start · tap to skip'}</span>
      </div>

      <div className="orbit-foot">
        <div className="orbit-tip">Tip: {TIPS[session.day % TIPS.length]}</div>
      </div>

      <div className="orbit-flash" aria-hidden />
    </div>
  );
}
