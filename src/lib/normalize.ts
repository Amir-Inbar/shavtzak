// Validates anything that comes from storage, an imported file or the site. Pure – also used by the MCP server.
import type { Cell, Extra, Person, Post, State } from './types';
import { uid } from './time';
import { defaults } from './defaults';

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const hmOk = (v: unknown, d: string) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : d);

/** Validate anything that comes from storage or an imported file. */
export function normalize(raw: unknown): State {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = defaults();
  const s: State = {
    v: 3,
    settings: { ...d.settings, ...(o.settings || {}) },
    board: {
      start: /^\d{4}-\d{2}-\d{2}$/.test(o.board?.start) ? o.board.start : d.board.start,
      days: Math.min(14, Math.max(1, Math.round(num(o.board?.days, d.board.days)))),
    },
    posts: Array.isArray(o.posts) ? o.posts.filter(Boolean).map((p: any, i: number): Post => ({
      id: str(p.id) || uid(),
      name: str(p.name).trim() || 'עמדה',
      color: Math.max(0, Math.round(num(p.color, i))),
      shifts: (Array.isArray(p.shifts) ? p.shifts : []).filter(Boolean).map((x: any) => ({
        id: str(x.id) || uid(), start: hmOk(x.start, '08:00'), end: hmOk(x.end, '16:00'), need: Math.max(0, Math.round(num(x.need, 1))),
      })),
      allDay: !!p.allDay, blocks: p.blocks !== false, rest: p.rest !== false, qual: str(p.qual),
      roles: (Array.isArray(p.roles) ? p.roles : []).filter(Boolean).map((r: any) => ({
        id: str(r.id) || uid(), name: str(r.name).trim() || 'תפקיד', qual: str(r.qual).trim(), count: Math.max(0, Math.round(num(r.count, 1))),
      })),
      dayStart: hmOk(p.dayStart, '00:00'),
      within: p.within && str(p.within.postId) ? { postId: str(p.within.postId), roleId: p.within.roleId ? str(p.within.roleId) : null } : null,
    })) : [],
    people: Array.isArray(o.people) ? o.people.filter(Boolean).map((p: any): Person => ({
      id: str(p.id) || uid(), name: str(p.name).trim() || 'ללא שם', team: str(p.team),
      rank: str(p.rank).trim(), piece: (['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].includes(p.piece) ? p.piece : '') as Person['piece'],
      quals: Array.isArray(p.quals) ? p.quals.map((q: unknown) => str(q)).filter(Boolean) : [],
      unavail: Array.isArray(p.unavail) ? p.unavail.filter((u: any) => u && num(u.end) > num(u.start))
        .map((u: any) => ({ id: str(u.id) || uid(), start: num(u.start), end: num(u.end), reason: str(u.reason) })) : [],
      note: str(p.note),
    })) : [],
    cells: {},
    extras: [],
    shareMeta: o.shareMeta && typeof o.shareMeta === 'object' ? o.shareMeta : {},
    sample: !!o.sample,
  };
  // ids must be unique, or later entries silently shadow earlier ones (hand-edited or merged backups)
  const seen = new Set<string>();
  const fresh = (id: string) => { let v = id; while (seen.has(v)) v = uid(); seen.add(v); return v; };
  for (const p of s.posts) { p.id = fresh(p.id); const sh = new Set<string>(); for (const x of p.shifts) { while (sh.has(x.id)) x.id = uid(); sh.add(x.id); } }
  for (const p of s.people) p.id = fresh(p.id);
  s.settings.minRest = Math.max(0, num(s.settings.minRest, 6));
  delete (s.settings as unknown as Record<string, unknown>).theme;
  const ids = new Set(s.people.map(p => p.id));
  const clean = (a: unknown) => [...new Set(Array.isArray(a) ? a.map(x => str(x)) : [])].filter(id => ids.has(id));
  if (o.cells && typeof o.cells === 'object') {
    for (const [k, c] of Object.entries<any>(o.cells)) {
      if (!c) continue;
      const cell: Cell = { assigned: clean(c.assigned) };
      if (c.need != null) cell.need = Math.max(0, Math.round(num(c.need)));
      if (c.note) cell.note = str(c.note);
      if (c.roleOf && typeof c.roleOf === 'object') {
        cell.roleOf = {};
        for (const [pid, rid] of Object.entries(c.roleOf)) if (cell.assigned.includes(pid)) cell.roleOf[pid] = str(rid);
      }
      s.cells[k] = cell;
    }
  }
  if (Array.isArray(o.extras)) {
    s.extras = o.extras.filter((x: any) => x && num(x.end) > num(x.start)).map((x: any): Extra => ({
      id: fresh(str(x.id) || uid()), name: str(x.name) || 'משימה', start: num(x.start), end: num(x.end),
      need: Math.max(0, Math.round(num(x.need, 1))), qual: str(x.qual), note: str(x.note), assigned: clean(x.assigned),
    }));
  }
  return s;
}
