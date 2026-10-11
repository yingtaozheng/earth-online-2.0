import { useEffect, useMemo, useRef, useState } from 'react';
import { STATS } from '../data/defaults';
import type { WeekPoint } from '../lib/scoring';
import { shortWeekLabel, weekLabel } from '../lib/week';
import type { StatId } from '../types';
import { STAT_IDS } from '../types';
import { statColor } from './StatChip';

const HEIGHT = 280;
const M = { top: 12, right: 16, bottom: 28, left: 36 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = Math.max(1, max - min);
  const step = Math.max(1, Math.ceil(span / count));
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function StatHistoryChart({ points }: { points: WeekPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [visible, setVisible] = useState<Set<StatId>>(() => new Set(STAT_IDS));
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const shown = STAT_IDS.filter((id) => visible.has(id));
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;

  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = points.flatMap((p) => shown.map((id) => p.values[id]));
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 10;
    const t = niceTicks(Math.max(0, lo - 1), hi + 1);
    return { yMin: t[0], yMax: Math.max(t[t.length - 1], hi + 1), ticks: t };
  }, [points, shown]);

  const x = (i: number) => (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const showMarkers = points.length <= 16;
  const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))));

  const toggle = (id: StatId) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else next.add(id);
      return next;
    });

  const onPointer = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = points.length === 1 ? 0 : Math.round((px / rect.width) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hp = hover !== null ? points[hover] : null;
  const tooltipLeft = hover !== null ? M.left + x(hover) : 0;

  return (
    <div>
      <div className="spread">
        <div className="legend" role="group" aria-label="Show or hide stats">
          {STAT_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={visible.has(id)} onClick={() => toggle(id)} style={statColor(id)}>
              <span className="swatch" aria-hidden />
              {STATS[id].name}
            </button>
          ))}
        </div>
        <button type="button" className="btn small ghost" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                {STAT_IDS.map((id) => (
                  <th key={id}>{STATS[id].abbr}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.weekId}>
                  <td>{weekLabel(p.weekId)}</td>
                  {STAT_IDS.map((id) => {
                    const d = p.change[id];
                    return (
                      <td key={id}>
                        {p.values[id]}{' '}
                        {d ? <span className={d > 0 ? 'good' : 'bad'}>({d > 0 ? `+${d}` : d})</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz" ref={ref}>
          <svg width={width} height={HEIGHT} role="img" aria-label="Stat values by week">
            <g transform={`translate(${M.left},${M.top})`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line className="gridline" x1={0} x2={innerW} y1={y(t)} y2={y(t)} />
                  <text className="tick" x={-8} y={y(t)} dy="0.32em" textAnchor="end">
                    {t}
                  </text>
                </g>
              ))}
              <line className="baseline" x1={0} x2={innerW} y1={innerH} y2={innerH} />
              {points.map((p, i) =>
                i % xLabelEvery === 0 || i === points.length - 1 ? (
                  <text key={p.weekId} className="tick" x={x(i)} y={innerH + 18} textAnchor="middle">
                    {shortWeekLabel(p.weekId)}
                  </text>
                ) : null,
              )}

              {hp && <line className="crosshair" x1={x(hover!)} x2={x(hover!)} y1={0} y2={innerH} />}

              {shown.map((id) => (
                <g key={id} style={statColor(id)}>
                  {points.length > 1 && (
                    <path
                      className="series"
                      stroke="var(--stat-color)"
                      d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.values[id])}`).join('')}
                    />
                  )}
                  {points.map((p, i) =>
                    showMarkers || i === hover ? (
                      <circle
                        key={p.weekId}
                        className="marker"
                        cx={x(i)}
                        cy={y(p.values[id])}
                        r={i === hover ? 5 : 4}
                        fill="var(--stat-color)"
                      />
                    ) : null,
                  )}
                </g>
              ))}

              <rect
                x={-M.left / 2}
                y={0}
                width={innerW + M.left / 2 + M.right / 2}
                height={innerH}
                fill="transparent"
                onPointerMove={onPointer}
                onPointerDown={onPointer}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          </svg>

          {hp && (
            <div
              className="tooltip"
              style={{
                top: M.top,
                left: tooltipLeft > width / 2 ? undefined : tooltipLeft + 12,
                right: tooltipLeft > width / 2 ? width - tooltipLeft + 12 : undefined,
              }}
            >
              <strong>{weekLabel(hp.weekId)}</strong>
              {shown.map((id) => {
                const d = hp.change[id];
                return (
                  <div className="t-row" key={id} style={statColor(id)}>
                    <span>
                      <span className="swatch" aria-hidden />
                      {STATS[id].name}
                    </span>
                    <span className="mono">
                      {hp.values[id]}
                      {d ? <span className={d > 0 ? 'good' : 'bad'} style={{ marginLeft: 6 }}>{d > 0 ? `+${d}` : d}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
