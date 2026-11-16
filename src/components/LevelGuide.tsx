import { RANKS, STAT_LIST } from '../data/defaults';
import { classTitle, rankTitle, xpForLevel } from '../lib/scoring';
import { useCharacter } from '../state/store';
import { STAT_IDS } from '../types';
import { Modal } from './Modal';
import { statColor } from './StatChip';

/** Reference for everything a character title is made of: rank (from level) and class (from top stat). */
export function LevelGuide({ onClose }: { onClose: () => void }) {
  const { stats, xp, level } = useCharacter();
  const top = Math.max(...STAT_IDS.map((id) => stats[id]));
  const lastLevel = Math.max(RANKS[RANKS.length - 1].level, level + 3);
  const levels = Array.from({ length: lastLevel }, (_, i) => i + 1);

  return (
    <Modal title="Levels & classes" onClose={onClose}>
      <p style={{ margin: 0 }}>
        You are a <strong>Lv {level} {rankTitle(level)} {classTitle(stats)}</strong>. Your <strong>rank</strong> comes
        from your level, and your <strong>class</strong> from your highest stat.
      </p>

      <div>
        <h3>Classes</h3>
        <ul className="feed">
          {STAT_LIST.map((s) => (
            <li key={s.id} className={stats[s.id] === top ? 'current' : ''} style={statColor(s.id)}>
              <span>
                <span aria-hidden>{s.icon}</span> <strong>{s.classTitle}</strong>
              </span>
              <span className="chip">
                <span className="dot" aria-hidden />
                highest stat: {s.name} · {stats[s.id]}
              </span>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Two stats tied for first give a double class, like Sage-Warrior. Three or more tied make you an Adventurer.
          Your class changes whenever a different stat takes the lead.
        </p>
      </div>

      <div>
        <h3>Levels</h3>
        <p className="small muted">
          Every point you gain is 1 XP, and losing points never takes XP away, so levels only go up. You have {xp} XP.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Level</th>
                <th style={{ textAlign: 'left' }}>Rank</th>
                <th>Total XP</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((n) => {
                const startsRank = RANKS.some((r) => r.level === n);
                return (
                  <tr key={n} className={n === level ? 'current' : ''}>
                    <td>
                      Lv {n}
                      {n === level ? ' · you' : ''}
                    </td>
                    <td style={{ textAlign: 'left' }} className={startsRank ? '' : 'muted'}>
                      {startsRank ? <strong>{rankTitle(n)}</strong> : rankTitle(n)}
                    </td>
                    <td>{xpForLevel(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
