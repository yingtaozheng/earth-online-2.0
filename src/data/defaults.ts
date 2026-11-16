import type { Achievement, GameState, Rule, StatDef, StatId, StatValues, Task } from '../types';
import { STAT_IDS } from '../types';

// Order matches STAT_IDS, which is also the chart color-slot order.
export const STATS: Record<StatId, StatDef> = {
  int: {
    id: 'int',
    name: 'Intelligence',
    abbr: 'INT',
    icon: '📘',
    classTitle: 'Sage',
    description: 'Learning, studying, reading, deep work on hard problems.',
  },
  str: {
    id: 'str',
    name: 'Strength',
    abbr: 'STR',
    icon: '💪',
    classTitle: 'Warrior',
    description: 'Exercise, gym, sports and physical activity.',
  },
  vit: {
    id: 'vit',
    name: 'Vitality',
    abbr: 'VIT',
    icon: '🌿',
    classTitle: 'Monk',
    description: 'Sleep, nutrition, rest and overall health.',
  },
  cre: {
    id: 'cre',
    name: 'Creativity',
    abbr: 'CRE',
    icon: '🎨',
    classTitle: 'Artisan',
    description: 'Making things: art, music, writing, side projects.',
  },
  soc: {
    id: 'soc',
    name: 'Social',
    abbr: 'SOC',
    icon: '🤝',
    classTitle: 'Bard',
    description: 'Time with friends and family, community, new connections.',
  },
  dis: {
    id: 'dis',
    name: 'Discipline',
    abbr: 'DIS',
    icon: '🛡️',
    classTitle: 'Paladin',
    description: 'Keeping habits, following through on plans, focus.',
  },
};

export const STAT_LIST: StatDef[] = STAT_IDS.map((id) => STATS[id]);

/** Rank titles by level: a rank applies from its level until the next one starts. Ascending. */
export const RANKS = [
  { level: 1, title: 'Newcomer' },
  { level: 3, title: 'Apprentice' },
  { level: 5, title: 'Journeyman' },
  { level: 8, title: 'Veteran' },
  { level: 12, title: 'Elite' },
  { level: 16, title: 'Champion' },
  { level: 20, title: 'Legend' },
] as const;

export const DEFAULT_BASE_STATS: StatValues = { int: 10, str: 10, vit: 10, cre: 10, soc: 10, dis: 10 };

const rule = (
  id: string,
  statId: StatId,
  kind: Rule['kind'],
  condition: string,
  points: number,
  perOccurrence = false,
): Rule => ({ id, statId, kind, condition, points, perOccurrence });

export const DEFAULT_RULES: Rule[] = [
  rule('str-gym', 'str', 'gain', 'Each gym / workout session of 30+ minutes', 1, true),
  rule('str-sport', 'str', 'gain', 'Each sports game, hike, long run or long bike ride', 1, true),
  rule('str-none', 'str', 'loss', 'No exercise at all during the week', 1),

  rule('int-study', 'int', 'gain', 'Each focused study / reading / course session of 1+ hour', 1, true),
  rule('int-finish', 'int', 'gain', 'Finished a book, course, or major learning milestone', 1),
  rule('int-none', 'int', 'loss', 'No learning activity at all during the week', 1),

  rule('soc-meet', 'soc', 'gain', 'Each in-person meetup with friends or family', 1, true),
  rule('soc-event', 'soc', 'gain', 'Attended a social event / club, or made a new connection', 1),
  rule('soc-none', 'soc', 'loss', 'No in-person social contact during the week', 1),

  rule('vit-sleep', 'vit', 'gain', 'Slept 7+ hours on at least 5 nights', 1),
  rule('vit-food', 'vit', 'gain', 'Cooked / ate healthy for most meals', 1),
  rule('vit-late', 'vit', 'loss', 'Slept under 6 hours on 3+ nights, or was run down / sick from neglect', 1),

  rule('cre-make', 'cre', 'gain', 'Each creative session (music, art, writing, building a side project)', 1, true),
  rule('cre-none', 'cre', 'loss', 'No creative activity at all during the week', 1),

  rule('dis-plan', 'dis', 'gain', 'Completed all planned priorities for the week', 1),
  rule('dis-habit', 'dis', 'gain', 'Kept a daily habit on 5+ days (wake-up time, journaling, etc.)', 1),
  rule('dis-slack', 'dis', 'loss', 'Missed most planned tasks / heavy procrastination', 1),
];

const now = () => new Date().toISOString();

export const DEFAULT_TASKS: Task[] = [
  { id: 'task-read', title: 'Read 30 pages of a book', statId: 'int', points: 1, repeat: 'weekly', createdAt: now() },
  { id: 'task-call', title: 'Call a family member', statId: 'soc', points: 1, repeat: 'weekly', createdAt: now() },
  { id: 'task-plan', title: 'Plan next week on Sunday', statId: 'dis', points: 1, repeat: 'weekly', createdAt: now() },
  { id: 'task-meal', title: 'Meal-prep for the week', statId: 'vit', points: 1, repeat: 'weekly', createdAt: now() },
  { id: 'task-ship', title: 'Finish and share a creative project', statId: 'cre', points: 2, repeat: 'once', createdAt: now() },
];

// Stat milestones: three tiers per stat, plus "every stat" tiers that reward
// catching up the weakest one. Reaching a tier boosts a related stat.
const MILESTONE_TIERS = [
  { value: 15, reward: 1 },
  { value: 20, reward: 3 },
  { value: 30, reward: 5 },
] as const;

const MILESTONE_META: Record<StatId, { partner: StatId; titles: [string, string, string]; icons: [string, string, string] }> = {
  int: { partner: 'cre', titles: ['Curious Mind', 'Scholar', 'Archmage'], icons: ['🔎', '🎓', '🔮'] },
  str: { partner: 'vit', titles: ['Warmed Up', 'Iron Body', 'Titan'], icons: ['👟', '🏋️', '🗿'] },
  vit: { partner: 'str', titles: ['Well Rested', 'Picture of Health', 'Evergreen'], icons: ['😴', '🍎', '🌲'] },
  cre: { partner: 'int', titles: ['Tinkerer', 'Maker', 'Virtuoso'], icons: ['✏️', '🛠️', '🎻'] },
  soc: { partner: 'vit', titles: ['Friendly Face', 'Life of the Party', 'Heart of the Guild'], icons: ['👋', '🎉', '💞'] },
  dis: { partner: 'soc', titles: ['Reliable', 'Iron Will', 'Unbreakable'], icons: ['✅', '⚓', '💎'] },
};

const BALANCE_MILESTONES: Achievement[] = [
  { value: 15, reward: 1, title: 'Well-Rounded', icon: '⚖️' },
  { value: 20, reward: 2, title: 'Jack of All Trades', icon: '🃏' },
  { value: 30, reward: 3, title: 'Renaissance Soul', icon: '🌟' },
].map((m) => ({
  id: `ach-all${m.value}`,
  title: m.title,
  description: `Get every stat to ${m.value} or more. Your weakest stat sets the pace.`,
  icon: m.icon,
  condition: { kind: 'allStatsReach', value: m.value },
  reward: Object.fromEntries(STAT_IDS.map((id) => [id, m.reward])),
}));

export const STAT_MILESTONES: Achievement[] = [
  ...STAT_IDS.flatMap((statId) =>
    MILESTONE_TIERS.map((tier, i): Achievement => ({
      id: `ach-${statId}${tier.value}`,
      title: MILESTONE_META[statId].titles[i],
      description: `Reach ${tier.value} ${STATS[statId].name}.`,
      icon: MILESTONE_META[statId].icons[i],
      condition: { kind: 'statReaches', statId, value: tier.value },
      reward: { [MILESTONE_META[statId].partner]: tier.reward },
    })),
  ),
  ...BALANCE_MILESTONES,
];

/** Bumped whenever new built-in content should be added to existing saves. */
export const SEED_VERSION = 2;
/** Milestones that shipped in seed 1; later seeds must not re-add them if the player deleted them. */
export const SEED1_MILESTONE_IDS = ['ach-str20', 'ach-int20', 'ach-soc20'];

export const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-first',
    title: 'Hello, World',
    description: 'Complete your first weekly check-in.',
    icon: '🌍',
    condition: { kind: 'checkins', count: 1 },
    reward: { dis: 1 },
  },
  {
    id: 'ach-streak4',
    title: 'Steady Adventurer',
    description: 'Check in 4 weeks in a row.',
    icon: '🔥',
    condition: { kind: 'streak', weeks: 4 },
    reward: { dis: 3 },
  },
  {
    id: 'ach-streak12',
    title: 'Seasoned Veteran',
    description: 'Check in 12 weeks in a row.',
    icon: '🏔️',
    condition: { kind: 'streak', weeks: 12 },
    reward: { dis: 3, vit: 2 },
  },
  {
    id: 'ach-tasks10',
    title: 'Questaholic',
    description: 'Complete 10 tasks.',
    icon: '📜',
    condition: { kind: 'tasksCompleted', count: 10 },
    reward: { dis: 2 },
  },
  {
    id: 'ach-lv5',
    title: 'Rising Hero',
    description: 'Reach character level 5.',
    icon: '⭐',
    condition: { kind: 'level', level: 5 },
    reward: { int: 1, str: 1, vit: 1, cre: 1, soc: 1, dis: 1 },
  },
  ...STAT_MILESTONES,
  {
    id: 'ach-halfmarathon',
    title: 'Distance Runner',
    description: 'Run a half marathon. (Unlock manually when done.)',
    icon: '🏃',
    condition: { kind: 'manual' },
    reward: { str: 5 },
  },
  {
    id: 'ach-books12',
    title: 'Bookworm',
    description: 'Read 12 books in a year. (Unlock manually when done.)',
    icon: '📚',
    condition: { kind: 'manual' },
    reward: { int: 5 },
  },
];

export const DEFAULT_MODEL = 'gpt-5-mini';

export function createInitialState(): GameState {
  return {
    version: 1,
    seed: SEED_VERSION,
    settings: {
      characterName: 'Player One',
      openaiApiKey: '',
      model: DEFAULT_MODEL,
      weekStartsOn: 1,
      weeklyCapPerStat: 3,
      theme: 'auto',
      startedAt: now(),
    },
    baseStats: { ...DEFAULT_BASE_STATS },
    rules: DEFAULT_RULES.map((r) => ({ ...r })),
    tasks: DEFAULT_TASKS.map((t) => ({ ...t })),
    achievements: DEFAULT_ACHIEVEMENTS.map((a) => ({ ...a })),
    ledger: [],
    checkins: [],
    suggestions: [],
  };
}
