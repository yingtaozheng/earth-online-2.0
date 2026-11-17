// Logic every start/goodbye skin shares, so a skin only has to decide how things look.

import { useEffect, useRef, useState } from 'react';
import { classTitle, formatDeltas, rankTitle, weekDeltas } from '../../lib/scoring';
import { daysBetween, endOfWeek, toWeekId, weekLabel } from '../../lib/week';
import { useCharacter, useGame } from '../../state/store';

export interface StartProps {
  /** The player chose to enter: the app should mount underneath the start screen. */
  onEnter: () => void;
  /** The exit animation is over: the start screen can be removed. */
  onDone: () => void;
}

export interface QuitProps {
  onReturn: () => void;
}

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The facts both screens print: who is playing, how far along they are, and how this week is going. */
export function useSessionSummary() {
  const { state } = useGame();
  const { stats, level } = useCharacter();
  const now = new Date();
  const { weekStartsOn, startedAt, characterName } = state.settings;
  const weekId = toWeekId(now, weekStartsOn);
  const daysLeft = daysBetween(now, endOfWeek(now, weekStartsOn));
  const checkedIn = state.checkins.some((c) => c.weekId === weekId);
  return {
    name: characterName,
    title: `Lv ${level} ${rankTitle(level)} ${classTitle(stats)}`,
    day: daysBetween(new Date(startedAt), now) + 1,
    week: weekLabel(weekId),
    weekStatus: checkedIn ? 'checked in' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`,
    weekChange: formatDeltas(weekDeltas(state.ledger, weekId)),
  };
}

/**
 * Start-screen flow: an intro that ends by itself after `introMs` or when
 * skipped, then one `enter()` that can only fire once. Enter on the keyboard
 * starts the game at any point, wherever the focus is; any other key skips the intro.
 */
export function useStartFlow(introMs: number, onEnter: () => void) {
  const [ready, setReady] = useState(prefersReducedMotion);
  const [leaving, setLeaving] = useState(false);
  const entered = useRef(false);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), introMs);
    return () => clearTimeout(timer);
  }, [ready, introMs]);

  const skip = () => setReady(true);
  const enter = () => {
    if (entered.current) return;
    entered.current = true;
    setReady(true);
    setLeaving(true);
    onEnter();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        enter();
      } else if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) {
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return { ready, leaving, skip, enter };
}

/**
 * Goodbye flow: after `outroMs` the screen is "done" and the page tries to
 * close itself. Browsers only allow that for an installed app window, so in an
 * ordinary tab the screen stays up and the skin shows a way back.
 */
export function useQuitFlow(outroMs: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      window.close();
    }, outroMs);
    return () => clearTimeout(timer);
  }, [outroMs]);
  return done;
}

export const GOODBYE_TITLE = 'Thank you for playing';
export const goodbyeMessage = (name: string) =>
  `The server never shuts down, ${name}. Every hour out there still counts, so go and earn it. See you at the next weekly reset.`;
