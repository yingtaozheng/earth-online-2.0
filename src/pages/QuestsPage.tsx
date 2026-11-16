import { useState } from 'react';
import { DeltaChips, StatChip } from '../components/StatChip';
import { STATS, STAT_LIST } from '../data/defaults';
import { uid } from '../lib/id';
import { OpenAIError, suggestQuests } from '../lib/openai';
import {
  achievementProgressFor,
  isTaskDone,
  laterTierIds,
  nextStatGoal,
  statsWeakestFirst,
  unlockedAchievementIds,
} from '../lib/scoring';
import { toWeekId } from '../lib/week';
import { useCharacter, useGame } from '../state/store';
import type { Achievement, AchievementCondition, StatId, Task } from '../types';
import type { Tab } from '../App';

export function QuestsPage({ go }: { go: (tab: Tab) => void }) {
  return (
    <div>
      <SuggestionsSection go={go} />
      <TasksSection />
      <AchievementsSection />
    </div>
  );
}

function SuggestionsSection({ go }: { go: (tab: Tab) => void }) {
  const { state, dispatch } = useGame();
  const { stats } = useCharacter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empty, setEmpty] = useState(false);
  const hasKey = Boolean(state.settings.openaiApiKey);
  const weakest = statsWeakestFirst(stats).slice(0, 2);

  async function ask() {
    setError('');
    setEmpty(false);
    setLoading(true);
    try {
      const suggestions = await suggestQuests(state, toWeekId(new Date(), state.settings.weekStartsOn));
      dispatch({ type: 'setSuggestions', suggestions });
      setEmpty(suggestions.length === 0);
    } catch (e) {
      setError(e instanceof OpenAIError ? e.message : `Something went wrong: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <h2>Quests from the Game Master</h2>
      <div className="gm">
        <div className="avatar" aria-hidden>
          🧙
        </div>
        <div className="bubble stack" style={{ gap: 10 }}>
          <span>
            I'll look at your recent weeks and your stats, then propose quests that fit your routine and help your
            weakest stats catch up.
          </span>
          <div className="row small">
            <span className="muted">Needs the most work:</span>
            {weakest.map((id) => {
              const goal = nextStatGoal(state, id);
              return (
                <span className="row" key={id} style={{ gap: 4 }}>
                  <StatChip id={id} />
                  <span className="mono">{stats[id]}</span>
                  {goal && <span className="muted">→ {goal.target}</span>}
                </span>
              );
            })}
          </div>
          <div className="row">
            <button className="btn primary" disabled={!hasKey || loading} onClick={ask}>
              {loading ? 'Thinking…' : state.suggestions.length ? 'Suggest different quests' : 'Suggest quests for me'}
            </button>
            {!hasKey && (
              <span className="small muted">
                ChatGPT isn't connected yet.{' '}
                <button className="btn small ghost" style={{ padding: 0, color: 'var(--focus)' }} onClick={() => go('settings')}>
                  Connect it in Settings
                </button>
              </span>
            )}
          </div>
          {error && <div className="notice error small">{error}</div>}
          {empty && <span className="small muted">Nothing new this time. Try again after your next check-in.</span>}
        </div>
      </div>

      {state.suggestions.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <ul className="feed">
            {state.suggestions.map((s) => (
              <li key={s.id} className="suggestion">
                <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <span className="row">
                    <strong>{s.title}</strong>
                    <StatChip id={s.statId} delta={s.points} />
                    <span className="chip">{s.repeat === 'weekly' ? '↻ weekly' : 'once'}</span>
                  </span>
                  {s.reason && <span className="small muted">{s.reason}</span>}
                </span>
                <span className="row">
                  <button className="btn small primary" onClick={() => dispatch({ type: 'acceptSuggestion', id: s.id })}>
                    Accept
                  </button>
                  <button className="btn small ghost" onClick={() => dispatch({ type: 'dismissSuggestion', id: s.id })}>
                    Dismiss
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TasksSection() {
  const { state, dispatch } = useGame();
  const weekId = toWeekId(new Date(), state.settings.weekStartsOn);
  const [adding, setAdding] = useState(false);
  const tasks = [...state.tasks].sort(
    (a, b) => Number(isTaskDone(a, state.ledger, weekId)) - Number(isTaskDone(b, state.ledger, weekId)),
  );

  return (
    <section className="section">
      <div className="spread">
        <h2>Tasks</h2>
        <button className="btn small" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : '+ New task'}
        </button>
      </div>
      <p className="small muted">
        Side quests for bonus points. Weekly tasks reset every week; one-time tasks stay done.
      </p>
      {adding && (
        <TaskForm
          onSave={(task) => {
            dispatch({ type: 'saveTask', task });
            setAdding(false);
          }}
        />
      )}
      <div className="card">
        {tasks.length === 0 && <p className="muted">No tasks yet. Add one!</p>}
        <ul className="feed">
          {tasks.map((t) => {
            const done = isTaskDone(t, state.ledger, weekId);
            return (
              <li key={t.id} className={`task ${done ? 'done' : ''}`}>
                <label className="inline" style={{ flex: 1, color: 'var(--text)', fontSize: 15 }}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => dispatch({ type: done ? 'uncompleteTask' : 'completeTask', id: t.id })}
                  />
                  <span className="task-title">{t.title}</span>
                </label>
                <span className="row">
                  <StatChip id={t.statId} delta={t.points} />
                  <span className="chip">{t.repeat === 'weekly' ? '↻ weekly' : 'once'}</span>
                  <button
                    className="btn small ghost danger"
                    aria-label={`Delete ${t.title}`}
                    onClick={() => confirm(`Delete task "${t.title}"?`) && dispatch({ type: 'deleteTask', id: t.id })}
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function TaskForm({ onSave }: { onSave: (task: Task) => void }) {
  const [title, setTitle] = useState('');
  const [statId, setStatId] = useState<StatId>('str');
  const [points, setPoints] = useState(1);
  const [repeat, setRepeat] = useState<Task['repeat']>('weekly');
  return (
    <form
      className="card flat stack"
      style={{ marginBottom: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ id: uid('task-'), title: title.trim(), statId, points, repeat, createdAt: new Date().toISOString() });
      }}
    >
      <label>
        Task
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Go to the gym 3 times" autoFocus />
      </label>
      <div className="field-row">
        <StatSelect value={statId} onChange={setStatId} />
        <label>
          Points
          <input type="number" min={1} max={10} value={points} onChange={(e) => setPoints(Number(e.target.value) || 1)} />
        </label>
        <label>
          Repeats
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Task['repeat'])}>
            <option value="weekly">Every week</option>
            <option value="once">Once</option>
          </select>
        </label>
      </div>
      <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>
        Add task
      </button>
    </form>
  );
}

function StatSelect({ value, onChange, label = 'Stat' }: { value: StatId; onChange: (id: StatId) => void; label?: string }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as StatId)}>
        {STAT_LIST.map((s) => (
          <option key={s.id} value={s.id}>
            {s.icon} {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function conditionLabel(c: AchievementCondition): string {
  switch (c.kind) {
    case 'manual':
      return 'Unlock manually';
    case 'checkins':
      return `${c.count} check-ins`;
    case 'streak':
      return `${c.weeks}-week streak`;
    case 'statReaches':
      return `${STATS[c.statId].name} ${c.value}`;
    case 'allStatsReach':
      return `All stats ${c.value}`;
    case 'tasksCompleted':
      return `${c.count} tasks`;
    case 'level':
      return `Level ${c.level}`;
  }
}

function AchievementsSection() {
  const { state, dispatch } = useGame();
  const [adding, setAdding] = useState(false);
  const unlocked = unlockedAchievementIds(state.ledger);
  const progressOf = achievementProgressFor(state);
  const unlockedAt = (id: string) => state.ledger.find((e) => e.source === 'achievement' && e.refId === id)?.at;
  const [showAll, setShowAll] = useState(false);
  // Stat milestones come in tiers; until asked, only the next tier of each is listed.
  const later = laterTierIds(state.achievements, unlocked);
  const ratio = (a: Achievement) => {
    const p = progressOf(a);
    return p ? Math.min(1, p.current / p.target) : 0;
  };
  // Unlocked first, then the locked ones closest to done.
  const sorted = state.achievements
    .filter((a) => showAll || !later.has(a.id))
    .sort((a, b) => Number(unlocked.has(b.id)) - Number(unlocked.has(a.id)) || ratio(b) - ratio(a));

  return (
    <section className="section">
      <div className="spread">
        <h2>
          Achievements <span className="muted small">({unlocked.size}/{state.achievements.length})</span>
        </h2>
        <button className="btn small" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : '+ New achievement'}
        </button>
      </div>
      <p className="small muted">
        Big milestones with big rewards. Most unlock automatically; personal goals you unlock yourself. Each stat has
        milestones at 15, 20 and 30, and getting every stat there earns a bonus to all six.
      </p>
      {adding && (
        <AchievementForm
          onSave={(achievement) => {
            dispatch({ type: 'saveAchievement', achievement });
            setAdding(false);
          }}
        />
      )}
      <div className="grid grid-2">
        {sorted.map((a) => {
          const isUnlocked = unlocked.has(a.id);
          const p = progressOf(a);
          const at = unlockedAt(a.id);
          return (
            <div key={a.id} className={`card ach ${isUnlocked ? 'unlocked' : 'locked'}`}>
              <div className="badge" aria-hidden>
                {a.icon}
              </div>
              <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                <div className="spread">
                  <strong>{a.title}</strong>
                  <span className="chip">{conditionLabel(a.condition)}</span>
                </div>
                <span className="small muted">{a.description}</span>
                <div className="row small">
                  Reward: <DeltaChips deltas={a.reward} />
                </div>
                {isUnlocked ? (
                  <span className="small good">✓ Unlocked {at ? new Date(at).toLocaleDateString() : ''}</span>
                ) : p ? (
                  <>
                    <div className="bar" role="progressbar" aria-valuenow={p.current} aria-valuemax={p.target}>
                      <span style={{ width: `${Math.min(1, p.current / p.target) * 100}%` }} />
                    </div>
                    <span className="small muted mono">
                      {Math.min(p.current, p.target)}/{p.target}
                    </span>
                  </>
                ) : null}
                <div className="row">
                  {!isUnlocked && a.condition.kind === 'manual' && (
                    <button className="btn small primary" onClick={() => dispatch({ type: 'unlockAchievement', id: a.id })}>
                      I did it!
                    </button>
                  )}
                  {isUnlocked && a.condition.kind === 'manual' && (
                    <button className="btn small ghost" onClick={() => dispatch({ type: 'relockAchievement', id: a.id })}>
                      Undo unlock
                    </button>
                  )}
                  <button
                    className="btn small ghost danger"
                    onClick={() =>
                      confirm(`Delete achievement "${a.title}"? Points already earned stay.`) &&
                      dispatch({ type: 'deleteAchievement', id: a.id })
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {later.size > 0 && (
        <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show next milestones only' : `Show ${later.size} later milestones`}
        </button>
      )}
    </section>
  );
}

function AchievementForm({ onSave }: { onSave: (a: Achievement) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🏆');
  const [kind, setKind] = useState<AchievementCondition['kind']>('manual');
  const [target, setTarget] = useState(5);
  const [condStat, setCondStat] = useState<StatId>('str');
  const [rewardStat, setRewardStat] = useState<StatId>('str');
  const [rewardPts, setRewardPts] = useState(3);

  const condition = (): AchievementCondition => {
    switch (kind) {
      case 'manual':
        return { kind };
      case 'checkins':
      case 'tasksCompleted':
        return { kind, count: target };
      case 'streak':
        return { kind, weeks: target };
      case 'level':
        return { kind, level: target };
      case 'statReaches':
        return { kind, statId: condStat, value: target };
      case 'allStatsReach':
        return { kind, value: target };
    }
  };

  return (
    <form
      className="card flat stack"
      style={{ marginBottom: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({
          id: uid('ach-'),
          title: title.trim(),
          description: description.trim(),
          icon: icon || '🏆',
          condition: condition(),
          reward: { [rewardStat]: rewardPts },
        });
      }}
    >
      <div className="field-row">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. First 5K" autoFocus />
        </label>
        <label>
          Icon (emoji)
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
        </label>
      </div>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What counts as done?" />
      </label>
      <div className="field-row">
        <label>
          Unlocks when
          <select value={kind} onChange={(e) => setKind(e.target.value as AchievementCondition['kind'])}>
            <option value="manual">I mark it done</option>
            <option value="statReaches">A stat reaches…</option>
            <option value="allStatsReach">Every stat reaches…</option>
            <option value="streak">Check-in streak of… weeks</option>
            <option value="checkins">Total check-ins…</option>
            <option value="tasksCompleted">Tasks completed…</option>
            <option value="level">Character level…</option>
          </select>
        </label>
        {kind === 'statReaches' && <StatSelect value={condStat} onChange={setCondStat} />}
        {kind !== 'manual' && (
          <label>
            Target
            <input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} />
          </label>
        )}
      </div>
      <div className="field-row">
        <StatSelect value={rewardStat} onChange={setRewardStat} label="Reward stat" />
        <label>
          Reward points
          <input type="number" min={1} max={20} value={rewardPts} onChange={(e) => setRewardPts(Number(e.target.value) || 1)} />
        </label>
      </div>
      <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>
        Add achievement
      </button>
    </form>
  );
}
