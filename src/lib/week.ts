// A week is identified by the local calendar date of its first day, e.g. "2026-10-05".
// Using local dates (not ISO week numbers) keeps Sunday- and Monday-start weeks simple.

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function toWeekId(date: Date, weekStartsOn: 0 | 1): string {
  return formatLocalDate(startOfWeek(date, weekStartsOn));
}

export function weekIdToDate(weekId: string): Date {
  const [y, m, d] = weekId.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addWeeks(weekId: string, n: number): string {
  const d = weekIdToDate(weekId);
  d.setDate(d.getDate() + 7 * n);
  return formatLocalDate(d);
}

/** Exclusive end of the week containing `date` (i.e. the moment the next week starts). */
export function endOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const d = startOfWeek(date, weekStartsOn);
  d.setDate(d.getDate() + 7);
  return d;
}

/** Whole weeks from `a` to `b` (rounded, so DST shifts don't matter). */
export function weeksBetween(a: string, b: string): number {
  return Math.round((weekIdToDate(b).getTime() - weekIdToDate(a).getTime()) / (7 * DAY_MS));
}

export function daysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function weekLabel(weekId: string): string {
  const start = weekIdToDate(weekId);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${shortDate.format(start)} – ${shortDate.format(end)}, ${end.getFullYear()}`;
}

export function shortWeekLabel(weekId: string): string {
  return shortDate.format(weekIdToDate(weekId));
}

/** "2d 04:13:22" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
}
