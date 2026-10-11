import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/defaults';
import { buildSystemPrompt, buildUserPrompt, parseAnalysis } from './openai';

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
