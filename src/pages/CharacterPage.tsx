import { useState } from 'react';
import { LevelGuide } from '../components/LevelGuide';
import { Modal } from '../components/Modal';
import { DeltaChips, statColor } from '../components/StatChip';
import { STATS, STAT_LIST } from '../data/defaults';
import { classTitle, currentStreak, nextStatGoal, rankTitle, weekDeltas } from '../lib/scoring';
import { useNow } from '../lib/useNow';
import { toWeekId, weekLabel } from '../lib/week';
import { useCharacter, useGame } from '../state/store';
import type { StatId } from '../types';
import type { Tab } from '../App';

const RECENT_EVENTS = 5;

export function CharacterPage({ go }: { go: (tab: Tab) => void }) {
  const { state } = useGame();
  const { stats, level, xpIntoLevel, xpForNext, progress } = useCharacter();
  const now = useNow(60_000);
  const weekId = toWeekId(now, state.settings.weekStartsOn);
  const thisWeek = weekDeltas(state.ledger, weekId);
  const checkedIn = state.checkins.some((c) => c.weekId === weekId);
  const streak = currentStreak(state.checkins.map((c) => c.weekId), weekId);
  const scale = Math.max(20, Math.ceil(Math.max(...Object.values(stats)) / 10) * 10);
  const recent = [...state.ledger].reverse().slice(0, RECENT_EVENTS);
  const [guideOpen, setGuideOpen] = useState(false);
  const [detail, setDetail] = useState<StatId | null>(null);

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
                <button className="link" onClick={() => setGuideOpen(true)} title="See all levels and classes">
                  {rankTitle(level)} {classTitle(stats)} ›
                </button>
              </div>
              <div className="level" aria-label={`Level ${level}`}>
                Lv {level}
              </div>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-valuenow={xpIntoLevel}
              aria-valuemax={xpForNext}
              aria-label="XP to next level"
              title={`${xpIntoLevel}/${xpForNext} XP to Lv ${level + 1}`}
            >
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="small muted mono">
              {xpForNext - xpIntoLevel} XP to Lv {level + 1}
            </span>
          </div>
        </div>

        <div className="card stack" style={{ gap: 8 }}>
          <div className="spread">
            <h3 style={{ margin: 0 }}>This week</h3>
            <span className="small muted">{weekLabel(weekId)}</span>
          </div>
          <DeltaChips deltas={thisWeek} />
          <span className="small muted">{streak > 0 ? `🔥 ${streak}-week streak` : 'No streak yet'}</span>
          {checkedIn ? (
            <button className="btn big" onClick={() => go('checkin')}>
              <span className="good">✓</span> Checked in this week · redo
            </button>
          ) : (
            <button className="btn big primary" onClick={() => go('checkin')}>
              🧙 Start weekly check-in
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <div className="spread">
          <h2>Attributes</h2>
          <span className="small muted">Select a stat for details</span>
        </div>
        <div className="grid grid-stats">
          {STAT_LIST.map((s) => {
            const d = thisWeek[s.id];
            return (
              <button
                key={s.id}
                className="card stat stat-btn"
                style={statColor(s.id)}
                onClick={() => setDetail(s.id)}
                title={s.description}
              >
                <span className="stat-head">
                  <span>
                    <span aria-hidden>{s.icon}</span> {s.name}
                  </span>
                  {d ? (
                    <span className={`small ${d > 0 ? 'good' : 'bad'}`}>
                      {d > 0 ? '▲ +' : '▼ '}
                      {d}
                    </span>
                  ) : null}
                </span>
                <span className="stat-value">{stats[s.id]}</span>
                <span className="bar" aria-hidden>
                  <span style={{ width: `${(stats[s.id] / scale) * 100}%` }} />
                </span>
              </button>
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
          <p className="muted">Nothing yet. Do your first weekly check-in or complete a task to earn points.</p>
        ) : (
          <ul className="feed">
            {recent.map((e) => (
              <li key={e.id} title={new Date(e.at).toLocaleString()}>
                <span>{e.title}</span>
                <DeltaChips deltas={e.deltas} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {guideOpen && <LevelGuide onClose={() => setGuideOpen(false)} />}
      {detail && <StatDetail statId={detail} thisWeek={thisWeek[detail] ?? 0} go={go} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Everything about one stat that the main page leaves out: goal, rules, and manual adjustment. */
function StatDetail({
  statId,
  thisWeek,
  go,
  onClose,
}: {
  statId: StatId;
  thisWeek: number;
  go: (tab: Tab) => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useGame();
  const { stats } = useCharacter();
  const stat = STATS[statId];
  const value = stats[statId];
  const goal = nextStatGoal(state, statId);
  const best = Math.max(...Object.values(stats));
  const rules = state.rules.filter((r) => r.statId === statId);
  const [adjusting, setAdjusting] = useState(false);

  return (
    <Modal
      title={
        <>
          <span aria-hidden>{stat.icon}</span> {stat.name}
        </>
      }
      onClose={onClose}
    >
      <div className="stat stat-summary" style={statColor(statId)}>
        <span className="stat-value">{value}</span>
        <span className="small muted">
          {stat.description}
          <br />
          {thisWeek ? `${thisWeek > 0 ? '+' : ''}${thisWeek} this week` : 'No change this week'}
          {value === best ? ' · your top stat' : ` · ${best - value} behind your top stat`}
        </span>
      </div>

      {goal && (
        <div className="stack" style={{ gap: 6 }}>
          <span>
            🎯 <strong>{goal.achievement.title}</strong> at {goal.target}
            <span className="muted"> · {goal.target - value} to go</span>
          </span>
          <div className="bar stat" style={statColor(statId)} aria-hidden>
            <span style={{ width: `${Math.min(1, value / goal.target) * 100}%` }} />
          </div>
        </div>
      )}

      <div>
        <h3>How it moves</h3>
        {rules.length === 0 && <p className="muted small">No rules for this stat yet.</p>}
        {rules.map((r) => (
          <div className="rule" key={r.id} style={{ gridTemplateColumns: 'auto 1fr' }}>
            <span className={`pts ${r.kind}`}>
              {r.kind === 'gain' ? '+' : '−'}
              {r.points}
            </span>
            <span className="small">{r.condition}</span>
          </div>
        ))}
      </div>

      {adjusting ? (
        <AdjustForm
          onDone={(delta, note) => {
            if (delta) dispatch({ type: 'adjustStat', statId, delta, note });
            setAdjusting(false);
          }}
        />
      ) : (
        <div className="row">
          <button
            className="btn small"
            onClick={() => {
              onClose();
              go('quests');
            }}
          >
            Find quests
          </button>
          <button className="btn small ghost" onClick={() => setAdjusting(true)}>
            Adjust manually…
          </button>
        </div>
      )}
    </Modal>
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
