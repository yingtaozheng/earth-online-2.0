import { STATS } from '../data/defaults';
import type {
  Achievement,
  CheckIn,
  GameState,
  LedgerEvent,
  StatDeltas,
  StatId,
  StatValues,
  Task,
} from '../types';
import { STAT_IDS } from '../types';
import { uid } from './id';
import { addWeeks, toWeekId, weeksBetween } from './week';

// ---------- stats ----------

/** Replays the ledger in order. Stats never drop below 0. */
export function computeStats(base: StatValues, ledger: LedgerEvent[]): StatValues {
  const stats = { ...base };
  for (const event of ledger) {
    for (const id of STAT_IDS) {
      const d = event.deltas[id];
      if (d) stats[id] = Math.max(0, stats[id] + d);
    }
  }
  return stats;
}

export function sumDeltas(...all: StatDeltas[]): StatDeltas {
  const out: StatDeltas = {};
  for (const deltas of all) {
    for (const id of STAT_IDS) {
      const d = deltas[id];
      if (d) out[id] = (out[id] ?? 0) + d;
    }
  }
  return cleanDeltas(out);
}

export function capDeltas(deltas: StatDeltas, cap: number): StatDeltas {
  const out: StatDeltas = {};
  for (const id of STAT_IDS) {
    const d = deltas[id];
    if (d) out[id] = Math.max(-cap, Math.min(cap, d));
  }
  return cleanDeltas(out);
}

function cleanDeltas(deltas: StatDeltas): StatDeltas {
  const out: StatDeltas = {};
  for (const id of STAT_IDS) {
    const d = deltas[id];
    if (d) out[id] = d;
  }
  return out;
}

export function weekDeltas(ledger: LedgerEvent[], weekId: string): StatDeltas {
  return sumDeltas(...ledger.filter((e) => e.weekId === weekId).map((e) => e.deltas));
}

export function formatDeltas(deltas: StatDeltas): string {
  const parts = STAT_IDS.filter((id) => deltas[id]).map(
    (id) => `${deltas[id]! > 0 ? '+' : ''}${deltas[id]} ${STATS[id].abbr}`,
  );
  return parts.length ? parts.join(', ') : 'no change';
}

// ---------- XP & levels ----------

/** XP is every point ever gained. Losses lower stats but never XP, so levels never go down. */
export function totalXp(ledger: LedgerEvent[]): number {
  let xp = 0;
  for (const event of ledger) {
    for (const id of STAT_IDS) {
      const d = event.deltas[id];
      if (d && d > 0) xp += d;
    }
  }
  return xp;
}

/** Cumulative XP needed to reach `level`: 0, 5, 15, 30, 50, 75, … */
export function xpForLevel(level: number): number {
  return (5 * level * (level - 1)) / 2;
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return { level, xpIntoLevel: xp - floor, xpForNext: ceil - floor, progress: (xp - floor) / (ceil - floor) };
}

export function classTitle(stats: StatValues): string {
  const max = Math.max(...STAT_IDS.map((id) => stats[id]));
  const top = STAT_IDS.filter((id) => stats[id] === max);
  if (top.length > 2) return 'Adventurer';
  return top.map((id) => STATS[id].classTitle).join('-');
}

// ---------- check-in streaks ----------

export function longestStreak(weekIds: string[]): number {
  const sorted = [...new Set(weekIds)].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && weeksBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Streak still alive: counts back from this week, or last week if this week isn't checked in yet. */
export function currentStreak(weekIds: string[], currentWeekId: string): number {
  const set = new Set(weekIds);
  let cursor = set.has(currentWeekId) ? currentWeekId : addWeeks(currentWeekId, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addWeeks(cursor, -1);
  }
  return streak;
}

// ---------- tasks ----------

export function isTaskDone(task: Task, ledger: LedgerEvent[], weekId: string): boolean {
  return ledger.some(
    (e) => e.source === 'task' && e.refId === task.id && (task.repeat === 'once' || e.weekId === weekId),
  );
}

export function tasksCompletedCount(ledger: LedgerEvent[]): number {
  return ledger.filter((e) => e.source === 'task').length;
}

// ---------- achievements ----------

export function unlockedAchievementIds(ledger: LedgerEvent[]): Set<string> {
  return new Set(ledger.filter((e) => e.source === 'achievement' && e.refId).map((e) => e.refId!));
}

interface ProgressContext {
  stats: StatValues;
  level: number;
  checkins: CheckIn[];
  tasksCompleted: number;
}

function progressContext(state: GameState): ProgressContext {
  return {
    stats: computeStats(state.baseStats, state.ledger),
    level: levelInfo(totalXp(state.ledger)).level,
    checkins: state.checkins,
    tasksCompleted: tasksCompletedCount(state.ledger),
  };
}

/** Returns {current, target} for auto achievements, or null for manual ones. */
export function achievementProgress(
  achievement: Achievement,
  ctx: ProgressContext,
): { current: number; target: number } | null {
  const c = achievement.condition;
  switch (c.kind) {
    case 'manual':
      return null;
    case 'checkins':
      return { current: ctx.checkins.length, target: c.count };
    case 'streak':
      return { current: longestStreak(ctx.checkins.map((ci) => ci.weekId)), target: c.weeks };
    case 'statReaches':
      return { current: ctx.stats[c.statId], target: c.value };
    case 'tasksCompleted':
      return { current: ctx.tasksCompleted, target: c.count };
    case 'level':
      return { current: ctx.level, target: c.level };
  }
}

export function achievementProgressFor(state: GameState) {
  const ctx = progressContext(state);
  return (a: Achievement) => achievementProgress(a, ctx);
}

/**
 * Unlocks every auto achievement whose condition is now met. Rewards can push
 * other stats over a threshold, so this repeats until nothing new unlocks.
 * Once unlocked, an achievement stays unlocked even if the stat later drops.
 */
export function applyAutoAchievements(state: GameState, now = new Date()): GameState {
  let current = state;
  for (let guard = 0; guard < 50; guard++) {
    const unlocked = unlockedAchievementIds(current.ledger);
    const ctx = progressContext(current);
    const ready = current.achievements.filter((a) => {
      if (unlocked.has(a.id)) return false;
      const p = achievementProgress(a, ctx);
      return p !== null && p.current >= p.target;
    });
    if (ready.length === 0) return current;
    const weekId = toWeekId(now, current.settings.weekStartsOn);
    current = {
      ...current,
      ledger: [...current.ledger, ...ready.map((a) => achievementEvent(a, weekId, now))],
    };
  }
  return current;
}

export function achievementEvent(a: Achievement, weekId: string, now = new Date()): LedgerEvent {
  return {
    id: uid('ev-'),
    at: now.toISOString(),
    weekId,
    source: 'achievement',
    refId: a.id,
    title: `Achievement unlocked: ${a.title}`,
    deltas: { ...a.reward },
  };
}

// ---------- history ----------

export interface WeekPoint {
  weekId: string;
  values: StatValues;
  change: StatDeltas;
}

/**
 * Stat values at the end of each week, from the first week with activity (or
 * the week the character was created) through `currentWeekId`. Weeks with no
 * events carry the previous values forward.
 */
export function weeklySeries(state: GameState, currentWeekId: string): WeekPoint[] {
  const firstEventWeek = state.ledger.reduce<string | null>(
    (min, e) => (min === null || e.weekId < min ? e.weekId : min),
    null,
  );
  const createdWeek = toWeekId(new Date(state.settings.startedAt), state.settings.weekStartsOn);
  let start = firstEventWeek && firstEventWeek < createdWeek ? firstEventWeek : createdWeek;
  if (start > currentWeekId) start = currentWeekId;

  // Ledger order matters for the zero floor, so replay events in ledger order per week.
  const points: WeekPoint[] = [];
  let values = { ...state.baseStats };
  for (let week = start, i = 0; week <= currentWeekId && i < 520; week = addWeeks(week, 1), i++) {
    const events = state.ledger.filter((e) => e.weekId === week);
    values = computeStats(values, events);
    points.push({ weekId: week, values, change: sumDeltas(...events.map((e) => e.deltas)) });
  }
  return points;
}

export function statIdsWithChange(deltas: StatDeltas): StatId[] {
  return STAT_IDS.filter((id) => deltas[id]);
}
