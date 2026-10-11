import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { DEFAULT_RULES, createInitialState } from '../data/defaults';
import { uid } from '../lib/id';
import {
  achievementEvent,
  applyAutoAchievements,
  computeStats,
  isTaskDone,
  levelInfo,
  totalXp,
} from '../lib/scoring';
import { toWeekId } from '../lib/week';
import type { Achievement, CheckIn, GameState, LedgerEvent, Rule, Settings, StatId, Task } from '../types';

const STORAGE_KEY = 'earth-online/v1';

export type Action =
  | { type: 'applyCheckIn'; checkin: CheckIn; completedTaskIds: string[] }
  | { type: 'undoCheckIn'; checkinId: string }
  | { type: 'saveTask'; task: Task }
  | { type: 'deleteTask'; id: string }
  | { type: 'completeTask'; id: string }
  | { type: 'uncompleteTask'; id: string }
  | { type: 'saveAchievement'; achievement: Achievement }
  | { type: 'deleteAchievement'; id: string }
  | { type: 'unlockAchievement'; id: string }
  | { type: 'relockAchievement'; id: string }
  | { type: 'saveRule'; rule: Rule }
  | { type: 'deleteRule'; id: string }
  | { type: 'resetRules' }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'adjustStat'; statId: StatId; delta: number; note: string }
  | { type: 'deleteEvent'; id: string }
  | { type: 'replaceState'; state: GameState }
  | { type: 'resetAll' };

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

function taskEvent(task: Task, weekId: string, now: Date): LedgerEvent {
  return {
    id: uid('ev-'),
    at: now.toISOString(),
    weekId,
    source: 'task',
    refId: task.id,
    title: `Task complete: ${task.title}`,
    deltas: { [task.statId]: task.points },
  };
}

export function reducer(state: GameState, action: Action): GameState {
  const now = new Date();
  const currentWeek = toWeekId(now, state.settings.weekStartsOn);

  switch (action.type) {
    case 'applyCheckIn': {
      const { checkin } = action;
      // Re-doing a week replaces that week's previous check-in.
      const replaced = state.checkins.filter((c) => c.weekId === checkin.weekId).map((c) => c.id);
      const ledger = state.ledger.filter((e) => !(e.source === 'checkin' && replaced.includes(e.refId ?? '')));
      ledger.push({
        id: uid('ev-'),
        at: now.toISOString(),
        weekId: checkin.weekId,
        source: 'checkin',
        refId: checkin.id,
        title: `Weekly check-in${checkin.mode === 'ai' ? ' (Game Master)' : ''}`,
        deltas: checkin.applied,
      });
      for (const taskId of action.completedTaskIds) {
        const task = state.tasks.find((t) => t.id === taskId);
        if (task && !isTaskDone(task, ledger, checkin.weekId)) ledger.push(taskEvent(task, checkin.weekId, now));
      }
      return applyAutoAchievements(
        {
          ...state,
          checkins: [...state.checkins.filter((c) => !replaced.includes(c.id)), checkin],
          ledger,
        },
        now,
      );
    }
    case 'undoCheckIn':
      return {
        ...state,
        checkins: state.checkins.filter((c) => c.id !== action.checkinId),
        ledger: state.ledger.filter((e) => !(e.source === 'checkin' && e.refId === action.checkinId)),
      };

    case 'saveTask':
      return { ...state, tasks: upsert(state.tasks, action.task) };
    case 'deleteTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case 'completeTask': {
      const task = state.tasks.find((t) => t.id === action.id);
      if (!task || isTaskDone(task, state.ledger, currentWeek)) return state;
      return applyAutoAchievements({ ...state, ledger: [...state.ledger, taskEvent(task, currentWeek, now)] }, now);
    }
    case 'uncompleteTask': {
      const task = state.tasks.find((t) => t.id === action.id);
      if (!task) return state;
      const match = [...state.ledger]
        .reverse()
        .find((e) => e.source === 'task' && e.refId === task.id && (task.repeat === 'once' || e.weekId === currentWeek));
      return match ? { ...state, ledger: state.ledger.filter((e) => e.id !== match.id) } : state;
    }

    case 'saveAchievement':
      return applyAutoAchievements({ ...state, achievements: upsert(state.achievements, action.achievement) }, now);
    case 'deleteAchievement':
      return { ...state, achievements: state.achievements.filter((a) => a.id !== action.id) };
    case 'unlockAchievement': {
      const a = state.achievements.find((x) => x.id === action.id);
      if (!a || state.ledger.some((e) => e.source === 'achievement' && e.refId === a.id)) return state;
      return applyAutoAchievements({ ...state, ledger: [...state.ledger, achievementEvent(a, currentWeek, now)] }, now);
    }
    case 'relockAchievement':
      return {
        ...state,
        ledger: state.ledger.filter((e) => !(e.source === 'achievement' && e.refId === action.id)),
      };

    case 'saveRule':
      return { ...state, rules: upsert(state.rules, action.rule) };
    case 'deleteRule':
      return { ...state, rules: state.rules.filter((r) => r.id !== action.id) };
    case 'resetRules':
      return { ...state, rules: DEFAULT_RULES.map((r) => ({ ...r })) };

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'adjustStat':
      return applyAutoAchievements(
        {
          ...state,
          ledger: [
            ...state.ledger,
            {
              id: uid('ev-'),
              at: now.toISOString(),
              weekId: currentWeek,
              source: 'adjust',
              title: action.note || 'Manual adjustment',
              deltas: { [action.statId]: action.delta },
            },
          ],
        },
        now,
      );
    case 'deleteEvent':
      return { ...state, ledger: state.ledger.filter((e) => e.id !== action.id) };

    case 'replaceState':
      return applyAutoAchievements(normalizeState(action.state), now);
    case 'resetAll':
      return createInitialState();
  }
}

/** Fills in anything missing from older or hand-edited save files. */
export function normalizeState(raw: unknown): GameState {
  const fresh = createInitialState();
  if (!raw || typeof raw !== 'object') return fresh;
  const s = raw as Partial<GameState>;
  return {
    version: 1,
    settings: { ...fresh.settings, ...s.settings },
    baseStats: { ...fresh.baseStats, ...s.baseStats },
    rules: Array.isArray(s.rules) ? s.rules : fresh.rules,
    tasks: Array.isArray(s.tasks) ? s.tasks : fresh.tasks,
    achievements: Array.isArray(s.achievements) ? s.achievements : fresh.achievements,
    ledger: Array.isArray(s.ledger) ? s.ledger : [],
    checkins: Array.isArray(s.checkins) ? s.checkins : [],
  };
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Re-check achievements on load in case rules or data changed since the last session.
    return raw ? applyAutoAchievements(normalizeState(JSON.parse(raw))) : createInitialState();
  } catch {
    return createInitialState();
  }
}

interface GameContextValue {
  state: GameState;
  dispatch: (action: Action) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked (private mode). The game still works for this session.
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}

/** Derived character numbers, recomputed whenever the state changes. */
export function useCharacter() {
  const { state } = useGame();
  return useMemo(() => {
    const stats = computeStats(state.baseStats, state.ledger);
    const xp = totalXp(state.ledger);
    return { stats, xp, ...levelInfo(xp) };
  }, [state.baseStats, state.ledger]);
}
