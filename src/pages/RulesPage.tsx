import { useState } from 'react';
import { statColor } from '../components/StatChip';
import { STAT_LIST } from '../data/defaults';
import { uid } from '../lib/id';
import { xpForLevel } from '../lib/scoring';
import { useGame } from '../state/store';
import type { Rule, StatId } from '../types';

export function RulesPage() {
  const { state, dispatch } = useGame();
  const cap = state.settings.weeklyCapPerStat;

  return (
    <div>
      <section className="section card">
        <h2>How the game works</h2>
        <ul className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
          <li>
            <strong>Weekly check-in.</strong> Once a week, send the Game Master (ChatGPT) your schedule. It applies the
            rules below — e.g. 2 gym sessions → <span className="good">+2 STR</span>; no exercise all week →{' '}
            <span className="bad">−1 STR</span>.
          </li>
          <li>
            <strong>Follow-up questions.</strong> If your schedule says nothing about a stat, the Game Master asks a
            yes/no question instead of guessing (e.g. "Did you meet anyone in person?" Yes +1 / No −1).
          </li>
          <li>
            <strong>Weekly cap.</strong> A check-in moves each stat by at most ±{cap}, so one wild week can't break the
            game.
          </li>
          <li>
            <strong>Tasks</strong> give bonus points when completed. <strong>Achievements</strong> give big rewards for
            milestones.
          </li>
          <li>
            <strong>XP & level.</strong> Every point gained is XP. Losses lower stats but never XP, so your level never
            goes down. Level 2 at {xpForLevel(2)} XP, 3 at {xpForLevel(3)}, 4 at {xpForLevel(4)}, 5 at {xpForLevel(5)},
            10 at {xpForLevel(10)}.
          </li>
          <li>
            <strong>Class.</strong> Your class title comes from your highest stat (Warrior, Sage, Bard…).
          </li>
        </ul>
      </section>

      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Rule book</h2>
        <button
          className="btn small ghost"
          onClick={() => confirm('Restore the default rule book? Your custom rules will be removed.') && dispatch({ type: 'resetRules' })}
        >
          Restore defaults
        </button>
      </div>
      <p className="small muted">
        The Game Master reads these rules word for word, so write conditions the way you'd explain them to a friend.
      </p>

      <div className="grid grid-2">
        {STAT_LIST.map((s) => (
          <StatRules key={s.id} statId={s.id} rules={state.rules.filter((r) => r.statId === s.id)} />
        ))}
      </div>
    </div>
  );
}

function StatRules({ statId, rules }: { statId: StatId; rules: Rule[] }) {
  const { dispatch } = useGame();
  const stat = STAT_LIST.find((s) => s.id === statId)!;
  const [editing, setEditing] = useState<Rule | null>(null);

  const ordered = [...rules].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'gain' ? -1 : 1));

  return (
    <div className="card stat" style={statColor(statId)}>
      <h3>
        {stat.icon} {stat.name}
      </h3>
      <p className="small muted">{stat.description}</p>
      {ordered.map((r) =>
        editing?.id === r.id ? (
          <RuleForm key={r.id} rule={editing} onCancel={() => setEditing(null)} onSave={(rule) => (dispatch({ type: 'saveRule', rule }), setEditing(null))} />
        ) : (
          <div className="rule" key={r.id}>
            <span className={`pts ${r.kind}`}>
              {r.kind === 'gain' ? '+' : '−'}
              {r.points}
            </span>
            <span className="small">
              {r.condition}
              {r.perOccurrence && <span className="muted"> · each time</span>}
            </span>
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="btn small ghost" onClick={() => setEditing(r)} aria-label="Edit rule">
                ✎
              </button>
              <button
                className="btn small ghost danger"
                aria-label="Delete rule"
                onClick={() => confirm('Delete this rule?') && dispatch({ type: 'deleteRule', id: r.id })}
              >
                ✕
              </button>
            </span>
          </div>
        ),
      )}
      {editing && !rules.some((r) => r.id === editing.id) ? (
        <RuleForm rule={editing} onCancel={() => setEditing(null)} onSave={(rule) => (dispatch({ type: 'saveRule', rule }), setEditing(null))} />
      ) : (
        <button
          className="btn small"
          style={{ marginTop: 8 }}
          onClick={() => setEditing({ id: uid('rule-'), statId, kind: 'gain', condition: '', points: 1, perOccurrence: false })}
        >
          + Add rule
        </button>
      )}
    </div>
  );
}

function RuleForm({ rule, onSave, onCancel }: { rule: Rule; onSave: (r: Rule) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(rule);
  const set = (patch: Partial<Rule>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="card flat stack"
      style={{ margin: '8px 0', gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.condition.trim()) onSave({ ...draft, condition: draft.condition.trim() });
      }}
    >
      <label>
        Condition
        <input value={draft.condition} onChange={(e) => set({ condition: e.target.value })} placeholder="e.g. Each yoga class" autoFocus />
      </label>
      <div className="field-row">
        <label>
          Type
          <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Rule['kind'] })}>
            <option value="gain">Gain (+)</option>
            <option value="loss">Loss (−)</option>
          </select>
        </label>
        <label>
          Points
          <input type="number" min={1} max={5} value={draft.points} onChange={(e) => set({ points: Number(e.target.value) || 1 })} />
        </label>
      </div>
      <label className="inline">
        <input type="checkbox" checked={draft.perOccurrence} onChange={(e) => set({ perOccurrence: e.target.checked })} />
        Count each time it happens (not just once per week)
      </label>
      <div className="row">
        <button className="btn small primary" type="submit">
          Save
        </button>
        <button className="btn small ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
