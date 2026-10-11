import { useMemo, useState } from 'react';
import { DeltaChips, StatChip } from '../components/StatChip';
import { StatHistoryChart } from '../components/StatHistoryChart';
import { longestStreak, weeklySeries } from '../lib/scoring';
import { toWeekId, weekLabel } from '../lib/week';
import { useGame } from '../state/store';
import type { EventSource } from '../types';

const SOURCE_LABEL: Record<EventSource, string> = {
  checkin: 'Check-in',
  task: 'Task',
  achievement: 'Achievement',
  adjust: 'Adjustment',
};

export function HistoryPage() {
  const { state, dispatch } = useGame();
  const currentWeek = toWeekId(new Date(), state.settings.weekStartsOn);
  const points = useMemo(() => weeklySeries(state, currentWeek), [state, currentWeek]);
  const checkins = [...state.checkins].sort((a, b) => b.weekId.localeCompare(a.weekId));
  const [filter, setFilter] = useState<EventSource | 'all'>('all');
  const ledger = [...state.ledger].reverse().filter((e) => filter === 'all' || e.source === filter);

  return (
    <div>
      <section className="section card">
        <h2>Stats over time</h2>
        <StatHistoryChart points={points} />
        <p className="small muted" style={{ marginTop: 8 }}>
          {state.checkins.length} check-ins · longest streak {longestStreak(state.checkins.map((c) => c.weekId))} weeks ·{' '}
          {state.ledger.length} events
        </p>
      </section>

      <section className="section">
        <h2>Weekly check-ins</h2>
        {checkins.length === 0 && <p className="muted">No check-ins yet.</p>}
        <div className="stack">
          {checkins.map((c) => (
            <details key={c.id} className="card">
              <summary>
                <span className="spread" style={{ display: 'inline-flex', width: 'calc(100% - 24px)' }}>
                  <strong>{weekLabel(c.weekId)}</strong>
                  <DeltaChips deltas={c.applied} />
                </span>
              </summary>
              <div className="stack" style={{ marginTop: 12 }}>
                <span className="small muted">
                  {c.mode === 'ai' ? '🧙 Scored by the Game Master' : '✍️ Scored manually'} ·{' '}
                  {new Date(c.createdAt).toLocaleString()}
                </span>
                {c.summary && <p style={{ margin: 0 }}>{c.summary}</p>}
                {c.changes.length > 0 && (
                  <div>
                    {c.changes.map((ch, i) => (
                      <div key={i} className="change-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
                        <StatChip id={ch.statId} delta={ch.delta} />
                        <span className="small">{ch.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.questions.length > 0 && (
                  <div className="small">
                    {c.questions.map((q) => (
                      <div key={q.id}>
                        <StatChip id={q.statId} /> {q.question} — <strong>{q.answer}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {c.schedule && (
                  <details>
                    <summary className="small">What you sent</summary>
                    <pre className="card flat small" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
                      {c.schedule}
                    </pre>
                  </details>
                )}
                <button
                  className="btn small danger"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() =>
                    confirm(`Undo the check-in for ${weekLabel(c.weekId)}? Its stat changes will be removed.`) &&
                    dispatch({ type: 'undoCheckIn', checkinId: c.id })
                  }
                >
                  Undo this check-in
                </button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="section card">
        <div className="spread">
          <h2>Adventure log</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as EventSource | 'all')} style={{ width: 'auto' }} aria-label="Filter events">
            <option value="all">All events</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {ledger.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <ul className="feed">
            {ledger.map((e) => (
              <li key={e.id}>
                <span>
                  {e.title}
                  <br />
                  <span className="small muted">
                    {SOURCE_LABEL[e.source]} · {new Date(e.at).toLocaleString()}
                  </span>
                </span>
                <span className="row" style={{ justifyContent: 'flex-end' }}>
                  <DeltaChips deltas={e.deltas} />
                  {e.source !== 'checkin' && (
                    <button
                      className="btn small ghost danger"
                      aria-label="Remove event"
                      onClick={() => confirm(`Remove "${e.title}"?`) && dispatch({ type: 'deleteEvent', id: e.id })}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
