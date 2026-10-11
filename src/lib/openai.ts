// ChatGPT "Game Master": reads the weekly schedule, applies the rule book, and
// asks yes/no follow-ups for stats it found no evidence about.
//
// Calls go straight from the browser to the OpenAI API with the player's own
// API key (stored only in this device's localStorage).

import { STATS, STAT_LIST } from '../data/defaults';
import type { FollowUpQuestion, GameState, StatChange, StatId } from '../types';
import { STAT_IDS } from '../types';
import { uid } from './id';
import { isTaskDone } from './scoring';

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

export function buildSystemPrompt(state: GameState): string {
  const rulesByStat = STAT_LIST.map((stat) => {
    const lines = state.rules
      .filter((r) => r.statId === stat.id)
      .map(
        (r) =>
          `  - [${r.kind === 'gain' ? '+' : '-'}${r.points}${r.perOccurrence ? ' per occurrence' : ''}] ${r.condition}`,
      );
    return `${stat.name} (statId "${stat.id}") — ${stat.description}\n${lines.join('\n') || '  - (no rules)'}`;
  }).join('\n\n');

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
  const body = await request(state.settings.openaiApiKey, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: state.settings.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(state) },
        { role: 'user', content: buildUserPrompt(state, schedule, weekLabel, weekId) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'week_analysis', strict: true, schema: ANALYSIS_SCHEMA },
      },
    }),
  });
  const message = body?.choices?.[0]?.message;
  if (message?.refusal) throw new OpenAIError(`The Game Master declined: ${message.refusal}`);
  let raw: unknown;
  try {
    raw = JSON.parse(message?.content ?? '');
  } catch {
    throw new OpenAIError('The Game Master replied in an unexpected format. Try again.');
  }
  return parseAnalysis(raw, new Set(state.tasks.map((t) => t.id)));
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

/** Used by Settings → "Test connection". Returns chat-capable model ids, newest-looking first. */
export async function listModels(apiKey: string): Promise<string[]> {
  const body = await request(apiKey, '/models');
  const ids: string[] = (body?.data ?? []).map((m: { id: string }) => m.id);
  return ids
    .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(id))
    .sort()
    .reverse();
}
