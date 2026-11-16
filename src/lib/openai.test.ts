import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/defaults';
import {
  buildQuestSystemPrompt,
  buildQuestUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  parseAnalysis,
  parseQuestSuggestions,
} from './openai';

describe('parseAnalysis', () => {
  it('keeps valid changes and drops malformed ones', () => {
    const result = parseAnalysis(
      {
        summary: '  A strong week!  ',
        changes: [
          { statId: 'str', delta: 2, reason: 'Gym twice' },
          { statId: 'luck', delta: 5, reason: 'not a stat' },
          { statId: 'int', delta: 0, reason: 'zero is dropped' },
          { statId: 'soc', delta: 99, reason: 'clamped' },
        ],
        questions: [
          { statId: 'soc', question: 'Did you meet anyone in person?', yesDelta: 1, noDelta: -1 },
          { statId: 'soc', question: '   ', yesDelta: 1, noDelta: -1 },
        ],
        completedTaskIds: ['task-read', 'made-up', 'task-read'],
      },
      new Set(['task-read']),
    );
    expect(result.summary).toBe('A strong week!');
    expect(result.changes).toEqual([
      { statId: 'str', delta: 2, reason: 'Gym twice' },
      { statId: 'soc', delta: 10, reason: 'clamped' },
    ]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({ statId: 'soc', yesDelta: 1, noDelta: -1 });
    expect(result.completedTaskIds).toEqual(['task-read']);
  });

  it('survives garbage', () => {
    expect(parseAnalysis(null, new Set())).toEqual({ summary: '', changes: [], questions: [], completedTaskIds: [] });
  });
});

describe('parseQuestSuggestions', () => {
  it('keeps valid quests, clamps points and drops duplicates of existing tasks', () => {
    const result = parseQuestSuggestions(
      {
        quests: [
          { title: ' Walk 20 minutes after lunch twice ', statId: 'str', points: 9, repeat: 'weekly', reason: 'r' },
          { title: 'read 30 pages of a book!', statId: 'int', points: 1, repeat: 'weekly', reason: 'duplicate' },
          { title: 'Find treasure', statId: 'luck', points: 1, repeat: 'once', reason: 'not a stat' },
          { title: 'Invite Sam for coffee', statId: 'soc', points: 0, repeat: 'sometimes', reason: 7 },
          { title: 'Walk 20 minutes after lunch twice', statId: 'vit', points: 1, repeat: 'once', reason: 'repeat' },
        ],
      },
      [{ title: 'Read 30 pages of a book' }],
    );
    expect(result.map((q) => q.title)).toEqual(['Walk 20 minutes after lunch twice', 'Invite Sam for coffee']);
    expect(result[0]).toMatchObject({ statId: 'str', points: 3, repeat: 'weekly' });
    expect(result[1]).toMatchObject({ statId: 'soc', points: 1, repeat: 'weekly', reason: '' });
  });

  it('survives garbage and caps the list at 5', () => {
    expect(parseQuestSuggestions('nope', [])).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `Quest ${i}`, statId: 'dis', points: 1, repeat: 'once', reason: '' }));
    expect(parseQuestSuggestions({ quests: many }, [])).toHaveLength(5);
  });
});

describe('quest prompt', () => {
  it('lists stats weakest first with milestones, existing tasks and recent weeks', () => {
    let state = createInitialState();
    state = {
      ...state,
      ledger: [
        { id: 'e1', at: '', weekId: '2026-10-05', source: 'adjust', title: 't', deltas: { str: 4, soc: -2 } },
      ],
      checkins: [
        {
          id: 'c1',
          weekId: '2026-10-05',
          createdAt: '',
          mode: 'ai',
          schedule: 'Mon: gym after work',
          summary: '',
          changes: [],
          questions: [],
          applied: { str: 2 },
        },
      ],
    };
    const prompt = buildQuestUserPrompt(state, '2026-10-12');
    expect(prompt.indexOf('Social')).toBeLessThan(prompt.indexOf('Strength'));
    expect(prompt).toContain('Social (statId "soc"): 8 (last 8 weeks: gained 0, lost 2; next milestone "Friendly Face" at 15)');
    expect(prompt).toContain('Read 30 pages of a book');
    expect(prompt).toContain('Mon: gym after work');
    expect(buildQuestSystemPrompt(state)).toContain(state.rules[0].condition);
  });
});

describe('prompts', () => {
  it('includes every rule and the weekly cap', () => {
    const state = createInitialState();
    const prompt = buildSystemPrompt(state);
    for (const rule of state.rules) expect(prompt).toContain(rule.condition);
    expect(prompt).toContain(`±${state.settings.weeklyCapPerStat}`);
  });

  it('lists open tasks with their ids', () => {
    const state = createInitialState();
    const prompt = buildUserPrompt(state, 'Mon: gym', 'Oct 5 – Oct 11, 2026', '2026-10-05');
    expect(prompt).toContain('id "task-read"');
    expect(prompt).toContain('Mon: gym');
  });
});
