import { useEffect, useMemo, useState } from 'react';
import { DeltaChips, StatChip } from '../components/StatChip';
import { STATS, STAT_LIST } from '../data/defaults';
import { uid } from '../lib/id';
import { OpenAIError, analyzeWeek } from '../lib/openai';
import { capDeltas, isTaskDone, sumDeltas } from '../lib/scoring';
import { addWeeks, toWeekId, weekLabel } from '../lib/week';
import { useGame } from '../state/store';
import type { Answer, CheckIn, FollowUpQuestion, StatChange, StatDeltas } from '../types';
import type { Tab } from '../App';

const DRAFT_KEY = 'earth-online/draft';

const PLACEHOLDER = `Paste your week here — a calendar export, a to-do list, or just a few lines. For example:

Mon: work 9-6, gym after work (45 min)
Tue: studied Spanish 1.5h, slept late
Wed: dinner with Alex and Sam
Thu: gym, read 40 pages
Fri: movie night at home
Sat: hiked 10km, cooked meal prep
Sun: drew for 2 hours, planned next week`;

type Step = 'write' | 'review' | 'done';

interface Draft {
  mode: CheckIn['mode'];
  summary: string;
  changes: StatChange[];
  questions: FollowUpQuestion[];
  taskIds: string[];
}

export function CheckInPage({ go }: { go: (tab: Tab) => void }) {
  const { state, dispatch } = useGame();
  const thisWeek = toWeekId(new Date(), state.settings.weekStartsOn);
  const lastWeek = addWeeks(thisWeek, -1);

  const [weekId, setWeekId] = useState(thisWeek);
  const [schedule, setSchedule] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [step, setStep] = useState<Step>('write');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [ruleCounts, setRuleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<StatDeltas | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, schedule);
    } catch {
      /* per-device convenience only */
    }
  }, [schedule]);

  const existing = state.checkins.find((c) => c.weekId === weekId);
  const hasKey = Boolean(state.settings.openaiApiKey);
  const cap = state.settings.weeklyCapPerStat;

  // In manual mode the "changes" come from the rule counters.
  const changes: StatChange[] = useMemo(() => {
    if (!draft) return [];
    if (draft.mode === 'ai') return draft.changes;
    return state.rules
      .filter((r) => ruleCounts[r.id])
      .map((r) => {
        const n = ruleCounts[r.id];
        return {
          statId: r.statId,
          delta: (r.kind === 'gain' ? 1 : -1) * r.points * n,
          reason: `${r.condition}${n > 1 ? ` (×${n})` : ''}`,
        };
      });
  }, [draft, ruleCounts, state.rules]);

  const raw = useMemo(() => {
    const fromChanges = changes.map((c) => ({ [c.statId]: c.delta }) as StatDeltas);
    const fromAnswers = (draft?.questions ?? []).map((q) => {
      const a = answers[q.id];
      return (a === 'yes' ? { [q.statId]: q.yesDelta } : a === 'no' ? { [q.statId]: q.noDelta } : {}) as StatDeltas;
    });
    return sumDeltas(...fromChanges, ...fromAnswers);
  }, [changes, answers, draft]);
  const final = capDeltas(raw, cap);
  const capped = JSON.stringify(final) !== JSON.stringify(raw);

  async function askGameMaster() {
    setError('');
    setLoading(true);
    try {
      const result = await analyzeWeek(state, schedule, weekLabel(weekId), weekId);
      setDraft({ mode: 'ai', ...result, taskIds: result.completedTaskIds });
      setAnswers({});
      setStep('review');
    } catch (e) {
      setError(e instanceof OpenAIError ? e.message : `Something went wrong: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function scoreManually() {
    setDraft({ mode: 'manual', summary: '', changes: [], questions: [], taskIds: [] });
    setRuleCounts({});
    setAnswers({});
    setStep('review');
  }

  function apply() {
    if (!draft) return;
    const checkin: CheckIn = {
      id: uid('ci-'),
      weekId,
      createdAt: new Date().toISOString(),
      mode: draft.mode,
      schedule,
      summary: draft.summary,
      changes,
      questions: draft.questions.map((q) => ({ ...q, answer: answers[q.id] ?? 'skip' })),
      applied: final,
    };
    dispatch({ type: 'applyCheckIn', checkin, completedTaskIds: draft.taskIds });
    setApplied(final);
    setSchedule('');
    setStep('done');
  }

  const updateChange = (index: number, delta: number) =>
    setDraft((d) =>
      d ? { ...d, changes: d.changes.map((c, i) => (i === index ? { ...c, delta } : c)).filter((c) => c.delta !== 0) } : d,
    );

  if (step === 'done' && applied) {
    return (
      <div className="card stack">
        <h2>Week recorded! 🎉</h2>
        <p>Your character has been updated for {weekLabel(weekId)}.</p>
        <DeltaChips deltas={applied} />
        <div className="row">
          <button className="btn primary" onClick={() => go('character')}>
            View character
          </button>
          <button className="btn" onClick={() => go('quests')}>
            Check achievements
          </button>
        </div>
      </div>
    );
  }

  if (step === 'review' && draft) {
    const openTasks = state.tasks.filter((t) => !isTaskDone(t, state.ledger, weekId));
    return (
      <div className="stack">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Review — {weekLabel(weekId)}</h2>
          <button className="btn ghost" onClick={() => setStep('write')}>
            ← Back
          </button>
        </div>

        {draft.mode === 'ai' && (
          <div className="gm">
            <div className="avatar" aria-hidden>
              🧙
            </div>
            <div className="bubble">
              <strong>Game Master</strong>
              <p style={{ margin: '4px 0 0' }}>{draft.summary || 'I have reviewed your week.'}</p>
            </div>
          </div>
        )}

        {draft.mode === 'ai' ? (
          <div className="card">
            <h3>Stat changes found</h3>
            {draft.changes.length === 0 && <p className="muted">No rule was clearly triggered.</p>}
            {draft.changes.map((c, i) => (
              <div className="change-row" key={i}>
                <StatChip id={c.statId} />
                <span className="small">{c.reason}</span>
                <div className="stepper">
                  <button className="btn" onClick={() => updateChange(i, c.delta - 1)} aria-label="Decrease">
                    −
                  </button>
                  <output className={c.delta > 0 ? 'good' : 'bad'}>{c.delta > 0 ? `+${c.delta}` : c.delta}</output>
                  <button className="btn" onClick={() => updateChange(i, c.delta + 1)} aria-label="Increase">
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <h3>Score your week</h3>
            <p className="small muted">Count how many times each rule happened this week.</p>
            {STAT_LIST.map((s) => (
              <details key={s.id} open>
                <summary>
                  <StatChip id={s.id} /> {s.name}
                </summary>
                {state.rules
                  .filter((r) => r.statId === s.id)
                  .map((r) => {
                    const n = ruleCounts[r.id] ?? 0;
                    const max = r.perOccurrence ? 14 : 1;
                    const set = (v: number) => setRuleCounts((rc) => ({ ...rc, [r.id]: Math.max(0, Math.min(max, v)) }));
                    return (
                      <div className="rule" key={r.id}>
                        <span className={`pts ${r.kind}`}>
                          {r.kind === 'gain' ? '+' : '−'}
                          {r.points}
                        </span>
                        <span className="small">{r.condition}</span>
                        {r.perOccurrence ? (
                          <div className="stepper">
                            <button className="btn" onClick={() => set(n - 1)} aria-label="Fewer">
                              −
                            </button>
                            <output>{n}</output>
                            <button className="btn" onClick={() => set(n + 1)} aria-label="More">
                              +
                            </button>
                          </div>
                        ) : (
                          <input type="checkbox" checked={n > 0} onChange={(e) => set(e.target.checked ? 1 : 0)} aria-label={r.condition} />
                        )}
                      </div>
                    );
                  })}
              </details>
            ))}
          </div>
        )}

        {draft.questions.length > 0 && (
          <div className="card">
            <h3>A few questions from the Game Master</h3>
            {draft.questions.map((q) => (
              <div className="change-row" key={q.id}>
                <StatChip id={q.statId} />
                <span>
                  {q.question}
                  <br />
                  <span className="small muted">
                    Yes {q.yesDelta >= 0 ? '+' : ''}
                    {q.yesDelta} · No {q.noDelta >= 0 ? '+' : ''}
                    {q.noDelta}
                  </span>
                </span>
                <div className="row" role="group" aria-label={q.question}>
                  {(['yes', 'no', 'skip'] as const).map((a) => (
                    <button
                      key={a}
                      className={`btn small ${a}`}
                      aria-pressed={answers[q.id] === a}
                      onClick={() => setAnswers((x) => ({ ...x, [q.id]: a }))}
                    >
                      {a[0].toUpperCase() + a.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {openTasks.length > 0 && (
          <div className="card">
            <h3>Tasks completed this week</h3>
            {draft.mode === 'ai' && <p className="small muted">Pre-checked where the Game Master spotted them.</p>}
            <div className="stack" style={{ gap: 6 }}>
              {openTasks.map((t) => (
                <label className="inline" key={t.id}>
                  <input
                    type="checkbox"
                    checked={draft.taskIds.includes(t.id)}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? { ...d, taskIds: e.target.checked ? [...d.taskIds, t.id] : d.taskIds.filter((id) => id !== t.id) }
                          : d,
                      )
                    }
                  />
                  <span style={{ color: 'var(--text)' }}>{t.title}</span>
                  <StatChip id={t.statId} delta={t.points} />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="card stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Result</h3>
          <DeltaChips deltas={final} />
          {capped && (
            <span className="small muted">Some changes were capped at ±{cap} per stat per week.</span>
          )}
          {existing && <div className="notice small">This replaces the check-in you already made for this week.</div>}
          <div className="row">
            <button className="btn primary" onClick={apply}>
              Apply to character
            </button>
            {draft.mode === 'ai' && (
              <button className="btn" onClick={askGameMaster} disabled={loading}>
                {loading ? 'Thinking…' : 'Ask again'}
              </button>
            )}
          </div>
          {error && <div className="notice error small">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="gm">
        <div className="avatar" aria-hidden>
          🧙
        </div>
        <div className="bubble">
          <strong>Game Master</strong>
          <p style={{ margin: '4px 0 0' }}>
            Greetings, {state.settings.characterName}. Tell me what you did this week — I'll update your stats by the{' '}
            <button className="btn small ghost" style={{ padding: 0, color: 'var(--focus)' }} onClick={() => go('rules')}>
              rule book
            </button>{' '}
            and ask about anything you left out.
          </p>
        </div>
      </div>

      <div className="card stack">
        <div className="row" role="radiogroup" aria-label="Which week">
          {[
            { id: thisWeek, label: 'This week' },
            { id: lastWeek, label: 'Last week' },
          ].map((w) => (
            <button key={w.id} className="btn small" role="radio" aria-checked={weekId === w.id}
              style={weekId === w.id ? { background: 'var(--accent-bg)', borderColor: 'var(--accent)' } : undefined}
              onClick={() => setWeekId(w.id)}>
              {w.label} · {weekLabel(w.id)}
              {state.checkins.some((c) => c.weekId === w.id) ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {existing && (
          <div className="notice small">
            You already checked in for this week ({new Date(existing.createdAt).toLocaleDateString()}). Doing it again will
            replace that result.
          </div>
        )}
        <label>
          Your week
          <textarea value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder={PLACEHOLDER} />
        </label>
        <div className="row">
          <button className="btn primary" disabled={!hasKey || !schedule.trim() || loading} onClick={askGameMaster}>
            {loading ? 'The Game Master is reading…' : 'Send to Game Master'}
          </button>
          <button className="btn" onClick={scoreManually}>
            Score it myself
          </button>
        </div>
        {!hasKey && (
          <p className="small muted" style={{ margin: 0 }}>
            ChatGPT isn't connected yet.{' '}
            <button className="btn small ghost" style={{ padding: 0, color: 'var(--focus)' }} onClick={() => go('settings')}>
              Connect it in Settings
            </button>{' '}
            — or score your week yourself with the rule checklist.
          </p>
        )}
        {error && <div className="notice error small">{error}</div>}
      </div>

      <p className="small muted">
        Stats in play: {STAT_LIST.map((s) => `${s.icon} ${s.name}`).join(' · ')}. Each stat can move at most ±{cap} per
        week. {STATS.soc.icon} Forgot to mention something? The Game Master will ask.
      </p>
    </div>
  );
}
