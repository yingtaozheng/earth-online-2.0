import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/defaults';
import { reducer } from '../state/store';
import type { CheckIn, GameState, LedgerEvent } from '../types';
import {
  applyAutoAchievements,
  capDeltas,
  classTitle,
  computeStats,
  currentStreak,
  levelInfo,
  longestStreak,
  sumDeltas,
  totalXp,
  weeklySeries,
} from './scoring';
import { addWeeks, toWeekId } from './week';

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

describe('reducer', () => {
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
  });
});
