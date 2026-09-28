// Turns posts × days into concrete dated slots, and holds the scheduling rules.
import type { Cell, Evaluation, Person, Post, ShiftDef, Slot, State } from './types';
import { DAY, HOUR, addDaysKey, dur, fromKey, parseHM, range, toKey, whenShort, type DateKey } from './time';

export const POST_COLORS = ['#3B82F6', '#EC4899', '#0EA5B7', '#8B5CF6', '#F97316', '#64748B', '#C026D3', '#0F766E'];
export const postColor = (i: number) => POST_COLORS[((i % POST_COLORS.length) + POST_COLORS.length) % POST_COLORS.length];

export const cellKey = (postId: string, date: DateKey, shiftId: string) => `${postId}|${date}|${shiftId}`;

export function shiftTimes(date: DateKey, sh: ShiftDef): { start: number; end: number } {
  const start = fromKey(date, sh.start);
  let end = fromKey(date, sh.end);
  if (parseHM(sh.end) <= parseHM(sh.start)) end = fromKey(addDaysKey(date, 1), sh.end);
  return { start, end };
}

export function boardDays(s: State): DateKey[] {
  return Array.from({ length: s.board.days }, (_, i) => addDaysKey(s.board.start, i));
}

function cellSlot(post: Post, sh: ShiftDef, date: DateKey, cell: Cell | undefined): Slot {
  const { start, end } = shiftTimes(date, sh);
  return {
    key: cellKey(post.id, date, sh.id), kind: 'cell', postId: post.id, shiftId: sh.id, date,
    name: post.name, color: post.color, start, end, need: cell?.need ?? sh.need,
    assigned: cell?.assigned ?? [], blocks: post.blocks, rest: post.rest, allDay: post.allDay, qual: post.qual, note: cell?.note ?? '',
  };
}

export interface Index {
  /** every slot that exists: all board cells + stored cells outside the board + extras */
  all: Map<string, Slot>;
  byPerson: Map<string, Slot[]>;
  people: Map<string, Person>;
}

function buildIndex(s: State): Index {
  const all = new Map<string, Slot>();
  const posts = new Map(s.posts.map(p => [p.id, p]));
  for (const [k, c] of Object.entries(s.cells)) {
    const [pid, date, sid] = k.split('|');
    const post = posts.get(pid); const sh = post?.shifts.find(x => x.id === sid);
    if (post && sh && date) all.set(k, cellSlot(post, sh, date, c));
  }
  for (const date of boardDays(s)) for (const post of s.posts) for (const sh of post.shifts) {
    const k = cellKey(post.id, date, sh.id);
    if (!all.has(k)) all.set(k, cellSlot(post, sh, date, undefined));
  }
  for (const x of s.extras) {
    all.set(x.id, {
      key: x.id, kind: 'extra', postId: null, shiftId: null, date: toKey(x.start),
      name: x.name, color: 4, start: x.start, end: x.end, need: x.need, assigned: x.assigned,
      blocks: true, rest: true, allDay: false, qual: x.qual, note: x.note,
    });
  }
  const byPerson = new Map<string, Slot[]>();
  for (const sl of all.values()) for (const pid of sl.assigned) {
    if (!byPerson.has(pid)) byPerson.set(pid, []);
    byPerson.get(pid)!.push(sl);
  }
  for (const list of byPerson.values()) list.sort(cmpSlot);
  return { all, byPerson, people: new Map(s.people.map(p => [p.id, p])) };
}

const cache = new WeakMap<State, Index>();
export function index(s: State): Index {
  let ix = cache.get(s);
  if (!ix) { ix = buildIndex(s); cache.set(s, ix); }
  return ix;
}
export const cmpSlot = (a: Slot, b: Slot) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name, 'he');
export const slotOf = (s: State, key: string) => index(s).all.get(key);
export const slotsOfPerson = (s: State, pid: string) => index(s).byPerson.get(pid) ?? [];
export const personOf = (s: State, pid: string) => index(s).people.get(pid);

/** slots of one post on one day, in shift order */
export function daySlots(s: State, date: DateKey, post: Post): Slot[] {
  return post.shifts.map(sh => slotOf(s, cellKey(post.id, date, sh.id))!).filter(Boolean);
}
export function extrasOn(s: State, date: DateKey): Slot[] {
  return s.extras.map(x => slotOf(s, x.id)!).filter(sl => sl && sl.date === date).sort(cmpSlot);
}
export function boardSlots(s: State): Slot[] {
  const days = new Set(boardDays(s));
  return [...index(s).all.values()].filter(sl => days.has(sl.date)).sort(cmpSlot);
}

/* ---------------- rules ---------------- */

/**
 * Can this person take this slot? Other slots listed in `ex` are ignored (used when moving).
 * block: unavailable, or already busy at the same time. warn: rest shorter than the minimum.
 */
export function evaluate(s: State, pid: string, slot: Slot, ex: string[] = [], mine?: Slot[]): Evaluation {
  const r: Evaluation = { status: 'ok', kind: '', reasons: [], conflict: null, prev: null, next: null, restBefore: null, restAfter: null, shortest: null };
  // looked up directly (not through the cached index) so this is safe on a draft inside commit()
  const p = s.people.find(x => x.id === pid);
  if (!p) { r.status = 'block'; r.reasons.push('החייל לא נמצא'); return r; }
  for (const u of p.unavail) {
    if (u.start < slot.end && u.end > slot.start) {
      r.status = 'block'; r.kind = 'unavail';
      r.reasons.push(`לא זמין – ${u.reason || 'ללא סיבה'} (עד ${whenShort(u.end)})`);
      return r;
    }
  }
  const others = (mine ?? slotsOfPerson(s, pid)).filter(o => o.key !== slot.key && !ex.includes(o.key));
  const c = others.find(o => o.start < slot.end && o.end > slot.start && ((o.blocks && slot.blocks) || (o.postId !== null && o.postId === slot.postId)));
  if (c) {
    r.status = 'block'; r.kind = 'conflict'; r.conflict = c;
    r.reasons.push(`כבר ב${c.name} ${c.allDay ? '' : range(c.start, c.end)}`.trim());
    return r;
  }
  if (!slot.rest) return r;
  for (const o of others) {
    if (!o.rest) continue;
    if (o.end <= slot.start && (!r.prev || o.end > r.prev.end)) r.prev = o;
    if (o.start >= slot.end && (!r.next || o.start < r.next.start)) r.next = o;
  }
  const min = s.settings.minRest * HOUR;
  if (r.prev) {
    r.restBefore = slot.start - r.prev.end;
    if (min && r.restBefore < min) { r.status = 'warn'; r.shortest = r.restBefore; r.reasons.push(`רק ${dur(r.restBefore)} מנוחה אחרי ${r.prev.name}`); }
  }
  if (r.next) {
    r.restAfter = r.next.start - slot.end;
    if (min && r.restAfter < min) { r.status = 'warn'; r.shortest = Math.min(r.shortest ?? Infinity, r.restAfter); r.reasons.push(`רק ${dur(r.restAfter)} מנוחה לפני ${r.next.name}`); }
  }
  return r;
}

/** rest before each tiring slot of a person, measured against their whole schedule (not just the visible days) */
export function restBefore(s: State, pid: string): Map<string, number> {
  const out = new Map<string, number>();
  const tiring = slotsOfPerson(s, pid).filter(x => x.rest);
  for (let i = 1; i < tiring.length; i++) out.set(tiring[i].key, tiring[i].start - tiring[i - 1].end);
  return out;
}

export interface SlotInfo { people: Person[]; ev: Record<string, Evaluation>; missing: number; warn: number; block: number; noQual: boolean }
export function slotInfo(s: State, slot: Slot): SlotInfo {
  const people = slot.assigned.map(id => personOf(s, id)).filter((p): p is Person => !!p);
  const ev: Record<string, Evaluation> = {}; let warn = 0, block = 0;
  for (const p of people) { const e = evaluate(s, p.id, slot); ev[p.id] = e; if (e.status === 'warn') warn++; if (e.status === 'block') block++; }
  return { people, ev, missing: Math.max(0, slot.need - people.length), warn, block, noQual: !!slot.qual && people.length > 0 && !people.some(p => p.quals.includes(slot.qual)) };
}

export function hoursIn(list: Slot[], a: number, b: number): number {
  let t = 0;
  for (const sl of list) { if (!sl.blocks) continue; const x = Math.max(a, sl.start), y = Math.min(b, sl.end); if (y > x) t += y - x; }
  return t;
}

export interface PersonNow { kind: 'duty' | 'rest' | 'off' | 'free'; label: string; detail: string; short: boolean }
export function personNow(s: State, p: Person, now: number): PersonNow {
  const min = s.settings.minRest * HOUR;
  const u = p.unavail.find(x => x.start <= now && x.end > now);
  if (u) return { kind: 'off', label: 'לא זמין', detail: `${u.reason || ''} עד ${whenShort(u.end)}`.trim(), short: false };
  const mine = slotsOfPerson(s, p.id).filter(x => x.blocks);
  const cur = mine.find(x => x.start <= now && x.end > now);
  if (cur) return { kind: 'duty', label: `ב${cur.name} · עוד ${dur(cur.end - now)}`, detail: `עד ${whenShort(cur.end)}`, short: false };
  let prev: Slot | null = null; for (const x of mine) if (x.end <= now && (!prev || x.end > prev.end)) prev = x;
  const next = mine.find(x => x.start > now);
  if (next) return { kind: 'rest', label: `מנוחה · עוד ${dur(next.start - now)}`, detail: `${next.name} ${whenShort(next.start)}`, short: !!(min && prev && next.start - prev.end < min && next.rest && prev.rest) };
  return { kind: 'free', label: 'פנוי', detail: prev ? `מאז ${whenShort(prev.end)}` : '', short: false };
}

/* ---------------- auto assign ---------------- */

/**
 * Fill empty places in the given slots (by key) with people who are free, available and rested.
 * Prefers the required qualification, then the least loaded over the board, then the longest rest.
 * Mutates the draft state. Never creates a rest warning or a conflict.
 */
export function autoAssign(d: State, keys: string[]): { added: number; left: number } {
  const ix = buildIndex(d);
  const slots = keys.map(k => ix.all.get(k)).filter((x): x is Slot => !!x).sort(cmpSlot);
  const days = boardDays(d);
  const from = fromKey(days[0]) - 2 * DAY, to = fromKey(days[days.length - 1]) + DAY;
  let added = 0, left = 0;
  for (const sl of slots) {
    let missing = sl.need - sl.assigned.length;
    while (missing > 0) {
      const needQ = !!sl.qual && !sl.assigned.some(id => ix.people.get(id)?.quals.includes(sl.qual));
      let best: Person | null = null, bestScore = -Infinity;
      for (const p of d.people) {
        if (sl.assigned.includes(p.id)) continue;
        const mine = ix.byPerson.get(p.id) ?? [];
        const e = evaluate(d, p.id, sl, [], mine);
        if (e.status !== 'ok') continue;
        const load = hoursIn(mine, from, to) / HOUR;
        const rest = Math.min(e.restBefore ?? 48 * HOUR, 48 * HOUR) / HOUR;
        const score = (needQ && p.quals.includes(sl.qual) ? 1000 : 0) - load * 3 + rest * 0.5 + Math.random() * 0.5;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (!best) { left += missing; break; }
      assignInDraft(d, sl, best.id);
      sl.assigned = [...sl.assigned, best.id];
      if (!ix.byPerson.has(best.id)) ix.byPerson.set(best.id, []);
      ix.byPerson.get(best.id)!.push(sl); ix.byPerson.get(best.id)!.sort(cmpSlot);
      added++; missing--;
    }
  }
  return { added, left };
}

/** mutation helpers used inside commit() recipes */
export function assignInDraft(d: State, sl: Slot, pid: string) {
  if (sl.kind === 'extra') { const x = d.extras.find(e => e.id === sl.key); if (x && !x.assigned.includes(pid)) x.assigned.push(pid); return; }
  const c = d.cells[sl.key] ?? (d.cells[sl.key] = { assigned: [] });
  if (!c.assigned.includes(pid)) c.assigned.push(pid);
}
export function unassignInDraft(d: State, key: string, pid: string) {
  const x = d.extras.find(e => e.id === key);
  if (x) { x.assigned = x.assigned.filter(i => i !== pid); return; }
  const c = d.cells[key]; if (c) c.assigned = c.assigned.filter(i => i !== pid);
}
export function clearInDraft(d: State, key: string) {
  const x = d.extras.find(e => e.id === key);
  if (x) { x.assigned = []; return; }
  if (d.cells[key]) d.cells[key].assigned = [];
}

/* ---------------- board summary ---------------- */
export function boardStats(s: State) {
  let slots = 0, filled = 0, warn = 0, block = 0;
  for (const sl of boardSlots(s)) {
    slots += sl.need; filled += Math.min(sl.need, sl.assigned.length);
    const i = slotInfo(s, sl); warn += i.warn; block += i.block;
  }
  return { slots, filled, missing: slots - filled, warn, block };
}
