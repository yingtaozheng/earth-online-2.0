import { useState } from 'react';
import { DeltaChips, statColor } from '../components/StatChip';
import { STAT_LIST } from '../data/defaults';
import { classTitle, currentStreak, weekDeltas } from '../lib/scoring';
import { useNow } from '../lib/useNow';
import { toWeekId, weekLabel } from '../lib/week';
import { useCharacter, useGame } from '../state/store';
import type { StatId } from '../types';
import type { Tab } from '../App';

export function CharacterPage({ go }: { go: (tab: Tab) => void }) {
  const { state, dispatch } = useGame();
  const { stats, xp, level, xpIntoLevel, xpForNext, progress } = useCharacter();
  const now = useNow(60_000);
  const weekId = toWeekId(now, state.settings.weekStartsOn);
  const thisWeek = weekDeltas(state.ledger, weekId);
  const checkedIn = state.checkins.some((c) => c.weekId === weekId);
  const streak = currentStreak(state.checkins.map((c) => c.weekId), weekId);
  const scale = Math.max(20, Math.ceil(Math.max(...Object.values(stats)) / 10) * 10);
  const recent = [...state.ledger].reverse().slice(0, 8);
  const [adjusting, setAdjusting] = useState<StatId | null>(null);

  return (
    <div>
      <section className="section grid grid-2">
        <div className="card hero">
          <div className="avatar" aria-hidden>
            ⚔️
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="spread">
              <div>
                <h1 style={{ margin: 0 }}>{state.settings.characterName}</h1>
                <span className="muted">{classTitle(stats)}</span>
              </div>
              <div className="level" aria-label={`Level ${level}`}>
                Lv {level}
              </div>
            </div>
            <div className="bar" role="progressbar" aria-valuenow={xpIntoLevel} aria-valuemax={xpForNext} aria-label="XP to next level">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="small muted mono">
              {xpIntoLevel}/{xpForNext} XP to Lv {level + 1} · {xp} XP total
            </span>
          </div>
        </div>

        <div className="card stack" style={{ gap: 8 }}>
          <div className="spread">
            <h3 style={{ margin: 0 }}>This week</h3>
            <span className="small muted">{weekLabel(weekId)}</span>
          </div>
          <DeltaChips deltas={thisWeek} />
          <span className="small muted">
            {streak > 0 ? `🔥 ${streak}-week check-in streak` : 'No active streak yet'}
          </span>
          {checkedIn ? (
            <span className="small good">✓ Weekly check-in done</span>
          ) : (
            <button className="btn primary" onClick={() => go('checkin')}>
              Start weekly check-in
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2>Attributes</h2>
        <div className="grid grid-3">
          {STAT_LIST.map((s) => {
            const d = thisWeek[s.id];
            return (
              <div key={s.id} className="card stat stack" style={{ ...statColor(s.id), gap: 8 }}>
                <div className="stat-head">
                  <span>
                    <span aria-hidden>{s.icon}</span> <strong>{s.name}</strong>
                  </span>
                  <span className="small muted">{s.abbr}</span>
                </div>
                <div className="stat-head">
                  <span className="stat-value">{stats[s.id]}</span>
                  {d ? (
                    <span className={`small ${d > 0 ? 'good' : 'bad'}`}>
                      {d > 0 ? '▲ +' : '▼ '}
                      {d} this week
                    </span>
                  ) : (
                    <span className="small muted">— this week</span>
                  )}
                </div>
                <div className="bar" aria-hidden>
                  <span style={{ width: `${(stats[s.id] / scale) * 100}%` }} />
                </div>
                <span className="small muted">{s.description}</span>
                {adjusting === s.id ? (
                  <AdjustForm
                    onDone={(delta, note) => {
                      if (delta) dispatch({ type: 'adjustStat', statId: s.id, delta, note });
                      setAdjusting(null);
                    }}
                  />
                ) : (
                  <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAdjusting(s.id)}>
                    Adjust…
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section card">
        <div className="spread">
          <h2>Recent activity</h2>
          <button className="btn small ghost" onClick={() => go('history')}>
            Full history →
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="muted">
            Your adventure log is empty. Do your first weekly check-in or complete a task to earn points.
          </p>
        ) : (
          <ul className="feed">
            {recent.map((e) => (
              <li key={e.id}>
                <span>
                  {e.title}
                  <br />
                  <span className="small muted">{new Date(e.at).toLocaleString()}</span>
                </span>
                <DeltaChips deltas={e.deltas} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AdjustForm({ onDone }: { onDone: (delta: number, note: string) => void }) {
  const [delta, setDelta] = useState(1);
  const [note, setNote] = useState('');
  return (
    <form
      className="stack"
      style={{ gap: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(delta, note.trim());
      }}
    >
      <div className="row">
        <div className="stepper">
          <button type="button" className="btn" onClick={() => setDelta((d) => d - 1)} aria-label="Decrease">
            −
          </button>
          <output>{delta > 0 ? `+${delta}` : delta}</output>
          <button type="button" className="btn" onClick={() => setDelta((d) => d + 1)} aria-label="Increase">
            +
          </button>
        </div>
        <input placeholder="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
      </div>
      <div className="row">
        <button className="btn small primary" type="submit">
          Apply
        </button>
        <button className="btn small ghost" type="button" onClick={() => onDone(0, '')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
