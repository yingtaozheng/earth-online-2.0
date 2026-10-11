import type { CSSProperties } from 'react';
import { STATS } from '../data/defaults';
import type { StatDeltas, StatId } from '../types';
import { STAT_IDS } from '../types';

export const statColor = (id: StatId) => ({ '--stat-color': `var(--stat-${id})` }) as CSSProperties;

export function StatChip({ id, delta }: { id: StatId; delta?: number }) {
  return (
    <span className="chip" style={statColor(id)}>
      <span className="dot" aria-hidden />
      {STATS[id].abbr}
      {delta !== undefined && (
        <strong className={delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}>
          {delta > 0 ? `+${delta}` : delta}
        </strong>
      )}
    </span>
  );
}

export function DeltaChips({ deltas }: { deltas: StatDeltas }) {
  const ids = STAT_IDS.filter((id) => deltas[id]);
  if (!ids.length) return <span className="muted small">no change</span>;
  return (
    <span className="row">
      {ids.map((id) => (
        <StatChip key={id} id={id} delta={deltas[id]} />
      ))}
    </span>
  );
}
