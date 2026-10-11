// Core data model. Character stats are never stored directly: they are derived
// from `baseStats` plus every event in the `ledger` (see lib/scoring.ts).

export const STAT_IDS = ['int', 'str', 'vit', 'cre', 'soc', 'dis'] as const;
export type StatId = (typeof STAT_IDS)[number];

export type StatValues = Record<StatId, number>;
export type StatDeltas = Partial<Record<StatId, number>>;

export interface StatDef {
  id: StatId;
  name: string;
  abbr: string;
  icon: string;
  /** RPG class title earned when this is the character's highest stat. */
  classTitle: string;
  description: string;
}

export interface Rule {
  id: string;
  statId: StatId;
  kind: 'gain' | 'loss';
  condition: string;
  points: number;
  /** true → points are awarded once per occurrence (e.g. each gym session). */
  perOccurrence: boolean;
}

export type EventSource = 'checkin' | 'task' | 'achievement' | 'adjust';

export interface LedgerEvent {
  id: string;
  at: string; // ISO timestamp
  weekId: string; // see lib/week.ts
  source: EventSource;
  /** Check-in id, task id or achievement id this event came from. */
  refId?: string;
  title: string;
  deltas: StatDeltas;
}

export interface Task {
  id: string;
  title: string;
  statId: StatId;
  points: number;
  repeat: 'once' | 'weekly';
  createdAt: string;
}

export type AchievementCondition =
  | { kind: 'manual' }
  | { kind: 'checkins'; count: number }
  | { kind: 'streak'; weeks: number }
  | { kind: 'statReaches'; statId: StatId; value: number }
  | { kind: 'tasksCompleted'; count: number }
  | { kind: 'level'; level: number };

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  condition: AchievementCondition;
  reward: StatDeltas;
}

export interface StatChange {
  statId: StatId;
  delta: number;
  reason: string;
}

export interface FollowUpQuestion {
  id: string;
  statId: StatId;
  question: string;
  yesDelta: number;
  noDelta: number;
}

export type Answer = 'yes' | 'no' | 'skip';

export interface CheckIn {
  id: string;
  weekId: string;
  createdAt: string;
  mode: 'ai' | 'manual';
  schedule: string;
  summary: string;
  changes: StatChange[];
  questions: (FollowUpQuestion & { answer: Answer })[];
  /** Net change actually applied after the weekly cap. */
  applied: StatDeltas;
}

export interface Settings {
  characterName: string;
  openaiApiKey: string;
  model: string;
  /** 0 = Sunday, 1 = Monday */
  weekStartsOn: 0 | 1;
  weeklyCapPerStat: number;
  theme: 'auto' | 'light' | 'dark';
  startedAt: string;
}

export interface GameState {
  version: 1;
  settings: Settings;
  baseStats: StatValues;
  rules: Rule[];
  tasks: Task[];
  achievements: Achievement[];
  ledger: LedgerEvent[];
  checkins: CheckIn[];
}
