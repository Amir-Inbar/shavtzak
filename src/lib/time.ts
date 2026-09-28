// Dates, times and Hebrew formatting. All times are local wall-clock milliseconds.
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const pad = (n: number) => String(n).padStart(2, '0');
export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);

/** "2026-09-28" */
export type DateKey = string;

export function dayStart(t: number): number { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function toKey(t: number): DateKey { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function fromKey(k: DateKey, hhmm = '00:00'): number {
  const [y, m, d] = k.split('-').map(Number);
  const [H, M] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, H || 0, M || 0).getTime();
}
export function addDaysKey(k: DateKey, n: number): DateKey { const d = new Date(fromKey(k)); d.setDate(d.getDate() + n); return toKey(d.getTime()); }
export const todayKey = () => toKey(Date.now());
export function daysBetween(a: DateKey, b: DateKey): number { return Math.round((fromKey(b) - fromKey(a)) / DAY); }

export const WD = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const WD_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function hm(t: number): string { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function dm(t: number): string { const d = new Date(t); return `${d.getDate()}.${d.getMonth() + 1}`; }
export function weekday(k: DateKey): string { return WD[new Date(fromKey(k)).getDay()]; }
export function dayName(k: DateKey): string { return `${weekday(k)} ${dm(fromKey(k))}`; }
export function relDay(k: DateKey): string {
  const n = daysBetween(todayKey(), k);
  return n === 0 ? 'היום' : n === 1 ? 'מחר' : n === -1 ? 'אתמול' : '';
}
export function whenShort(t: number): string { const r = relDay(toKey(t)); return r ? `${r} ${hm(t)}` : `${weekday(toKey(t))} ${hm(t)}`; }

/** "4 ש׳" · "3:30 ש׳" · "40 דק׳" */
export function dur(ms: number): string {
  ms = Math.max(0, Math.round(ms / MIN) * MIN);
  const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / MIN);
  if (!h) return `${m} דק׳`;
  return m ? `${h}:${pad(m)} ש׳` : `${h} ש׳`;
}
export const hours = (ms: number) => String(Math.round((ms / HOUR) * 10) / 10);

/** left-to-right isolate, so "05–13" never flips inside Hebrew text */
export const ltr = (s: string) => `⁦${s}⁩`;
/** word joiners keep "05:00–13:00" on one line */
export const range = (a: number, b: number) => ltr(`${hm(a)}\u2060–\u2060${hm(b)}`);

export function parseHM(s: string): number { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); }

/** compact rest for badges: "2ש׳" · "1:30" · "40ד׳" */
export function durShortH(ms: number): string {
  ms = Math.max(0, Math.round(ms / MIN) * MIN);
  const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / MIN);
  if (!h) return `${m}ד׳`;
  return m ? `${h}:${pad(m)}` : `${h}ש׳`;
}
