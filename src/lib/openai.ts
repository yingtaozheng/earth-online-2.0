// ChatGPT "Game Master": reads the weekly schedule, applies the rule book, and
// asks yes/no follow-ups for stats it found no evidence about.
//
// Calls go straight from the browser to the OpenAI API with the player's own
// API key (stored only in this device's localStorage).

import { STATS, STAT_LIST } from '../data/defaults';
import type { FollowUpQuestion, GameState, QuestSuggestion, StatChange, StatDeltas, StatId, Task } from '../types';
import { STAT_IDS } from '../types';
import { uid } from './id';
import { computeStats, formatDeltas, isTaskDone, nextStatGoal, statsWeakestFirst, sumDeltas } from './scoring';
import { addWeeks, weekLabel as formatWeek } from './week';

const API_BASE = 'https://api.openai.com/v1';

export interface WeekAnalysis {
  summary: string;
  changes: StatChange[];
  questions: FollowUpQuestion[];
  completedTaskIds: string[];
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes', 'questions', 'completedTaskIds'],
  properties: {
    summary: {
      type: 'string',
      description: '2-3 sentences, in the voice of an encouraging RPG game master, summarising the week.',
    },
    changes: {
      type: 'array',
      description: 'One entry per rule that was triggered by evidence in the schedule.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statId', 'delta', 'reason'],
        properties: {
          statId: { type: 'string', enum: [...STAT_IDS] },
          delta: { type: 'integer' },
          reason: { type: 'string', description: 'Short explanation citing the rule and the evidence.' },
        },
      },
    },
    questions: {
      type: 'array',
      description: 'Yes/no follow-up questions for stats with no evidence either way.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statId', 'question', 'yesDelta', 'noDelta'],
        properties: {
          statId: { type: 'string', enum: [...STAT_IDS] },
          question: { type: 'string' },
          yesDelta: { type: 'integer' },
          noDelta: { type: 'integer' },
        },
      },
    },
    completedTaskIds: {
      type: 'array',
      description: 'Ids of open tasks the schedule clearly shows were completed.',
      items: { type: 'string' },
    },
  },
} as const;

function ruleBook(state: GameState): string {
  return STAT_LIST.map((stat) => {
    const lines = state.rules
      .filter((r) => r.statId === stat.id)
      .map(
        (r) =>
          `  - [${r.kind === 'gain' ? '+' : '-'}${r.points}${r.perOccurrence ? ' per occurrence' : ''}] ${r.condition}`,
      );
    return `${stat.name} (statId "${stat.id}") — ${stat.description}\n${lines.join('\n') || '  - (no rules)'}`;
  }).join('\n\n');
}

export function buildSystemPrompt(state: GameState): string {
  const rulesByStat = ruleBook(state);

  return `You are the Game Master of "Earth Online", an RPG where the player's real life is the game.
Each week the player sends you what they did. You update their character stats using ONLY the rule book below.

RULE BOOK
${rulesByStat}

HOW TO SCORE
1. Read the schedule carefully. Count how many times each rule's condition happened.
   - "per occurrence" rules: delta = points × count (e.g. 2 gym sessions → +2).
   - Other rules trigger at most once per week.
2. Add one entry to "changes" for each triggered rule, with a negative delta for loss rules.
3. A loss rule like "no X at all during the week" should only trigger when the schedule
   clearly covers the whole week and X is clearly absent. If the schedule simply doesn't
   mention a stat's area, do NOT guess — ask a follow-up question instead.
4. For every stat with no evidence either way, add ONE short, friendly yes/no question
   (e.g. "Did you meet anyone in person this week?"). Usually yesDelta = +1 and noDelta = -1,
   matching that stat's rules. Ask at most 4 questions, most important first.
5. Each stat's total change is capped at ±${state.settings.weeklyCapPerStat} per week by the game; you don't need to enforce it.
6. If an open task (listed in the user message) was clearly done, include its id in completedTaskIds.
7. Be fair and encouraging, never preachy. Keep reasons short and concrete.`;
}

export function buildUserPrompt(state: GameState, schedule: string, weekLabel: string, weekId: string): string {
  const openTasks = state.tasks.filter((t) => !isTaskDone(t, state.ledger, weekId));
  const taskLines = openTasks.length
    ? openTasks.map((t) => `- id "${t.id}": ${t.title} (${STATS[t.statId].abbr})`).join('\n')
    : '- (none)';
  return `Week: ${weekLabel}

Open tasks:
${taskLines}

My week:
${schedule.trim()}`;
}

export class OpenAIError extends Error {}

async function request(apiKey: string, path: string, init?: RequestInit) {
  if (!apiKey) throw new OpenAIError('Connect ChatGPT in Settings first (add your OpenAI API key).');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new OpenAIError('Could not reach OpenAI. Check your internet connection.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message ?? `${res.status} ${res.statusText}`;
    if (res.status === 401) throw new OpenAIError(`Your API key was rejected: ${message}`);
    throw new OpenAIError(message);
  }
  return body;
}

export async function analyzeWeek(
  state: GameState,
  schedule: string,
  weekLabel: string,
  weekId: string,
): Promise<WeekAnalysis> {
  const raw = await askGameMaster(
    state,
    buildSystemPrompt(state),
    buildUserPrompt(state, schedule, weekLabel, weekId),
    'week_analysis',
    ANALYSIS_SCHEMA,
  );
  return parseAnalysis(raw, new Set(state.tasks.map((t) => t.id)));
}

/** One structured-output chat call with the player's key and model. Returns parsed but still untrusted JSON. */
async function askGameMaster(
  state: GameState,
  system: string,
  user: string,
  schemaName: string,
  schema: object,
): Promise<unknown> {
  const body = await request(state.settings.openaiApiKey, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: state.settings.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });
  const message = body?.choices?.[0]?.message;
  if (message?.refusal) throw new OpenAIError(`The Game Master declined: ${message.refusal}`);
  try {
    return JSON.parse(message?.content ?? '');
  } catch {
    throw new OpenAIError('The Game Master replied in an unexpected format. Try again.');
  }
}

/** Validates and sanitises the model's JSON so nothing malformed reaches the game state. */
export function parseAnalysis(raw: unknown, validTaskIds: Set<string>): WeekAnalysis {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const isStat = (v: unknown): v is StatId => typeof v === 'string' && (STAT_IDS as readonly string[]).includes(v);
  const int = (v: unknown, min: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
  };
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const changes: StatChange[] = arr(obj.changes)
    .filter((c) => c && isStat(c.statId))
    .map((c) => ({ statId: c.statId as StatId, delta: int(c.delta, -10, 10), reason: String(c.reason ?? '').trim() }))
    .filter((c) => c.delta !== 0);

  const questions: FollowUpQuestion[] = arr(obj.questions)
    .filter((q) => q && isStat(q.statId) && typeof q.question === 'string' && q.question.trim())
    .slice(0, 5)
    .map((q) => ({
      id: uid('q-'),
      statId: q.statId as StatId,
      question: q.question.trim(),
      yesDelta: int(q.yesDelta, -3, 3),
      noDelta: int(q.noDelta, -3, 3),
    }));

  const completedTaskIds = [
    ...new Set(arr(obj.completedTaskIds).filter((id): id is string => typeof id === 'string' && validTaskIds.has(id))),
  ];

  return {
    summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
    changes,
    questions,
    completedTaskIds,
  };
}

// ---------- quest suggestions ----------

const MAX_SUGGESTIONS = 5;
const HISTORY_WEEKS = 8;
const RECENT_CHECKINS = 4;
const SCHEDULE_CHARS = 1200;

const QUESTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['quests'],
  properties: {
    quests: {
      type: 'array',
      description: '3 to 5 suggested tasks for the coming week.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'statId', 'points', 'repeat', 'reason'],
        properties: {
          title: { type: 'string', description: 'Concrete, checkable action, under 70 characters.' },
          statId: { type: 'string', enum: [...STAT_IDS] },
          points: { type: 'integer', description: '1 = small step, 2 = solid effort, 3 = a real stretch.' },
          repeat: { type: 'string', enum: ['weekly', 'once'] },
          reason: { type: 'string', description: 'One sentence: why this quest, for this player, now.' },
        },
      },
    },
  },
} as const;

export function buildQuestSystemPrompt(state: GameState): string {
  return `You are the Game Master of "Earth Online", an RPG where the player's real life is the game.
The player wants new quests (tasks). Completing a quest awards its points to one stat.

RULE BOOK (how the player normally earns and loses points)
${ruleBook(state)}

HOW TO DESIGN QUESTS
1. Propose 3 to ${MAX_SUGGESTIONS} quests. At least half must target the player's weakest stats, or stats
   they have been losing or neglecting recently, so they can catch up.
2. Build on what the player actually does. Use their recent weeks to anchor quests in real routines,
   places, people and interests (e.g. if they already go to the gym after work, attach a small
   stretch goal to that; if they never mention friends, suggest one easy, specific social step).
3. Every quest must be concrete and checkable within one week: a clear action with a number or a
   finish line. No vague advice like "be more social".
4. Points: 1 for a small step, 2 for solid effort, 3 only for a real stretch. Use "weekly" for habits
   worth repeating and "once" for one-off milestones.
5. Do not repeat or lightly reword a task the player already has.
6. "reason" is one short, encouraging sentence that names the evidence or the gap. When a quest
   helps reach a listed milestone, mention it.
7. If there is no history yet, rely on the stats and the rule book, and keep quests easy to start.`;
}

/** Keeps only the gains (sign 1) or only the losses (sign -1). */
function signedOnly(deltas: StatDeltas, sign: 1 | -1): StatDeltas {
  const out: StatDeltas = {};
  for (const id of STAT_IDS) {
    const d = deltas[id];
    if (d && Math.sign(d) === sign) out[id] = d;
  }
  return out;
}

export function buildQuestUserPrompt(state: GameState, weekId: string): string {
  const stats = computeStats(state.baseStats, state.ledger);
  const since = addWeeks(weekId, -HISTORY_WEEKS);
  const recent = state.ledger.filter((e) => e.weekId >= since);
  const gained = sumDeltas(...recent.map((e) => signedOnly(e.deltas, 1)));
  const lost = sumDeltas(...recent.map((e) => signedOnly(e.deltas, -1)));

  const statLines = statsWeakestFirst(stats).map((id) => {
    const goal = nextStatGoal(state, id);
    const milestone = goal ? `; next milestone "${goal.achievement.title}" at ${goal.target}` : '';
    return `- ${STATS[id].name} (statId "${id}"): ${stats[id]} (last ${HISTORY_WEEKS} weeks: gained ${gained[id] ?? 0}, lost ${-(lost[id] ?? 0)}${milestone})`;
  });

  const taskLines = state.tasks.map((t) => {
    const done = state.ledger.filter((e) => e.source === 'task' && e.refId === t.id).length;
    return `- ${t.title} (${STATS[t.statId].abbr}, ${t.repeat}, completed ${done} times)`;
  });

  const weeks = [...state.checkins]
    .sort((a, b) => b.weekId.localeCompare(a.weekId))
    .slice(0, RECENT_CHECKINS)
    .map((c) => {
      const schedule = c.schedule.trim().slice(0, SCHEDULE_CHARS) || '(scored without notes)';
      return `Week ${formatWeek(c.weekId)} (result: ${formatDeltas(c.applied)})\n${schedule}`;
    });

  return `My stats, weakest first:
${statLines.join('\n')}

Tasks I already have:
${taskLines.join('\n') || '- (none)'}

My recent weeks:
${weeks.join('\n\n') || '(no check-ins yet)'}

Suggest quests for the coming week.`;
}

export async function suggestQuests(state: GameState, weekId: string): Promise<QuestSuggestion[]> {
  const raw = await askGameMaster(
    state,
    buildQuestSystemPrompt(state),
    buildQuestUserPrompt(state, weekId),
    'quest_suggestions',
    QUESTS_SCHEMA,
  );
  return parseQuestSuggestions(raw, state.tasks);
}

const titleKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Validates the model's quest list: known stats only, points 1 to 3, no duplicates of existing tasks. */
export function parseQuestSuggestions(raw: unknown, existing: Pick<Task, 'title'>[]): QuestSuggestion[] {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.quests) ? obj.quests : [];
  const seen = new Set(existing.map((t) => titleKey(t.title)));
  const out: QuestSuggestion[] = [];
  for (const q of list) {
    if (!q || typeof q !== 'object') continue;
    const { title, statId, points, repeat, reason } = q as Record<string, unknown>;
    if (typeof title !== 'string' || !(STAT_IDS as readonly unknown[]).includes(statId)) continue;
    const clean = title.trim().slice(0, 120);
    const key = titleKey(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const n = Math.round(Number(points));
    out.push({
      id: uid('sq-'),
      title: clean,
      statId: statId as StatId,
      points: Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 1,
      repeat: repeat === 'once' ? 'once' : 'weekly',
      reason: typeof reason === 'string' ? reason.trim().slice(0, 240) : '',
    });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Used by Settings → "Test connection". Returns chat-capable model ids, newest-looking first. */
export async function listModels(apiKey: string): Promise<string[]> {
  const body = await request(apiKey, '/models');
  const ids: string[] = (body?.data ?? []).map((m: { id: string }) => m.id);
  return ids
    .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(id))
    .sort()
    .reverse();
}
