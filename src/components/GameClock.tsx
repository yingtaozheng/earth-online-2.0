import { useGame } from '../state/store';
import { useNow } from '../lib/useNow';
import { daysBetween, endOfWeek, formatCountdown, toWeekId, weekLabel } from '../lib/week';

/** Real-time clock: game time is real time. Shows day count and the countdown to the weekly reset. */
export function GameClock() {
  const { state } = useGame();
  const now = useNow(1000);
  const { weekStartsOn, startedAt } = state.settings;
  const day = daysBetween(new Date(startedAt), now) + 1;
  const reset = endOfWeek(now, weekStartsOn);
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="clock" role="timer" aria-label="Game clock">
      <span>
        <span className="live" aria-hidden />
        <strong>{time}</strong>
      </span>
      <span>
        Day <strong>{day}</strong>
      </span>
      <span title={weekLabel(toWeekId(now, weekStartsOn))}>
        Weekly reset in <strong>{formatCountdown(reset.getTime() - now.getTime())}</strong>
      </span>
    </div>
  );
}
