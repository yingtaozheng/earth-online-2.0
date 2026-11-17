import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/defaults';
import { blend } from '../components/skins/EarthCanvas';
import { normalizeState, reducer } from '../state/store';
import type { CheckIn, GameState, LedgerEvent } from '../types';
import {
  applyAutoAchievements,
  capDeltas,
  classTitle,
  computeStats,
  currentStreak,
  laterTierIds,
  levelInfo,
  longestStreak,
  rankTitle,
  withStartPoint,
  nextStatGoal,
  statsWeakestFirst,
  sumDeltas,
  totalXp,
  unlockedAchievementIds,
  weeklySeries,
} from './scoring';
import { addWeeks, alignWeekId, toWeekId } from './week';

const ev = (deltas: LedgerEvent['deltas'], weekId = '2026-10-05'): LedgerEvent => ({
  id: Math.random().toString(36),
  at: new Date().toISOString(),
  weekId,
  source: 'adjust',
  title: 't',
  deltas,
});

const checkin = (weekId: string, applied: CheckIn['applied']): CheckIn => ({
  id: `ci-${weekId}`,
  weekId,
  createdAt: new Date().toISOString(),
  mode: 'manual',
  schedule: '',
  summary: '',
  changes: [],
  questions: [],
  applied,
});

describe('stats', () => {
  it('sums the ledger onto base stats and never drops below zero', () => {
    const base = { int: 1, str: 10, vit: 10, cre: 10, soc: 10, dis: 10 };
    const stats = computeStats(base, [ev({ int: -3 }), ev({ int: 2, str: 2 })]);
    expect(stats.int).toBe(2);
    expect(stats.str).toBe(12);
  });

  it('caps each stat change per week', () => {
    expect(capDeltas({ str: 5, soc: -4, int: 1 }, 3)).toEqual({ str: 3, soc: -3, int: 1 });
  });

  it('drops zero entries when summing', () => {
    expect(sumDeltas({ str: 1 }, { str: -1, int: 2 })).toEqual({ int: 2 });
  });
});

describe('xp & levels', () => {
  it('counts only gains as XP', () => {
    expect(totalXp([ev({ str: 2, soc: -1 }), ev({ int: 3 })])).toBe(5);
  });

  it('levels up on the 0/5/15/30 curve', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(4).level).toBe(1);
    expect(levelInfo(5).level).toBe(2);
    expect(levelInfo(15).level).toBe(3);
    expect(levelInfo(29).level).toBe(3);
    expect(levelInfo(30).level).toBe(4);
  });

  it('names the rank after the level', () => {
    expect([1, 2, 3, 4, 5, 19, 20, 99].map(rankTitle)).toEqual([
      'Newcomer',
      'Newcomer',
      'Apprentice',
      'Apprentice',
      'Journeyman',
      'Champion',
      'Legend',
      'Legend',
    ]);
  });

  it('names the class after the top stat', () => {
    expect(classTitle({ int: 10, str: 14, vit: 10, cre: 10, soc: 10, dis: 10 })).toBe('Warrior');
    expect(classTitle({ int: 10, str: 10, vit: 10, cre: 10, soc: 10, dis: 10 })).toBe('Adventurer');
  });
});

describe('streaks', () => {
  it('finds the longest run of consecutive weeks', () => {
    expect(longestStreak(['2026-09-07', '2026-09-14', '2026-09-28', '2026-10-05', '2026-10-12'])).toBe(3);
  });

  it('keeps the current streak alive until the week is over', () => {
    const weeks = ['2026-09-21', '2026-09-28'];
    expect(currentStreak(weeks, '2026-10-05')).toBe(2);
    expect(currentStreak(weeks, '2026-10-12')).toBe(0);
  });
});

describe('weeks', () => {
  it('uses the configured first day of the week', () => {
    const sat = new Date(2026, 9, 10); // Sat Oct 10 2026
    expect(toWeekId(sat, 1)).toBe('2026-10-05'); // Monday start
    expect(toWeekId(sat, 0)).toBe('2026-10-04'); // Sunday start
    expect(addWeeks('2026-10-05', -1)).toBe('2026-09-28');
  });
});

describe('changing the first day of the week', () => {
  it('moves a week id onto the other grid and leaves matching ids alone', () => {
    expect(alignWeekId('2026-10-05', 0)).toBe('2026-10-04'); // Monday week -> the Sunday week it overlaps
    expect(alignWeekId('2026-10-04', 1)).toBe('2026-10-05'); // and back
    expect(alignWeekId('2026-10-05', 1)).toBe('2026-10-05');
    expect(alignWeekId('not-a-date', 1)).toBe('not-a-date');
  });

  it('keeps the history chart in step with the stats when ids sit on the old grid', () => {
    const current = '2026-10-19'; // a Monday
    const state: GameState = {
      ...createInitialState(),
      settings: { ...createInitialState().settings, weekStartsOn: 1, startedAt: new Date(2026, 9, 1).toISOString() },
      // Sunday-grid ids, as left behind by a save that used to start weeks on Sunday.
      ledger: [ev({ str: 2, soc: -1 }, '2026-10-04'), ev({ int: 3 }, '2026-10-11'), ev({ vit: 1 }, '2026-10-19')],
    };
    const series = weeklySeries(state, current);
    expect(series.map((p) => p.weekId)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(series.map((p) => p.values.str)).toEqual([10, 12, 12, 12]);
    expect(series.at(-1)!.values).toEqual(computeStats(state.baseStats, state.ledger));
  });

  it('never loses an event, even one dated outside the charted range', () => {
    const state: GameState = { ...createInitialState(), ledger: [ev({ cre: 4 }, '2031-01-06'), ev({ dis: 2 }, '2001-01-01')] };
    const series = weeklySeries(state, toWeekId(new Date(), 1));
    expect(series.at(-1)!.values).toEqual(computeStats(state.baseStats, state.ledger));
    expect(series.length).toBeLessThanOrEqual(520);
  });

  it('re-keys stored weeks when the setting changes, and on load', () => {
    let state: GameState = {
      ...createInitialState(),
      ledger: [ev({ str: 2 }, '2026-10-05')],
      checkins: [checkin('2026-10-05', { str: 2 })],
    };
    state = reducer(state, { type: 'updateSettings', patch: { weekStartsOn: 0 } });
    expect(state.ledger[0].weekId).toBe('2026-10-04');
    expect(state.checkins[0].weekId).toBe('2026-10-04');

    const loaded = normalizeState({ ...state, settings: { ...state.settings, weekStartsOn: 1 } });
    expect(loaded.ledger[0].weekId).toBe('2026-10-05');
  });
});

describe('skins', () => {
  it('falls back to the default skin for saves without one', () => {
    const fresh = createInitialState();
    expect(fresh.settings.skin).toBe('orbit');
    expect(normalizeState({ ...fresh, settings: { ...fresh.settings, skin: undefined } }).settings.skin).toBe('orbit');
    expect(normalizeState({ ...fresh, settings: { ...fresh.settings, skin: 'neon' } }).settings.skin).toBe('orbit');
    expect(normalizeState({ ...fresh, settings: { ...fresh.settings, skin: 'classic' } }).settings.skin).toBe('classic');
  });

  it('zooms the Earth about a fixed point and keeps it on screen', () => {
    const near = { x: 1.2, y: -2, r: 4 };
    const dot = { x: 0, y: 0.3, r: 0.045 };
    expect(blend(near, dot, 0)).toEqual(near);
    const end = blend(near, dot, 1);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(0.3);
    expect(end.r).toBeCloseTo(0.045);
    // Halfway through, the planet's nearest edge is still within a screen's reach of the middle.
    const mid = blend(near, dot, 0.5);
    expect(Math.hypot(mid.x, mid.y) - mid.r).toBeLessThan(0.5);
  });
});

describe('achievements', () => {
  it('unlocks auto achievements once', () => {
    let state: GameState = createInitialState();
    state = { ...state, checkins: [checkin('2026-10-05', {})] };
    state = applyAutoAchievements(state, new Date(2026, 9, 10));
    const unlocked = state.ledger.filter((e) => e.source === 'achievement').map((e) => e.refId);
    expect(unlocked).toContain('ach-first');
    expect(computeStats(state.baseStats, state.ledger).dis).toBe(11);
    expect(applyAutoAchievements(state).ledger.length).toBe(state.ledger.length);
  });
});

describe('stat milestones', () => {
  it('unlocks a stat tier and rewards the partner stat', () => {
    let state: GameState = { ...createInitialState(), ledger: [ev({ str: 5 })] };
    state = applyAutoAchievements(state, new Date(2026, 9, 10));
    const unlocked = unlockedAchievementIds(state.ledger);
    expect(unlocked.has('ach-str15')).toBe(true);
    expect(unlocked.has('ach-str20')).toBe(false);
    expect(computeStats(state.baseStats, state.ledger).vit).toBe(11);
  });

  it('unlocks the all-stats tier only when the weakest stat gets there', () => {
    const all = { int: 5, str: 5, vit: 5, cre: 5, soc: 5, dis: 5 };
    let state: GameState = { ...createInitialState(), ledger: [ev({ ...all, soc: 2 })] };
    state = applyAutoAchievements(state, new Date(2026, 9, 10));
    // Reaching 15 Discipline rewards +1 Social, which still leaves Social at 13.
    expect(computeStats(state.baseStats, state.ledger).soc).toBe(13);
    expect(unlockedAchievementIds(state.ledger).has('ach-all15')).toBe(false);

    state = applyAutoAchievements({ ...state, ledger: [...state.ledger, ev({ soc: 2 })] }, new Date(2026, 9, 10));
    expect(unlockedAchievementIds(state.ledger).has('ach-all15')).toBe(true);
    expect(computeStats(state.baseStats, state.ledger).soc).toBe(16); // +1 to every stat
  });

  it('shows only the next tier per stat and names the next goal', () => {
    const state: GameState = { ...createInitialState(), ledger: [ev({ str: 5 })] };
    const after = applyAutoAchievements(state, new Date(2026, 9, 10));
    const hidden = laterTierIds(after.achievements, unlockedAchievementIds(after.ledger));
    expect(hidden.has('ach-str20')).toBe(false); // 15 is unlocked, so 20 is next
    expect(hidden.has('ach-str30')).toBe(true);
    expect(hidden.has('ach-int15')).toBe(false);
    expect(hidden.has('ach-int20')).toBe(true);
    expect(hidden.has('ach-all20')).toBe(true);
    expect(nextStatGoal(after, 'str')?.target).toBe(20);
    expect(statsWeakestFirst({ int: 12, str: 15, vit: 9, cre: 12, soc: 10, dis: 11 }).slice(0, 2)).toEqual(['vit', 'soc']);
  });

  it('adds milestones to older saves once, without restoring deleted ones', () => {
    const fresh = createInitialState();
    const old = { ...fresh, seed: undefined, achievements: fresh.achievements.filter((a) => a.id === 'ach-first') };
    const migrated = normalizeState(JSON.parse(JSON.stringify(old)));
    const ids = migrated.achievements.map((a) => a.id);
    expect(ids).toContain('ach-vit15');
    expect(ids).toContain('ach-all30');
    expect(ids).not.toContain('ach-str20'); // shipped in seed 1 and was deleted by the player
    expect(migrated.suggestions).toEqual([]);

    const again = normalizeState({ ...migrated, achievements: [] });
    expect(again.achievements).toEqual([]);
  });
});

describe('reducer', () => {
  it('turns an accepted suggestion into a task', () => {
    let state = createInitialState();
    const suggestion = { id: 'sq-1', title: 'Invite Sam for coffee', statId: 'soc', points: 2, repeat: 'once', reason: '' } as const;
    state = reducer(state, { type: 'setSuggestions', suggestions: [suggestion, { ...suggestion, id: 'sq-2', title: 'Other' }] });
    state = reducer(state, { type: 'acceptSuggestion', id: 'sq-1' });
    state = reducer(state, { type: 'dismissSuggestion', id: 'sq-2' });
    expect(state.suggestions).toEqual([]);
    expect(state.tasks.at(-1)).toMatchObject({ title: 'Invite Sam for coffee', statId: 'soc', points: 2, repeat: 'once' });
    expect(state.tasks.some((t) => t.title === 'Other')).toBe(false);
  });

  it('replaces a week when checking in twice and completes detected tasks once', () => {
    let state = createInitialState();
    const week = toWeekId(new Date(), state.settings.weekStartsOn);
    state = reducer(state, { type: 'applyCheckIn', checkin: checkin(week, { str: 2 }), completedTaskIds: ['task-read'] });
    state = reducer(state, {
      type: 'applyCheckIn',
      checkin: { ...checkin(week, { str: 1 }), id: 'second' },
      completedTaskIds: ['task-read'],
    });
    expect(state.checkins).toHaveLength(1);
    expect(state.ledger.filter((e) => e.source === 'checkin')).toHaveLength(1);
    expect(state.ledger.filter((e) => e.source === 'task')).toHaveLength(1);
    const stats = computeStats(state.baseStats, state.ledger);
    expect(stats.str).toBe(11);
    expect(stats.int).toBe(11); // task-read bonus
  });

  it('builds a weekly series that carries values forward', () => {
    let state = createInitialState();
    const week = toWeekId(new Date(), state.settings.weekStartsOn);
    const twoAgo = addWeeks(week, -2);
    state = { ...state, ledger: [ev({ str: 2 }, twoAgo)] };
    const series = weeklySeries(state, week);
    expect(series.map((p) => p.weekId)).toEqual([twoAgo, addWeeks(week, -1), week]);
    expect(series.map((p) => p.values.str)).toEqual([12, 12, 12]);

    // On its own that series is flat: the chart needs the starting stats to show the first change.
    const charted = withStartPoint(state, series);
    expect(charted.map((p) => p.values.str)).toEqual([10, 12, 12, 12]);
    expect(charted[0]).toMatchObject({ weekId: addWeeks(twoAgo, -1), isStart: true });
  });
});
