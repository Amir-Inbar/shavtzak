// One table for all posts, like the paper roster: a row for every shift start of the day,
// a column group per post. A 24h shift sits in the row it starts in; the rows it covers show "—".
import type { Post, Slot, State } from './types';
import { daySlots, index } from './slots';
import type { DateKey } from './time';

/** what a post shows in a row: its shift starting there, "continues" from an earlier row, or nothing */
export type CCell = { kind: 'slot'; slot: Slot } | { kind: 'cont' } | { kind: 'none' };
export interface CRow { key: string; date: DateKey; start: number; end: number; cells: CCell[] }

const active = (sl: Slot) => sl.need > 0 || sl.assigned.length > 0;

export function combinedRows(s: State, date: DateKey, posts: Post[]): CRow[] {
  const per = posts.map(p => daySlots(s, date, p).filter(active));
  // row times: every start of a timed shift that day; all-day posts sit in the first row
  const starts = [...new Set(per.flatMap((list, i) => (posts[i].allDay ? [] : list.map(sl => sl.start))))].sort((a, b) => a - b);
  if (!starts.length && per.some(l => l.length)) starts.push(Math.min(...per.flat().map(sl => sl.start)));
  const all = [...index(s).all.values()];
  return starts.map((t, ri) => {
    const here = per.flatMap((list, i) => (posts[i].allDay ? [] : list.filter(sl => sl.start === t)));
    // the row's hours come from its shortest shift (a 13:00–21:00 patrol, not the 24h post starting with it)
    const main = here.sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    const cells: CCell[] = posts.map((p, i) => {
      if (p.allDay) return ri === 0 && per[i][0] ? { kind: 'slot', slot: per[i][0] } : { kind: 'none' };
      const sl = per[i].find(x => x.start === t);
      if (sl) return { kind: 'slot', slot: sl };
      const covering = all.some(x => x.postId === p.id && active(x) && x.start < t && x.end > t);
      return covering ? { kind: 'cont' } : { kind: 'none' };
    });
    return { key: `${date}|${t}`, date, start: t, end: main ? main.end : t, cells };
  });
}

/** columns a post takes in the combined table: one per role, or a single names column */
export const postCols = (p: Post) => (p.roles.length > 1 ? p.roles.length : 1);
