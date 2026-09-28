// User operations that combine the rules, a confirm step when needed, a commit and a toast.
import { commit, getState } from '../lib/store';
import { assignInDraft, autoAssign, boardSlots, evaluate, personOf, slotOf, slotsOfPerson, unassignInDraft } from '../lib/slots';
import type { Evaluation, Person, Slot, State } from '../lib/types';
import { DAY, HOUR, dur, range, weekday } from '../lib/time';
import { confirmDialog, toast, type DialogItem } from './uiStore';

export const slotLabel = (sl: Slot) => `${sl.name} ${weekday(sl.date)}${sl.allDay ? '' : ' ' + range(sl.start, sl.end)}`;

export interface Candidate { p: Person; e: Evaluation; e2?: Evaluation; from?: Slot; load: number; hasQ: boolean }
export interface Groups { cur: { p: Person; e: Evaluation }[]; ok: Candidate[]; warn: Candidate[]; move: Candidate[]; out: Candidate[] }

/** Everyone, sorted into: free & rested, free with short rest, busy elsewhere but movable, unavailable. */
export function pickerGroups(s: State, sl: Slot): Groups {
  const g: Groups = { cur: [], ok: [], warn: [], move: [], out: [] };
  for (const p of s.people) {
    const e = evaluate(s, p.id, sl);
    if (sl.assigned.includes(p.id)) { g.cur.push({ p, e }); continue; }
    const mine = slotsOfPerson(s, p.id);
    const load = mine.filter(x => x.blocks && x.start < sl.start + 2 * DAY && x.end > sl.start - 2 * DAY).reduce((t, x) => t + (x.end - x.start), 0);
    const row: Candidate = { p, e, load, hasQ: !!sl.qual && p.quals.includes(sl.qual) };
    if (e.status === 'ok') g.ok.push(row);
    else if (e.status === 'warn') g.warn.push(row);
    else if (e.kind === 'conflict' && e.conflict) {
      const e2 = evaluate(s, p.id, sl, [e.conflict.key]);
      if (e2.status === 'block') g.out.push(row); else { row.e2 = e2; row.from = e.conflict; g.move.push(row); }
    } else g.out.push(row);
  }
  const rest = (e: Evaluation) => Math.min(e.restBefore ?? 1e13, 48 * HOUR);
  const f = (a: Candidate, b: Candidate) => (Number(b.hasQ) - Number(a.hasQ)) || (a.load - b.load) || (rest(b.e) - rest(a.e)) || a.p.name.localeCompare(b.p.name, 'he');
  g.ok.sort(f); g.move.sort(f);
  g.warn.sort((a, b) => (b.e.shortest ?? 0) - (a.e.shortest ?? 0));
  g.out.sort((a, b) => a.p.name.localeCompare(b.p.name, 'he'));
  return g;
}

const shortage = (sl: Slot, leaving: number) => Math.max(0, sl.need - (sl.assigned.length - leaving));

/** Assign the chosen people to a slot. Returns true if applied. */
export async function applyPick(slotKey: string, ids: string[]): Promise<boolean> {
  const s = getState(); const sl = slotOf(s, slotKey); if (!sl) return false;
  const g = pickerGroups(s, sl);
  const all = [...g.ok.map(c => ({ ...c, kind: 'ok' as const })), ...g.warn.map(c => ({ ...c, kind: 'warn' as const })), ...g.move.map(c => ({ ...c, kind: 'move' as const }))];
  const chosen = ids.map(id => all.find(c => c.p.id === id)).filter((c): c is (typeof all)[number] => !!c);
  if (!chosen.length) return false;
  const items: DialogItem[] = [];
  for (const c of chosen) {
    if (c.kind === 'warn') items.push({ lv: 'warn', text: `${c.p.name}: ${c.e.reasons.join(' · ')}` });
    if (c.kind === 'move' && c.e2?.status === 'warn') items.push({ lv: 'warn', text: `${c.p.name}: ${c.e2.reasons.join(' · ')}` });
  }
  const bySrc = new Map<string, typeof chosen>();
  for (const c of chosen) if (c.kind === 'move' && c.from) bySrc.set(c.from.key, [...(bySrc.get(c.from.key) ?? []), c]);
  for (const [k, list] of bySrc) {
    const src = slotOf(s, k)!; const m = shortage(src, list.length);
    items.push({ lv: m ? 'bad' : 'info', text: `${list.map(c => c.p.name).join(', ')} ${list.length > 1 ? 'יועברו' : 'יועבר'} מ${slotLabel(src)}. ${m ? `שם ${m === 1 ? 'יחסר אחד' : `יחסרו ${m}`}` : 'שם עדיין מאויש'}` });
  }
  const total = sl.assigned.length + chosen.length;
  if (sl.qual && ![...sl.assigned.map(id => personOf(s, id)), ...chosen.map(c => c.p)].some(p => p?.quals.includes(sl.qual))) items.push({ lv: 'bad', text: `נדרש ${sl.qual} ואין ${sl.qual} בין המשובצים` });
  if (total > sl.need) items.push({ lv: 'info', text: `יהיו ${total} משובצים – יותר מה־${sl.need} שנדרשים` });
  if (items.length && !(await confirmDialog({ title: 'לפני השיבוץ', items, ok: 'שבץ בכל זאת', cancel: 'חזרה' }))) return false;
  commit(d => {
    for (const c of chosen) {
      if (c.kind === 'move' && c.from) unassignInDraft(d, c.from.key, c.p.id);
      assignInDraft(d, sl, c.p.id);
    }
  });
  toast(`${chosen.length === 1 ? `${chosen[0].p.name} שובץ` : `שובצו ${chosen.length}`} – ${slotLabel(sl)}`, { undo: true });
  return true;
}

export interface MoveItem { key: string; pid: string }

/** Move people out of their slots into a target slot, after checking the target. */
export async function moveGroup(items: MoveItem[], targetKey: string): Promise<boolean> {
  const s = getState(); const t = slotOf(s, targetKey); if (!t) return false;
  const plan: (MoveItem & { p: Person })[] = []; const blocked: string[] = []; const warn: string[] = [];
  const byPid = new Map<string, MoveItem[]>();
  for (const it of items) byPid.set(it.pid, [...(byPid.get(it.pid) ?? []), it]);
  for (const [pid, its] of byPid) {
    const p = personOf(s, pid); if (!p) continue;
    const sources = its.map(i => i.key).filter(k => k !== targetKey);
    if (!sources.length) continue;
    if (t.assigned.includes(pid)) { blocked.push(`${p.name}: כבר ב${t.name}`); continue; }
    const e = evaluate(s, pid, t, sources);
    if (e.status === 'block') { blocked.push(`${p.name}: ${e.reasons[0]}`); continue; }
    if (e.status === 'warn') warn.push(`${p.name}: ${e.reasons.join(' · ')}`);
    for (const k of sources) plan.push({ key: k, pid, p });
  }
  if (!plan.length) { toast(blocked[0] ?? 'אין את מי להעביר'); return false; }
  const list: DialogItem[] = [...warn.map(text => ({ lv: 'warn' as const, text })), ...blocked.map(text => ({ lv: 'bad' as const, text: `${text} – לא יועבר` }))];
  const bySrc = new Map<string, number>(); for (const x of plan) bySrc.set(x.key, (bySrc.get(x.key) ?? 0) + 1);
  for (const [k, n] of bySrc) { const src = slotOf(s, k); if (!src) continue; const m = shortage(src, n); if (m) list.push({ lv: 'bad', text: `ב${slotLabel(src)} ${m === 1 ? 'יחסר אחד' : `יחסרו ${m}`}` }); }
  const names = [...new Set(plan.map(x => x.p.name))];
  if (list.length && !(await confirmDialog({ title: `העברה ל${slotLabel(t)}`, text: names.join(', '), items: list, ok: 'העבר', cancel: 'ביטול' }))) return false;
  commit(d => { for (const x of plan) { unassignInDraft(d, x.key, x.pid); assignInDraft(d, t, x.pid); } });
  toast(`${names.length === 1 ? `${names[0]} הועבר` : `הועברו ${names.length}`} ל${slotLabel(t)}`, { undo: true });
  return true;
}

/** Exchange two people between their slots. */
export async function swapPeople(a: MoveItem, b: MoveItem): Promise<boolean> {
  const s = getState(); const sa = slotOf(s, a.key), sb = slotOf(s, b.key);
  const pa = personOf(s, a.pid), pb = personOf(s, b.pid);
  if (!sa || !sb || !pa || !pb) return false;
  const ea = evaluate(s, a.pid, sb, [a.key]), eb = evaluate(s, b.pid, sa, [b.key]);
  const items: DialogItem[] = [];
  for (const [p, e] of [[pa, ea], [pb, eb]] as const) if (e.status !== 'ok') items.push({ lv: e.status === 'block' ? 'bad' : 'warn', text: `${p.name}: ${e.reasons.join(' · ')}` });
  if (items.some(i => i.lv === 'bad')) { toast(items.find(i => i.lv === 'bad')!.text); return false; }
  if (items.length && !(await confirmDialog({ title: 'החלפה', text: `${pa.name} ↔ ${pb.name}`, items, ok: 'החלף', cancel: 'ביטול' }))) return false;
  commit(d => {
    unassignInDraft(d, a.key, a.pid); unassignInDraft(d, b.key, b.pid);
    assignInDraft(d, sb, a.pid); assignInDraft(d, sa, b.pid);
  });
  toast(`${pa.name} ↔ ${pb.name}`, { undo: true });
  return true;
}

export function removeFrom(key: string, pid: string) {
  const s = getState(); const sl = slotOf(s, key), p = personOf(s, pid); if (!sl || !p) return;
  commit(d => unassignInDraft(d, key, pid));
  toast(`${p.name} הוסר מ${slotLabel(sl)}`, { undo: true });
}

export async function autoFill(keys?: string[]) {
  const s = getState();
  const targets = (keys ? keys.map(k => slotOf(s, k)).filter((x): x is Slot => !!x) : boardSlots(s)).filter(sl => sl.need > sl.assigned.length);
  const missing = targets.reduce((t, sl) => t + sl.need - sl.assigned.length, 0);
  if (!missing) { toast('אין מקומות פנויים'); return; }
  if (!keys && !(await confirmDialog({
    title: `למלא ${missing} מקומות פנויים?`,
    text: `המערכת תבחר רק חיילים פנויים, זמינים, ועם לפחות ${dur(s.settings.minRest * HOUR)} מנוחה לפני ואחרי משמרות. עדיפות למי שעבד פחות. אפשר לבטל מיד אחרי.`,
    ok: 'מלא אוטומטית',
  }))) return;
  let r = { added: 0, left: 0 };
  commit(d => { r = autoAssign(d, targets.map(x => x.key)); if (!r.added) return false; });
  if (!r.added) toast('אין חיילים פנויים עם מספיק מנוחה');
  else toast(`שובצו ${r.added}${r.left ? ` · ${r.left} מקומות נשארו פנויים – אין מי שנח מספיק` : ' · הכל מאויש'}`, { undo: true });
}
